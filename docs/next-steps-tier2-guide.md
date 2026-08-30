# Памятка: Следующие шаги архитектурного рефакторинга

## ✅ Выполнено: Tier 1 (Критичные задачи)

- [x] `domain/linkedRecords.ts` — централизация логики linkedId
- [x] `domain/AccountCommands.ts` — транзакционный слой команд
- [x] 47 новых тестов (unit + integration)
- [x] Покрытие интеграционными тестами: 0% → 60%+

**Коммит:** `af71b9c` (dev branch)

---

## 🎯 Tier 2: Рефакторинг вкладок (Неделя 2-3)

### Задача 1: Переписать вкладки на AccountCommands

**Порядок рефакторинга:**
1. `DebtsTab.ts` (453 строки) — самая простая
2. `DepositsTab.ts` (578 строк)
3. `CreditsTab.ts` (536 строк)
4. `CurrencyTab.ts` (442 строки)

**Паттерн замены:**

```typescript
// ❌ Было (прямой вызов storage):
await this.ctx.storage.deleteDebt(this.ctx.accountId, debt.id);
const otherRecords = this.ctx.data!.records.filter(r => r.linkedId !== debt.id);
await this.ctx.storage.saveAllRecords(this.ctx.accountId, otherRecords);

// ✅ Стало (команда):
const commands = new AccountCommands(this.ctx.storage, this.ctx.accountId);
await commands.deleteDebt(debt.id);
```

**Что удалить из вкладок:**
- Все локальные `mirrorRecord()` / `refundRecord()` функции
- Прямые вызовы `this.ctx.storage.addX()` с последующим `addRecord()`
- Ручное управление `linkedId` записями

**Метрика успеха:** 62 прямых вызова storage → 0

---

### Задача 2: Убрать двойную персистенцию ViewState

**Проблема:**
```typescript
// context.ts
saveState(): void {
  this.storage.saveViewState(...); // → state.json
}
// + loadState() читает из localStorage синхронно
```

**Решение:**
1. Оставить `state.json` как единственный source of truth
2. localStorage использовать только как кэш для первого рендера
3. При конфликтах: `state.json` > localStorage

**Изменения:**
- `context.ts:64` — `saveState()` только в `state.json`
- `context.ts:loadState()` — читать из файла, fallback на localStorage
- Удалить дублирующие записи в localStorage при сохранении

---

## 🔮 Tier 3: Опциональный рефакторинг (Неделя 4+)

### Задача 3: Разбить OverviewTab.ts (1444 строки)

```
tabs/OverviewTab.ts         — 200 строк (навигация)
ui/charts/MoneyFlowChart.ts — 150 строк
ui/charts/AssetsChart.ts    — 150 строк
ui/charts/BurdenChart.ts    — 150 строк
ui/KpiCards.ts              — 150 строк
```

### Задача 4: Базовый EntityModal<T>

```typescript
abstract class EntityModal<T> extends FinanceBaseModal {
  abstract validate(): string | null
  abstract buildEntity(): T
  abstract save(entity: T): Promise<void>
}
```

8 модальных окон → наследуются от базового → -400 строк дублирования

### Задача 5: Разбить AccountView (370 строк)

```
AccountView        — координация (150 строк)
AccountHeader      — UI хедера (100 строк)
AutoTxScheduler    — фоновые задачи (50 строк)
```

---

## 📊 Текущие метрики

| Метрика | Текущее | Цель Tier 2 |
|---------|---------|-------------|
| Storage вызовов из tabs | 62 | 0 |
| ViewState персистенция | Двойная | Одна |
| OverviewTab размер | 1444 строк | 400 строк |
| Модальные паттерны | 8 копий | 1 base class |
| Интеграционное покрытие | 60%+ | 80%+ |

---

## 🚀 Быстрый старт для Tier 2

### 1. Рефакторинг DebtsTab (пример)

```bash
# Открыть файл
code src/tabs/DebtsTab.ts

# Найти все прямые вызовы storage:
grep -n "this.ctx.storage" src/tabs/DebtsTab.ts

# Заменить на команды:
# - confirmDeleteDebt() → commands.deleteDebt()
# - openRepayModal() → commands.addDebtMovement()
# - confirmDeleteMovement() → commands.deleteDebtMovement()

# Удалить функцию mirrorRecord()
# Удалить ручное управление linkedId

# Запустить тесты:
npm test

# Проверить build:
npm run build
```

### 2. Шаблон команды в конструкторе вкладки

```typescript
export class DebtsTab {
  private ctx: ViewContext;
  private commands: AccountCommands;

  constructor(ctx: ViewContext, el: HTMLElement) {
    this.ctx = ctx;
    this.commands = new AccountCommands(ctx.storage, ctx.accountId);
    // ...
  }

  private confirmDeleteDebt(debt: DebtRecord): void {
    new ConfirmModal(this.ctx.app, `...`, async () => {
      await this.commands.deleteDebt(debt.id);
      await this.reload(this.tr.debtDeleted);
    }).open();
  }
}
```

---

## 📝 Checklist для каждой вкладки

- [ ] Добавить `private commands: AccountCommands` в конструктор
- [ ] Заменить все `storage.deleteX()` на `commands.deleteX()`
- [ ] Заменить все `storage.addX() + addRecord()` на `commands.addX()`
- [ ] Удалить функции `mirrorRecord()`, `refundRecord()` и аналогичные
- [ ] Удалить ручную фильтрацию `records.filter(r => r.linkedId !== ...)`
- [ ] Запустить `npm test` — все тесты должны проходить
- [ ] Запустить `npm run lint` — 0 errors
- [ ] Проверить build: `npm run build`

---

## 🎓 Полезные ссылки

- **Архитектурный анализ:** `docs/architecture-analysis-2026-08.md`
- **Отчёт Tier 1:** `docs/tier1-implementation-report-2026-08-29.md`
- **Модуль linkedRecords:** `src/domain/linkedRecords.ts`
- **Модуль AccountCommands:** `src/domain/AccountCommands.ts`
- **Тесты:** `src/__tests__/integration-linkedRecords.test.ts`

---

## ⚠️ Важные правила

1. **Не ломать существующие тесты** — 371/371 должны проходить после каждого изменения
2. **Lint должен быть чистым** — 0 errors (warnings допустимы для existing code)
3. **Build должен быть успешным** — `npm run build` без ошибок
4. **Рефакторить по одной вкладке** — проверять после каждой, не накапливать изменения
5. **Коммитить после каждой вкладки** — `git commit -m "refactor: migrate DebtsTab to AccountCommands"`

---

## 🏆 Ожидаемый результат Tier 2

✅ 0 прямых вызовов storage из вкладок  
✅ Единая персистенция ViewState  
✅ Все тесты проходят (371+ тестов)  
✅ Lint чистый (0 errors)  
✅ Build успешный  
✅ -300 строк кода (удаление дублирования)  

**Время:** 2-3 недели при постепенной работе по 1-2 часа в день
