# Дизайн: вкладка «Обзор» (глобальная аналитика)

**Дата:** 2026-08-21  
**Статус:** Approved

---

## Цель

Новая 5-я вкладка «Обзор» (📊) — единственная точка, где пользователь видит интегрированную картину всех финансов: чистый баланс, активы, обязательства, нагрузку на бюджет и динамику за период. Не дублирует существующую аналитику вкладок — только то, чего нигде больше нет.

---

## Навигация

В `AccountView.ts` добавляется:
- Новый тип режима: `'overview'` добавляется к union `'records' | 'debts' | 'credits' | 'deposits' | 'currency'`
- В выпадающем меню `•••` перед пунктом «Обзор» рендерится `<div class="finance-dropdown-separator">` — визуальный разделитель

```
📄 Записи
💳 Долги
🏦 Кредиты
📈 Депозиты
💱 Валюта
──────────
📊 Обзор
```

Кнопка «Обзор» делает `moreBtn.toggleClass('is-active-mode', true)` как другие «вторичные» вкладки.

---

## Структура вкладки

```
[Период: от ______ до ______]        ← один фильтр на всю вкладку

┌──────────────────────────────────┐
│  KPI-карточки (5 штук, grid)     │  ← снэпшот «сейчас»
└──────────────────────────────────┘

[График 1: Денежный поток]          ← тренды
[График 2: Накопленный баланс]
[График 3: Ежемесячные обязательства]
```

---

## Фильтр периода

- Поля `от` / `до` типа `date` — те же `finance-filter-input` что и в других аналитиках
- Хранится в `ViewState`: новые поля `overviewDateFrom?: string` и `overviewDateTo?: string`
- По умолчанию (если не задан): последние 12 месяцев (вычисляется при рендере)
- Влияет на **все три** графика. KPI-карточки всегда считаются по всем данным (текущее состояние, не зависит от периода)

---

## Снэпшот: 5 KPI-карточек

Рендерятся в grid `repeat(auto-fill, minmax(160px, 1fr))`, используют существующий `finance-stat-card`.

### 1. Чистый баланс

```
Σ FinanceRecord.amount (type='income', isInternal !== true)
− Σ FinanceRecord.amount (type='expense', isInternal !== true)
```

Цвет значения: зелёный если ≥ 0, красный если < 0. i18n-ключ: `overviewNetBalance`.

### 2. Активы

```
Σ deposit.amount  (status='active')
+ Σ getCurrencyBalance(currency) × metrics.averageBuyRate  (для каждой валюты с balance > 0)
+ Σ getDebtRemaining(debt)  (direction='lent', не закрытые)
```

Цвет: зелёный. i18n-ключ: `overviewAssets`.

### 3. Обязательства

```
Σ calculateRemainingPrincipal(credit)  (status='active')
+ Σ getDebtRemaining(debt)  (direction='borrowed', не закрытые)
```

Цвет: красный. i18n-ключ: `overviewLiabilities`.

### 4. Кредитная нагрузка (%)

```
monthlyBurden = Σ credit.monthlyPayment  (status='active')
avgMonthlyIncome = среднее по последним 3 месяцам (полным)
  = Σ income за эти 3 месяца / 3
ratio = monthlyBurden / avgMonthlyIncome × 100
```

Если `avgMonthlyIncome === 0` — показывать `—`.  
Цвет: зелёный < 30%, жёлтый (`--ft-accent` amber) 30–50%, красный > 50%.  
i18n-ключ: `overviewCreditBurden`.

### 5. Ближайшие платежи (30 дней)

```
today = getTodayStr()
deadline = today + 30 дней

Σ CreditPayment.amount  (status='pending', dueDate ∈ [today, deadline])
+ Σ DebtRecord (dueDate ∈ [today, deadline], getDebtRemaining > 0)
  → берём min(getDebtRemaining, debt.originalAmount)
```

Подпись под суммой: `«за следующие 30 дней»`. Цвет: нейтральный или красный если > 0.  
i18n-ключи: `overviewUpcomingPayments`, `overviewNext30Days`.

---

## Тренды: три графика

