# Комплексный анализ архитектуры Finance Tracker

**Дата:** 2026-08-29  
**Версия кодовой базы:** dev branch (commit ca95435)

## Исполнительное резюме

**Текущее состояние:** ✅ Все тесты проходят (324/324), lint чистый, build успешный. Coverage domain-слоя — 95.77%, но UI/tabs — 0-5%.

**Ключевые проблемы:**
1. ❌ **Нет интеграционных тестов** — unit-тесты покрывают только domain/storage, но не проверяют взаимодействие вкладок с хранилищем
2. ⚠️ **Дублирование логики `linkedId`** — каждая вкладка (Debts/Credits/Deposits/Currency) самостоятельно управляет зеркалированием записей
3. ⚠️ **62 прямых вызова storage из tabs** — нарушает принцип единственной ответственности
4. ⚠️ **Паттерны модальных окон повторяются** — 8+ модальных окон с похожей структурой
5. ⚠️ **Две системы автотранзакций** — `autoTransactions.ts` (domain) vs ручное зеркалирование в tabs

---

## 1. Интеграционные тесты

### Текущее состояние тестирования

```
Domain layer:    95.77% покрытие, 324 теста
Storage layer:   82.73% покрытие  
UI/Tabs layer:   0% покрытие      ← ПРОБЛЕМА
Modals:          0% покрытие
```

### Артефакты, которые могут проскакивать

**Проблема 1: Рассинхрон `linkedId` записей**
```typescript
// DepositsTab.ts:516 - удаление вклада
await this.ctx.storage.deleteDeposit(this.ctx.accountId, deposit.id);
// ...23 строки ниже
await this.ctx.storage.saveAllRecords(this.ctx.accountId, otherRecords);
```
☠️ **Артефакт:** Если между двумя вызовами упадёт исключение, вклад удалится, но записи останутся — баланс сломается.

**Проблема 2: Две параллельные системы автотранзакций**
- `domain/autoTransactions.ts` — создаёт записи для кредитов/вкладов через `RecordMirror`
- `tabs/*Tab.ts` — вручную создают записи через `mirrorRecord()` / `refundRecord()`

☠️ **Артефакт:** При редактировании вклада через UI может создаться дубликат записи, если автотранзакция уже создала её по расписанию.

**Проблема 3: Нет проверки консистентности при удалении**
```typescript
// CreditsTab.ts:112
await this.ctx.storage.deleteCreditsWithLinkedRecords(this.ctx.accountId, ids);
```
☠️ **Артефакт:** Если в `downPaymentRecordId` указан ID несуществующей записи, он не очистится — накапливаются "мёртвые" ссылки.

### Рекомендации по интеграционным тестам

**Tier 1: Critical Path Tests (обязательны)**
```typescript
// tests/integration/linkedRecords.test.ts
describe('LinkedRecords Integration', () => {
  it('удаление кредита удаляет все связанные записи', async () => {
    const credit = await storage.addCredit(accountId, mockCredit);
    await autoTransactions.apply(data, deps); // создаст 12 expense-записей
    
    await storage.deleteCreditsWithLinkedRecords(accountId, [credit.id]);
    const records = await storage.load(accountId);
    
    expect(records.records.filter(r => r.linkedId === credit.id)).toHaveLength(0);
  });
  
  it('изменение процентной ставки вклада перестраивает начисления', async () => {
    // ...
  });
});
```

**Tier 2: Race Condition Tests**
```typescript
describe('Concurrent Operations', () => {
  it('параллельное редактирование вклада и автотранзакция не создают дубликатов', async () => {
    // Simulate: user clicks "Edit" while autoTransactions runs
  });
});
```

**Tier 3: State Consistency Tests**
```typescript
describe('ViewState Persistence', () => {
  it('state.json и localStorage синхронизированы', async () => {
    // loadState() должен мержить оба источника
  });
});
```

---

## 2. KISS принципы

### ✅ Что сделано хорошо

