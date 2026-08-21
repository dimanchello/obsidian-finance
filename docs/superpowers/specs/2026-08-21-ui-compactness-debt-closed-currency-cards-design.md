# Дизайн: компактность аналитики, индикация закрытых долгов, валютные карточки

**Дата:** 2026-08-21  
**Статус:** Approved

---

## Обзор

Три независимых улучшения UI:

1. Убрать лишний вертикальный воздух в аналитике кредитов.
2. Визуально выделять закрытые долги (остаток = 0) фоном и бейджем.
3. Переработать карточки баланса в аналитике валют: убрать одинаковую иконку 💱, сделать компактный двухстрочный блок с символом валюты, суммой, средним курсом и примерной стоимостью.

---

## 1. Аналитика кредитов — компактная компоновка

### Проблема

Между карточками сводки, графиком и списком прогресса слишком большие вертикальные отступы, из-за чего аналитика выглядит разреженной.

### Решение

Только CSS. Затронутый файл: `styles.css`.

| Селектор | Было | Стало |
|---|---|---|
| `.finance-credit-analytics-cards` | `margin-bottom: 20px` | `margin-bottom: 12px` |
| `.finance-analytics-section-title` | `margin: 20px 0 8px` | `margin: 10px 0 6px` |
| `.finance-chart-area` | (нет) | `margin-top: 8px` |

Горизонтальный скролл графика уже работает через `.finance-chart-svg-wrap { overflow-x: auto }` — дополнительных изменений не требуется.

---

## 2. Долги — индикация закрытых долгов

### Логика определения

Долг считается закрытым, когда `isDebtPaidOff(debt) === true` (`src/domain/debtCalculations.ts`), т.е. `getDebtRemaining(debt) <= 0`.

### Визуальное выделение

**Фон строки/карточки** — усиленный зелёный + левая граница:

```css
/* Десктоп: строка таблицы */
.finance-debt-paid {
  background: rgba(34, 197, 94, 0.12) !important;
  border-left: 3px solid rgba(34, 197, 94, 0.4) !important;
}
/* Мобайл: карточка */
.finance-debt-block.finance-debt-paid {
  background: rgba(34, 197, 94, 0.12);
  border-left: 3px solid rgba(34, 197, 94, 0.4);
}
```

**Бейдж:**

```css
.finance-debt-closed-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
  font-size: 0.82em;
  font-weight: 600;
}
```

### Изменения в TS

**`src/tabs/DebtsTab.ts` — колонка `remaining`:**

Вместо строки `'—'` для закрытых долгов:
```ts
text: remaining > 0
  ? this.ctx.fmt(remaining)
  : this.ctx.tr.debtClosed,
cls: remaining > 0
  ? 'finance-amount-cell finance-amount-remaining'
  : 'finance-amount-cell finance-debt-closed-badge',
```

**`src/tabs/DebtsTab.ts` — мобильная карточка `renderCard()`:**

В header карточки добавлять бейдж для закрытых долгов:
```ts
if (isDebtPaidOff(d)) {
  header.createEl('span', { text: this.ctx.tr.debtClosed, cls: 'finance-debt-closed-badge' });
}
```

### Изменения в i18n

Новый ключ `debtClosed` в `Translations` + оба локейла:

- `ru`: `'✓ Закрыт'`
- `en`: `'✓ Paid off'`

---

## 3. Валютная аналитика — компактные карточки баланса

### Проблема

Текущие карточки используют общий компонент `finance-stat-card` с иконкой 💱, которая одинакова на всех карточках и не несёт информации.

### Новая структура карточки

Двухстрочный блок с левой акцентной границей:

```
▌ [USD]  1 234.56 $
  Средний курс: 95.20 · ~ 117 456 ₽
```

- **Строка 1:** небольшой pill с кодом валюты (акцентный цвет) + сумма баланса жирным
- **Строка 2:** средний курс и примерная стоимость в валюте счёта (приглушённо)
- Если `averageBuyRate === 0` (только `add`-операции без курса) — строка 2 не отображается

### DOM

```ts
const card = summary.createDiv('finance-currency-balance-card');
const row1 = card.createDiv('finance-currency-balance-row1');
row1.createEl('span', { text: currency, cls: 'finance-currency-balance-symbol' });
row1.createEl('span', { text: fmt(metrics.balance, currency), cls: 'finance-currency-balance-amount' });
if (metrics.averageBuyRate > 0 && this.ctx.data) {
  const approx = this.ctx.fmt(metrics.balance * metrics.averageBuyRate);
  card.createEl('div', {
    text: `${this.tr.averageRate}: ${metrics.averageBuyRate.toFixed(2)} · ~ ${approx}`,
    cls: 'finance-currency-balance-meta',
  });
}
```

Класс `finance-stat-deposit-active` убирается из этих карточек.

### CSS

```css
.finance-currency-balance-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: var(--ft-radius);
  background: var(--background-secondary);
  border: 1px solid var(--ft-border);
  border-left: 4px solid var(--ft-accent);
  min-width: 0;
}
.finance-currency-balance-row1 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.finance-currency-balance-symbol {
  font-size: .72em;
  font-weight: 700;
  color: var(--ft-accent);
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(124, 58, 237, 0.12);
  flex-shrink: 0;
}
.finance-currency-balance-amount {
  font-size: 1em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.finance-currency-balance-meta {
  font-size: .75em;
  color: var(--text-muted);
}
```

Перевод `this.tr.averageRate` уже существует в i18n: ru `'Средний курс'`, en `'Average Rate'`. Дополнительных ключей не нужно.

---

## Затронутые файлы

| Файл | Изменения |
|---|---|
| `styles.css` | Отступы аналитики кредитов; стили `.finance-debt-paid` + `.finance-debt-closed-badge`; новые классы `.finance-currency-balance-*` |
| `src/tabs/DebtsTab.ts` | Колонка `remaining` — бейдж вместо `—`; `renderCard()` — бейдж в header мобильной карточки |
| `src/tabs/CurrencyTab.ts` | `renderCurrencyCards()` — новая структура карточек |
| `src/i18n.ts` | Новый ключ `debtClosed` |

## Что не меняется

- Логика `isDebtPaidOff`, фильтр по статусу в DebtsTab, тесты — всё остаётся как есть.
- Горизонтальный скролл графика кредитов уже работает.
- `getCurrencyBalances` и вся доменная логика валют не затрагивается.