Используют тот же SVG-движок что и `AnalyticsView`. Вспомогательные функции `svg()`, `fmtShort()`, `createChartTooltip()` выносятся из `AnalyticsView.ts` в новый файл **`src/ui/chartHelpers.ts`** и реэкспортируются — это устраняет дублирование между `AnalyticsView`, `CreditsAnalyticsView`, `DepositsAnalyticsView` и новым `OverviewTab`.

Все три графика горизонтально скроллятся при большом числе месяцев (через существующий паттерн `finance-chart-svg-wrap { overflow-x: auto }`).

---

### График 1: Денежный поток

**Тип:** сгруппированные столбцы + линия нетто  
**Данные:** `FinanceRecord` с `isInternal !== true`, фильтрованные по периоду, группировка по `YYYY-MM`

- Зелёный бар (левый): суммарный доход за месяц
- Красный бар (правый): суммарный расход за месяц
- Серая линия поверх: нетто = доход − расход (точки на оси, соединённые линией)

Tooltip при наведении: `Месяц\nДоход: X\nРасход: Y\nНетто: Z`  
Заголовок секции: `overviewCashFlow`

---

### График 2: Накопленный баланс

**Тип:** line chart с area-fill  
**Данные:** те же `FinanceRecord`, нарастающим итогом по месяцам

```
Для каждого месяца M в периоде:
  point(M) = Σ income (isInternal≠true, date ≤ конец M) − Σ expense (isInternal≠true, date ≤ конец M)
```

Цвет линии: `var(--ft-accent)` (фиолетовый), area-fill: `rgba(124, 58, 237, 0.08)`  
Tooltip: `Месяц\nБаланс: X`  
Заголовок секции: `overviewCumulativeBalance`

---

### График 3: Ежемесячные обязательства

**Тип:** stacked bar  
**Данные:** `FinanceRecord` с `linkedId !== undefined`, фильтрованные по периоду, группировка по месяцу

Стеки:
- `CHART_COLOR_PRINCIPAL` (`#6366f1`): записи, linkedId которых совпадает с `CreditRecord.id` или его платежами
- `CHART_COLOR_EXPENSE` (`#ef4444`): записи, linkedId которых совпадает с `DebtRecord.id`

Определение принадлежности: строим `Set<string>` из всех `credit.id` и `debt.id` при рендере, затем сопоставляем `record.linkedId`.

Tooltip: `Месяц\nКредиты: X\nДолги: Y\nИтого: Z`  
Заголовок секции: `overviewDebtService`

---

## Новые файлы

| Файл | Содержимое |
|---|---|
| `src/tabs/OverviewTab.ts` | Класс `OverviewTab` — рендеринг KPI + 3 графика |
| `src/domain/overviewMetrics.ts` | Чистые функции: `calcNetBalance`, `calcAssets`, `calcLiabilities`, `calcCreditBurden`, `calcUpcomingPayments` |
| `src/ui/chartHelpers.ts` | `svg()`, `fmtShort()`, `createChartTooltip()`, `shortMonth()` — вынесены из `AnalyticsView.ts` |

## Изменяемые файлы

| Файл | Изменения |
|---|---|
| `src/AccountView.ts` | `mode` union +`'overview'`, dropdown-разделитель, `renderOverviewTab()` |
| `src/types.ts` | `ViewState`: `overviewDateFrom?: string`, `overviewDateTo?: string` |
| `src/i18n.ts` | Новые ключи: `overviewTab`, `overviewNetBalance`, `overviewAssets`, `overviewLiabilities`, `overviewCreditBurden`, `overviewUpcomingPayments`, `overviewNext30Days`, `overviewCashFlow`, `overviewCumulativeBalance`, `overviewDebtService` |
| `src/AnalyticsView.ts` | Удалить дублированные helpers, импортировать из `chartHelpers.ts` |
| `styles.css` | Стили для разделителя `finance-dropdown-separator` (если не задан), при необходимости точечные правки |

---

## Что не входит в скоуп

- Прогноз будущего баланса
- Бюджетирование / лимиты по категориям
- Экспорт/импорт аналитики
- Кросс-счётные данные (каждый аккаунт независим)
- Уведомления о просроченных платежах