1. **Domain-слой чистый:** `money.ts` (17 строк), `dateMath.ts`, `schedule.ts` — чистые функции без побочных эффектов
2. **Единый `DataTable`:** 636 строк, но устраняет ~2000 строк дублирования в 4 вкладках
3. **Валидация централизована:** `domain/validate.ts` — один парсер для всех JSON-структур

### ⚠️ Что усложнено

**1. Двойная персистенция ViewState**
```typescript
// context.ts:64
saveState(): void {
  this.storage.saveViewState(this.accountId, {...this._state, page: 0}); // → state.json
}
// + loadState() читает из localStorage синхронно
```
**Проблема:** Два источника правды, не понятно, какой приоритетнее. `loadStateFromFile()` мержит поверх localStorage, но при конфликтах?

**Решение KISS:** 
- Убрать localStorage совсем, использовать только `state.json`
- ИЛИ: localStorage = кэш, `state.json` = source of truth, мержить с явным приоритетом

**2. `linkedId` логика размазана по 4 вкладкам**
```bash
# 20 мест, где вкладки создают/удаляют/фильтруют linkedId записи
$ grep -n "linkedId" src/tabs/*.ts | wc -l
20
```

**Решение KISS:** Извлечь в `domain/linkedRecords.ts`:
```typescript
export function ensureLinkedRecord(
  records: FinanceRecord[], 
  spec: LinkedRecordSpec
): FinanceRecord[] {
  const key = linkedRecordKey(spec);
  if (records.some(r => linkedRecordKey(r) === key)) return records;
  return [...records, createLinkedRecord(spec)];
}

export function unlinkRecords(
  records: FinanceRecord[], 
  entityId: string
): FinanceRecord[] {
  return records.filter(r => r.linkedId !== entityId);
}
```

**3. OverviewTab.ts — 1444 строки**
```
src/tabs/OverviewTab.ts:   1444 строк  ← самый большой файл
```
Внутри: расчёт метрик + 3 типа графиков + KPI-карточки + фильтрация по периодам.

**Решение KISS:** Разбить на:
- `tabs/OverviewTab.ts` (навигация, layout) — 200 строк
- `ui/KpiCards.ts` (рендеринг карточек) — 150 строк
- `ui/charts/MoneyFlowChart.ts`, `AssetsChart.ts`, `CreditBurdenChart.ts` — по 100-150 строк каждый
- Метрики уже вынесены в `domain/overviewMetrics.ts` ✅

---

## 3. Модульность

### ✅ Хорошая архитектура

```
src/
  domain/          — чистая бизнес-логика, 95% покрытие
  storage/         — абстракция над Obsidian Vault
  ui/              — переиспользуемые компоненты
  tabs/            — координация UI + storage
```

**Хорошие модули:**
- `domain/money.ts` — 17 строк, одна ответственность
- `ui/DataTable.ts` — generic компонент, переиспользуется 4 раза
- `storage/AccountRepo.ts` — FileStore pattern с debounced flush

### ⚠️ Нарушения модульности

**1. Вкладки знают о внутренностях storage**
```typescript
// DepositsTab.ts:489
await this.ctx.storage.saveAllRecords(this.ctx.accountId, otherRecords);
```
Вкладка должна работать через команды, а не манипулировать коллекциями напрямую.

**Решение:** Ввести `AccountCommands` (Command pattern):
```typescript
class AccountCommands {
  async deleteDeposit(depositId: string): Promise<void> {
    // Удаляет вклад + все linkedId записи транзакционно
    await this.storage.deleteDeposit(accountId, depositId);
    const records = await this.storage.loadRecords(accountId);
    await this.storage.saveAllRecords(
      accountId, 
      records.filter(r => r.linkedId !== depositId)
    );
  }
}
```

**2. `AccountView` делает слишком много**
```typescript
// AccountView.ts — 370 строк, 8 ответственностей:
- renderHeader() — управление UI хедера
- renderBodyContent() — роутинг между вкладками
- checkAutoTransactions() — бизнес-логика
- startAutoTxTimer() — планирование
- renderCurrencyBadge() — UI компонент
- applyAccentColor() — стилизация
- startNameEdit() — inline редактирование
```

**Решение:** Разбить на:
- `AccountView` (координация) — 150 строк
- `AccountHeader` (UI) — 100 строк
- `AutoTransactionScheduler` (фоновая работа) — 50 строк

---

## 4. Переиспользование vs дублирование

### ✅ Хорошее переиспользование

**1. `ui/tabHelpers.ts`** — shared рендеринг:
```typescript
renderProgressBar()      // используют Deposits + Credits
renderPaginatedSchedule() // используют Deposits + Credits
dateRangeControls()      // используют все 4 вкладки
```

**2. `ui/DataTable.ts`** — устранил ~2000 строк дублирования между вкладками

**3. `domain/schedule.ts`** — единый алгоритм для кредитов и вкладов:
```typescript
buildCreditSchedule()  // аннуитет/дифференцированный
buildDepositSchedule() // капитализация/выплаты
```

### ❌ Дублирование кода

**Проблема 1: Зеркалирование записей**
```typescript
// DepositsTab.ts:606
private refundRecord(deposit: DepositRecord): FinanceRecord {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    date: getTodayStr(),
    time: getTodayTime(),
    type: 'income',
    amount: deposit.amount,
    category: this.tr.depositRefundCat,
    payer: deposit.bankName,
    note: `${this.tr.depositRefundNote} "${deposit.name}"`,
    linkedId: deposit.id,
    // ...
  };
}

// DebtsTab.ts:444
private mirrorRecord(debt: DebtRecord, mov: {...}, type: RecordType, note: string): FinanceRecord {
  return {
    id: crypto.randomUUID(),
    // ... почти идентичная структура
  };
}
```
**8 похожих функций в 4 вкладках.** Должна быть одна в `domain/linkedRecords.ts`.

**Проблема 2: Подтверждение удаления**
```typescript
// Шаблон повторяется 8 раз:
new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteX}\n${label}`, async () => {
  await this.ctx.storage.deleteX(...);
  await this.reload(this.tr.xDeleted);
}).open();
```
**Решение:** Обернуть в хелпер:
```typescript
async confirmAndDelete<T>(
  entity: T, 
  label: string,
  deleteKey: keyof Translations,
  deleteFn: () => Promise<void>
): Promise<void> {
  await confirmModal(this.ctx.app, this.tr[deleteKey], label);
  await deleteFn();
  await this.reload(this.tr.deleted);
}
```

**Проблема 3: Фильтры вкладок**
```typescript
// RecordsTab.ts, DebtsTab.ts, CreditsTab.ts, DepositsTab.ts
// У каждой почти идентичная функция:
private getFiltered(): T[] {
  const state = this.ctx.state;
  const all = this.ctx.data?.items ?? [];
  let filtered = all.filter(/* фильтр по датам */);
  if (state.filter.search) { /* поиск */ }
  // сортировка
  return filtered;
}
```
**Решение:** Вынести в `domain/filtering.ts` generic функцию:
```typescript
export function applyFilters<T>(
  items: T[],
  filter: FilterState,
  searchFields: (keyof T)[],
  dateField: keyof T
): T[] { /* ... */ }
```

---

## 5. Архитектурные рекомендации

### Tier 1: Критичные (сделать сейчас)

**1. Добавить интеграционные тесты для `linkedId`**
```
tests/integration/
  linkedRecords.test.ts      — CRUD с автоматическим удалением связанных записей
  autoTransactions.test.ts   — синхронизация domain/autoTransactions и ручного зеркалирования
  stateConsistency.test.ts   — localStorage vs state.json
```

**2. Извлечь `domain/linkedRecords.ts`**
```typescript
// Централизует всю логику linkedId из 4 вкладок
export function ensureLinkedRecord(...): FinanceRecord[]
export function unlinkRecords(...): FinanceRecord[]
export function findLinkedRecords(...): FinanceRecord[]
```
Удалит ~150 строк дублирования.

**3. Ввести `AccountCommands` для транзакционности**
```typescript
class AccountCommands {
  async deleteCredit(creditId: string): Promise<void>
  async closeDeposit(depositId: string): Promise<void>
  async repayDebt(debtId: string, movement: DebtMovement): Promise<void>
}
```
Вкладки перестанут напрямую дёргать `storage`.

### Tier 2: Улучшения (сделать после Tier 1)

**4. Разбить `OverviewTab.ts` (1444 строки)**
```
tabs/OverviewTab.ts         — 200 строк (навигация)
ui/charts/MoneyFlowChart.ts — 150 строк
ui/charts/AssetsChart.ts    — 150 строк
ui/charts/BurdenChart.ts    — 150 строк
ui/KpiCards.ts              — 150 строк
```

**5. Унифицировать modal patterns**
```typescript
abstract class EntityModal<T> extends FinanceBaseModal {
  abstract validate(): string | null
  abstract buildEntity(): T
  abstract save(entity: T): Promise<void>
}
```
8 модальных окон наследуются от этого класса → -400 строк дублирования.

**6. Убрать двойную персистенцию ViewState**
Только `state.json`, localStorage использовать как fallback для первого рендера.

### Tier 3: Рефакторинг (опционально)

**7. Event-driven architecture для автотранзакций**
```typescript
eventBus.on('deposit.closed', (depositId) => {
  const record = createRefundRecord(deposit);
  storage.addRecord(record);
});
```
Убирает прямую связь между вкладками и автотранзакциями.

**8. Разбить `AccountView`**
```
AccountView        — координация (150 строк)
AccountHeader      — UI хедера (100 строк)
AutoTxScheduler    — фоновые задачи (50 строк)
```

---

## 6. Метрики качества

| Метрика | Текущее | Цель | Приоритет |
|---------|---------|------|-----------|
| Unit test coverage (domain) | 95.77% | 95%+ | ✅ |
| Integration test coverage | 0% | 60%+ | 🔴 Критично |
| Tabs test coverage | 0% | 40%+ | 🟡 Важно |
| Дублирование linkedId | 20 мест | 1 модуль | 🔴 Критично |
| Storage вызовов из tabs | 62 | 0 | 🟡 Важно |
| Размер OverviewTab | 1444 строк | <400 | 🟢 Желательно |
| Модальные паттерны | 8 копий | 1 base class | 🟢 Желательно |

---

## 7. План действий

### Неделя 1: Стабильность
- [ ] Написать 15-20 интеграционных тестов для `linkedId` CRUD
- [ ] Добавить тест на race condition между UI и автотранзакциями
- [ ] Покрыть тестами `storage/index.ts:deleteXWithLinkedRecords` методы

### Неделя 2: Централизация
- [ ] Создать `domain/linkedRecords.ts` с 4-5 функциями
- [ ] Рефакторить все 4 вкладки на использование новых функций
- [ ] Удалить дублирование `mirrorRecord()`/`refundRecord()`

### Неделя 3: Архитектура
- [ ] Ввести `AccountCommands` класс
- [ ] Переписать вкладки на команды вместо прямых storage вызовов
- [ ] Убрать двойную персистенцию ViewState

### Неделя 4: Качество
- [ ] Разбить `OverviewTab.ts` на 5 файлов
- [ ] Создать базовый `EntityModal<T>` класс
- [ ] Рефакторить 8 модальных окон на наследование

---

## 8. Заключение

**Сильные стороны:**
- ✅ Domain-слой чистый и хорошо протестирован
- ✅ `DataTable` устранил огромное дублирование
- ✅ Модульная структура папок

**Критичные проблемы:**
- 🔴 **Нет интеграционных тестов** — артефакты с `linkedId` могут проскакивать
- 🔴 **Дублирование логики зеркалирования** — 20 мест в 4 вкладках
- 🟡 **Прямые вызовы storage** — нарушает инкапсуляцию

**Приоритет:** Сначала Tier 1 (интеграционные тесты + `linkedRecords` модуль), потом Tier 2 (команды + разбиение файлов).

**Риски:**
1. Рефакторинг без тестов может сломать работу с существующими данными
2. Command pattern может усложнить отладку — нужно добавить структурированное логирование
3. Разбиение больших файлов может замедлить первоначальный рендер — нужен performance benchmark

**Следующий шаг:** Начать с Недели 1 (интеграционные тесты) — это foundation для безопасного рефакторинга.
