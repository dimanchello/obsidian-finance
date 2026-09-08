# Codebase Map

## 1. Project Overview

Obsidian плагин для личного финансового учёта. Каждый markdown code block ` ```finance-account ` в заметке создаёт независимый аккаунт с собственными данными: доходы/расходы, долги, кредиты, вклады, валютные операции. Плагин встраивается в заметки без отдельного UI, хранит данные в `.obsidian/plugins/`, поддерживает русский и английский, адаптирован для мобильных устройств.

Ключевые подсистемы:
- **Code block processor** — регистрирует `finance-account` язык, mint/resolve accountId
- **Storage** — split-file persistence (meta/records/debts/credits/deposits/exchanges/state) с debounced flush
- **View** — один `AccountView` на code block, tab navigation, auto-transactions scheduler
- **Domain** — бизнес-логика: расчёты, валидация, schedule generation, linked records sync
- **Tabs** — RecordsTab, DebtsTab, CreditsTab, DepositsTab, CurrencyTab, OverviewTab
- **UI components** — DataTable, EntityModal, charts, forms

## 2. Entry Points

**Plugin initialization**
- `main.ts:FinanceTrackerPlugin.onload()` — loads settings, creates storage, registers code block processor, injects styles
- `main.ts:28-40` — `registerMarkdownCodeBlockProcessor('finance-account', ...)` creates `AccountView` per block

**Code block rendering**
- `main.ts:75-113` — `resolveAccountId()` mints new accountId if absent, writes to note on first render
- `main.ts:36-38` — instantiates `AccountView`, calls `await view.render()`

**Commands**
- `main.ts:42-47` — `find-orphaned-accounts` command → `reportOrphanedAccounts()`
- `main.ts:49-60` — `insert-finance-account-template` command → inserts code block template

**Settings**
- `main.ts:183-311` — `FinanceSettingTab` renders settings UI

## 3. Directory Structure

### `src/`
Весь исходный код плагина.

**`src/domain/`**
Бизнес-логика, чистые функции без DOM и Obsidian API:
- `AccountCommands.ts` — transactional CRUD for debts/credits/deposits with linked records sync
- `autoTransactions.ts` — advances schedules to today, materializes deposit/credit records
- `linkedRecords.ts` — creates/unlinks mirrored FinanceRecords for debts/credits/deposits
- `schedule.ts` — builds credit payment and deposit accrual schedules
- `creditCalculations.ts`, `debtCalculations.ts` — interest/annuity math
- `overviewMetrics.ts` — dashboard calculations (savings rate, debt burden, trends)
- `currencyBalance.ts` — multi-currency balance aggregation
- `records.ts`, `dateMath.ts`, `money.ts`, `csv.ts` — utilities
  (`dateMath` exports `addMonthsClamped`, `withDayClamped`, `daysBetweenStr`, `isoWeek`,
  `isoWeekRange`, `daysInYear`, `safeEndDate`, `MS_PER_DAY`)
- `validate.ts` — parses/validates AccountData structures
- `viewState.ts` — ViewState parsing and defaults
- `accountId.ts` — accountId mint/parse/insert into code block

**`src/storage/`**
Persistence layer:
- `index.ts` — `FinanceStorage` facade, CRUD methods for all entity types
- `AccountRepo.ts` — `FileStore<T>` generic cache+dirty+flush, `FlushScheduler`
- `AccountFiles.ts` — path calculations for account folders and files
- `VaultAdapter.ts` — thin wrapper over Obsidian vault API

**`src/tabs/`**
Tab implementations (each instantiated per render):
- `RecordsTab.ts` — income/expense table, filters, analytics, import/export
- `DebtsTab.ts` — debt list, movements, analytics
- `CreditsTab.ts` — credit list, payments, analytics, early repayment
- `DepositsTab.ts` — deposit list, accruals, top-ups, withdrawals
- `CurrencyTab.ts` — currency exchanges, balance by currency
- `OverviewTab.ts` — dashboard with metrics, charts, upcoming payments

**`src/ui/`**
Reusable UI components:
- `FinanceBaseModal.ts` — the only class extending Obsidian `Modal`; `openHeader()`/`openBody()`
- `EntityModal.ts` — base for create/edit modals: `validate → collectData → onSave`
- `DataTable.ts` — generic table with sort/filter/pagination/mobile cards
- `AmountInput.ts` — numeric input with currency symbol
- `Combobox.ts` — searchable dropdown
- `DateField.ts` — date picker wrapper
- `formHelpers.ts`, `tabHelpers.ts`, `pagination.ts` — form/table utilities
  (`tabHelpers` also re-exports `renderStatCard`/`renderStatCards` and wraps
  `calculateEndDate` around `domain/dateMath.safeEndDate`)
- `statCards.ts` — `renderStatCard` / `renderStatCards` / `StatCardItem`; separate module so
  `context.ts` can use it without importing `tabHelpers` (which imports `ViewContext`)
- `attachmentField.ts` — file attachment picker
- `chartHelpers.ts` — SVG chart rendering utilities
- `icons.ts` — icon constants

**`src/ui/charts/`**
Chart components used by `OverviewTab`: `MoneyFlowChart`, `AssetsChart`, `BurdenChart`,
`BreakdownChart`, `SavingsRateChart`, `DebtsBreakdownChart`, `DepositsOverview`.

**`src/__tests__/`**
Vitest tests:
- Unit tests for domain modules, utils, storage, i18n
- Integration tests: `integration-autoTransactions`, `integration-concurrency`, `integration-depositOperations`, `integration-linkedRecords`, `integration-stateConsistency`
- `mock-obsidian.ts` — stubs for Obsidian API
- `setup.ts` — test setup

### Root files
- `main.ts` — plugin entry point
- `styles.css` — all styles (injected dynamically)
- `manifest.json`, `package.json`, `tsconfig.json` — config
- `esbuild.config.mjs` — build script
- `vitest.config.ts` — test config
- `CLAUDE.md`, `AGENTS.md` — AI assistant guidance
- `README.md`, `README.en.md` — user documentation

## 4. Architecture

```
Plugin (main.ts)
 ├── FinanceStorage (singleton, shared by all views)
 │    ├── VaultAdapter (Obsidian vault API wrapper)
 │    ├── AccountFiles (path calculations)
 │    └── FileStore<T> × 7 (meta, records, debts, credits, deposits, exchanges, state)
 │         └── FlushScheduler (debounced writes)
 │
 └── AccountView (one per code block)
      ├── ViewContext (shared mutable bag: app, storage, data, state, locale, tr, isMobile)
      ├── AccountHeader (title, currency badge, tab dropdown)
      ├── AutoTxScheduler (calls checkAutoTransactions() hourly)
      └── Tabs (stateless, recreated on each render)
           ├── OverviewTab
           ├── RecordsTab
           ├── DebtsTab
           ├── CreditsTab
           ├── DepositsTab
           └── CurrencyTab
```

**Data flow:**
1. Plugin registers code block processor
2. On block render: mint/resolve accountId → instantiate AccountView → render()
3. AccountView loads data via FinanceStorage → stores in ViewContext.data
4. Tab accesses data via ctx.data, renders UI
5. User action → Tab calls storage.addX/updateX/deleteX → ctx.data = await storage.load() → re-render
6. Storage marks FileStore dirty → FlushScheduler schedules write in 500ms
7. On plugin unload: storage.flush() ensures all writes complete

**Linked records:**
Debts, credits, deposits do NOT have separate ledgers — they materialize FinanceRecords with `linkedId` field. AutoTransactions scheduler generates/updates these records on every render. AccountCommands layer ensures atomicity: entity update + linked records update happen together.

## 5. Core Modules

### main.ts → FinanceTrackerPlugin

**Path:** `main.ts`

**Purpose:** Plugin entry point. Registers code block processor, loads settings, creates storage, injects styles, handles note renames.

**Important symbols:**
- `FinanceTrackerPlugin` (extends Plugin)
- `resolveAccountId()` — mints accountId on first render
- `reportOrphanedAccounts()` — finds account folders without live code blocks
- `injectStyles()` — dynamically loads styles.css

**Lifecycle:**
- `onload()` → load settings → create storage → register processor → inject styles → add commands
- `onunload()` → await storage.flush()

**Used by:** Obsidian plugin system

---

### AccountView

**Path:** `src/AccountView.ts`

**Purpose:** Main controller for each code block. Owns lifecycle, tab switching, auto-transaction scheduling, renders header and active tab.

**Important symbols:**
- `AccountView` (extends MarkdownRenderChild)
- `render()` — entry point: load data → load state → render header → check auto-transactions → schedule hourly checks → render active tab
- `renderBodyContent()` — switches between tabs based on `this.mode`
- `refreshAndRender()` — reload data → check auto-transactions → re-render (callback for tabs)
- `checkAutoTransactions()` — delegates to `applyAutoTransactions()`, saves changed records/deposits/credits

**Depends on:**
- `ViewContext`, `AccountHeader`, `AutoTxScheduler`, all tabs, `FinanceStorage`

**Used by:** main.ts code block processor

---

### ViewContext

**Path:** `src/context.ts`

**Purpose:** Shared mutable context bag passed to all tabs. Owns data, state, locale, translations, formatting helpers.

**Important symbols:**
- `ViewContext` class
- `data: AccountData | null` — loaded account data
- `state: ViewState` — sort/filter/pagination for all tabs
- `tr: Translations` — resolved translations
- `saveState()` — saves to localStorage + state.json
- `loadStateFromFile()` — merges state.json over localStorage
- `fmt(n: number): string` — formats amount with currency
- `renderRecordsStats()` — renders income/expense/balance cards

**Depends on:**
- `FinanceStorage`, `types`, `i18n`

**Used by:** `AccountView`, all tabs

---

### FinanceStorage

**Path:** `src/storage/index.ts`

**Purpose:** Storage facade. Provides CRUD methods for all entity types, manages 7 FileStore instances, handles debounced flush.

**Important symbols:**
- `FinanceStorage` class
- `load(accountId): Promise<AccountData>` — composite load of all files
- `addRecord()`, `updateRecord()`, `deleteRecord()`, `importRecords()`, `saveAllRecords()`
- `addDebt()`, `updateDebt()`, `deleteDebt()`, `addDebtMovement()`, `updateDebtMovement()`, `deleteDebtMovement()`
- `addCredit()`, `updateCredit()`, `deleteCredit()`, `saveAllCredits()`
- `addDeposit()`, `updateDeposit()`, `deleteDeposit()`, `saveAllDeposits()`, `addDepositTopUp()`, `deleteDepositTopUp()`, `addDepositWithdrawal()`, `deleteDepositWithdrawal()`
- `addExchange()`, `updateExchange()`, `deleteExchange()`, `saveAllExchanges()`
- `saveViewState()`, `loadViewState()`
- `deleteDebtsWithLinkedRecords()`, `deleteCreditsWithLinkedRecords()`, `deleteDepositsWithLinkedRecords()` — delete entity + linked records atomically
- `flush()` — immediate write
- `findOrphanedAccounts()` — finds folders without live code blocks

**Depends on:**
- `VaultAdapter`, `AccountFiles`, `FileStore`, `FlushScheduler`, domain validators

**Used by:** `AccountView`, `main.ts`

---

### FileStore

**Path:** `src/storage/AccountRepo.ts`

**Purpose:** Generic cache + dirty tracking + flush for one file kind. Eliminates duplication.

**Important symbols:**
- `FileStore<T>` class
- `load()` — reads from cache or vault
- `set()` — updates cache, marks dirty
- `markDirty()` — triggers FlushScheduler
- `flush()` — writes all dirty entries

**Depends on:**
- `VaultAdapter`, `AccountFiles`

**Used by:** `FinanceStorage`

---

### FlushScheduler

**Path:** `src/storage/AccountRepo.ts`

**Purpose:** Shared debounce timer for all FileStore instances. Ensures writes don't happen on every keystroke.

**Important symbols:**
- `FlushScheduler` class
- `schedule()` — debounce 500ms
- `flushNow()` — cancel timer, write immediately

**Depends on:** none (pure)

**Used by:** `FinanceStorage`

---

### AccountCommands

**Path:** `src/domain/AccountCommands.ts`

**Purpose:** Transactional layer for CRUD operations on debts/credits/deposits. Ensures entity + linked records are updated atomically.

**Important symbols:**
- `AccountCommands` class
- `addDebt()`, `addDebtMovement()`, `updateDebtMovement()`, `deleteDebtMovement()`, `deleteDebt()`, `deleteDebts()`
- `addCredit()`, `updateCredit()`, `deleteCredit()`, `deleteCredits()`
- `buildDownPaymentRecord()` (private) — mints/clears `credit.downPaymentRecordId` and builds the
  down-payment mirror record; called by `addCredit`/`updateCredit` *before* the credit is stored
- `closeDeposit()`, `deleteDeposit()`, `deleteDeposits()`, `addDepositTopUp()`, `deleteDepositTopUp()`, `addDepositWithdrawal()`, `deleteDepositWithdrawal()`
- `deleteExchange()`, `deleteExchanges()`

**Note:** `addCredit`/`updateCredit` take an optional `downPaymentNote` in their translations
argument. `CreditModal` no longer touches records at all.

**Depends on:**
- `FinanceStorage`, `linkedRecords`

**Used by:** Tabs (DebtsTab, CreditsTab, DepositsTab, CurrencyTab)

---

### autoTransactions

**Path:** `src/domain/autoTransactions.ts`

**Purpose:** Advances deposit/credit schedules to today, marks due items paid, materializes FinanceRecords with linkedId.

**Important symbols:**
- `applyAutoTransactions(data, deps): AutoTxResult` — pure function, returns new state
- `processDeposit()` — generates accruals, creates opening/interest/refund records
- `processCredit()` — generates payments, creates payment records
- `RecordMirror` — ensures idempotent record creation

**Depends on:**
- `schedule`, `money`, `dateMath`

**Used by:** `AccountView.checkAutoTransactions()`

---

### linkedRecords

**Path:** `src/domain/linkedRecords.ts`

**Purpose:** Creates/finds/unlinks mirrored FinanceRecords for debts/credits/deposits.

**Important symbols:**
- `createDebtMovementRecord()`
- `createCreditReceiptRecord()`, `createCreditPaymentRecord()`
- `createCreditDownPaymentRecord()` — keeps a caller-supplied id (`credit.downPaymentRecordId`) so
  the record survives schedule regeneration
- `createDepositRefundRecord()`
- `findLinkedRecord()` — finds record by linkedId + date + amount
- `unlinkRecords()` — filters out records with given linkedId

**Depends on:** types

**Used by:** `AccountCommands`, tabs

---

### DataTable

**Path:** `src/ui/DataTable.ts`

**Purpose:** Generic table component with sort/filter/pagination/mobile cards. Used by all tabs.

**Important symbols:**
- `DataTable<T>` class
- `render()` — entry point
- `DataTableApi` — API exposed to parent (pageSize setter, selectedRows getter)

**Depends on:**
- `ViewContext`, `pagination`, `tabHelpers`

**Used by:** RecordsTab, DebtsTab, CreditsTab, DepositsTab, CurrencyTab

---

### EntityModal

**Path:** `src/ui/EntityModal.ts`

**Purpose:** Base class for create/edit modals. Provides structure: header, form area, validation, save/cancel buttons, optional `❓` field-reference button.

**Important symbols:**
- `EntityModal<T>` (abstract, extends FinanceBaseModal)
- `getTitle()` — abstract, modal heading
- `buildForm(form)` — abstract, override to build form
- `validate()` — abstract, return error message or null
- `collectData()` — abstract, collect form → entity
- `getSaveLabel()` — optional, custom save-button text
- `getInfoFields()` — optional, return `FieldDef[]` to render the `❓` footer button
- `onFormReady()` — optional, runs after the form is built (focus handling)
- `EntityModal.translationsFor(app)` — static, resolves `tr` before `super()` for localized entity defaults

**Depends on:**
- `FinanceBaseModal`, `formHelpers`, `FieldInfoModal`, `i18n`

**Used by (all 9 CRUD modals):** RecordModal, DebtModal, DebtMovementModal, CreditModal, CreditPaymentModal, DepositModal, DepositTopUpModal, DepositWithdrawalModal, CurrencyExchangeModal

---

### RecordsTab

**Path:** `src/tabs/RecordsTab.ts`

**Purpose:** Income/expense table with filters, analytics panel, import/export.

**Important symbols:**
- `RecordsTab` class
- `render()` — entry point
- `renderAnalyticsPanel()` — pie chart + bar chart by category/tag/payer
- `getFiltered()` — applies filters
- `filterControls()` — builds filter UI

**Depends on:**
- `ViewContext`, `DataTable`, `RecordModal`, `ImportExportModal`, `AnalyticsView`

**Used by:** `AccountView`

---

### DebtsTab

**Path:** `src/tabs/DebtsTab.ts`

**Purpose:** Debt list with expandable movements, add/edit/delete.

**Important symbols:**
- `DebtsTab` class
- `onUpdate: () => void` — callback to trigger `refreshAndRender()`
- `render()`
- `renderHeaderActions()` — renders "Add Debt" button

**Depends on:**
- `ViewContext`, `DataTable`, `DebtModal`, `DebtMovementModal`, `AccountCommands`

**Used by:** `AccountView`

---

### CreditsTab

**Path:** `src/tabs/CreditsTab.ts`

**Purpose:** Credit list with expandable payments, analytics, early repayment.

**Important symbols:**
- `CreditsTab` class
- `render()`
- `renderHeaderActions()`
- `renderAnalyticsPanel()` — payment charts by month/type/bank

**Depends on:**
- `ViewContext`, `DataTable`, `CreditModal`, `CreditPaymentModal`, `CreditEarlyRepaymentModal`, `AccountCommands`, `CreditsAnalyticsView`

**Used by:** `AccountView`

---

### DepositsTab

**Path:** `src/tabs/DepositsTab.ts`

**Purpose:** Deposit list with expandable accruals/top-ups/withdrawals, analytics.

**Important symbols:**
- `DepositsTab` class
- `onUpdate: () => void`
- `render()`
- `renderHeaderActions()`
- `renderAnalyticsPanel()` — deposit charts

**Depends on:**
- `ViewContext`, `DataTable`, `DepositModal`, `DepositTopUpModal`, `DepositWithdrawalModal`, `AccountCommands`, `DepositsAnalyticsView`

**Used by:** `AccountView`

---

### OverviewTab

**Path:** `src/tabs/OverviewTab.ts`

**Purpose:** Dashboard with metrics cards, balance by currency, upcoming payments, trends.

**Important symbols:**
- `OverviewTab` class
- `onNavigate: (targetMode: AccountMode) => void` — callback to switch to another tab
- `render()`
- `renderMetrics()` — savings rate, debt burden, net worth
- `renderTrends()` — income/expense trend chart

**Depends on:**
- `ViewContext`, `overviewMetrics`, `currencyBalance`, chart helpers

**Used by:** `AccountView`

---

### AccountHeader

**Path:** `src/AccountHeader.ts`

**Purpose:** Renders account header: title (inline-rename), currency badge, tab dropdown ("•••"), per-tab action slot.

**Important symbols:**
- `AccountHeader` class
- `render()` — creates header DOM
- `updateButtons()` — highlights "•••" when non-records tab is active
- `actionsContainer` — HTMLElement where tabs render their buttons

**Depends on:**
- `ViewContext`, `i18n`

**Used by:** `AccountView`

---

### AutoTxScheduler

**Path:** `src/AutoTxScheduler.ts`

**Purpose:** Calls `checkAutoTransactions()` every hour to advance schedules without manual refresh.

**Important symbols:**
- `AutoTxScheduler` class
- `start()` — sets interval
- `stop()` — clears interval

**Depends on:** types constants

**Used by:** `AccountView`

---

### Modal hierarchy

`FinanceBaseModal` (`src/ui/FinanceBaseModal.ts`) is the only class extending Obsidian's `Modal`.
It owns `onClose()` (empties the body) plus `openHeader(title)` / `openBody()`.

**CRUD forms — extend `EntityModal<T>`** (implement `getTitle`/`buildForm`/`validate`/`collectData`):

| Modal | Entity |
|---|---|
| `src/RecordModal.ts` | `FinanceRecord` |
| `src/DebtModal.ts` | `DebtRecord` |
| `src/DebtMovementModal.ts` | `DebtMovement` |
| `src/CreditModal.ts` | `CreditRecord` |
| `src/CreditPaymentModal.ts` | `CreditPayment` |
| `src/DepositModal.ts` | `DepositRecord` |
| `src/DepositTopUpModal.ts` | `DepositTopUp` |
| `src/DepositWithdrawalModal.ts` | `DepositWithdrawal` |
| `src/modals/CurrencyExchangeModal.ts` | `CurrencyExchange` |

**Helper modals — extend `FinanceBaseModal` directly** (not entity forms):
`CalculatorModal`, `ColumnVisibilityModal`, `ConfirmModal`, `CreditEarlyRepaymentModal`,
`FieldInfoModal`, `ImportExportModal`, `OrphanedAccountsModal`.

`ConfirmModal` uses its own `.finance-confirm-modal` skin; `FieldInfoModal` and
`OrphanedAccountsModal` render their own heading via `openBody()`.

## 6. Important Symbols

### FinanceTrackerPlugin
**Definition:** `main.ts:14`  
**Type:** class (extends Plugin)  
**Purpose:** Plugin entry point, lifecycle owner  
**Related:** FinanceStorage, AccountView  
**Used by:** Obsidian

### AccountView
**Definition:** `src/AccountView.ts:19`  
**Type:** class (extends MarkdownRenderChild)  
**Purpose:** Main controller per code block  
**Related:** ViewContext, AccountHeader, tabs, AutoTxScheduler  
**Used by:** main.ts

### ViewContext
**Definition:** `src/context.ts:8`  
**Type:** class  
**Purpose:** Shared context bag for tabs  
**Related:** AccountData, ViewState, Translations  
**Used by:** AccountView, all tabs

### FinanceStorage
**Definition:** `src/storage/index.ts:50`  
**Type:** class  
**Purpose:** Storage facade with CRUD methods  
**Related:** FileStore, VaultAdapter, AccountFiles  
**Used by:** AccountView, main.ts

### AccountData
**Definition:** `src/types.ts:57`  
**Type:** interface  
**Purpose:** Complete account state  
**Related:** FinanceRecord, DebtRecord, CreditRecord, DepositRecord, CurrencyExchange  
**Used by:** ViewContext, FinanceStorage, tabs

### FinanceRecord
**Definition:** `src/types.ts:6`  
**Type:** interface  
**Purpose:** Single income/expense entry  
**Related:** linkedId (links to debt/credit/deposit)  
**Used by:** RecordsTab, all entity tabs

### DebtRecord
**Definition:** `src/types.ts:36`  
**Type:** interface  
**Purpose:** Debt with movements  
**Related:** DebtMovement  
**Used by:** DebtsTab, AccountCommands

### CreditRecord
**Definition:** `src/types.ts:281`  
**Type:** interface  
**Purpose:** Credit with payment schedule  
**Related:** CreditPayment  
**Used by:** CreditsTab, AccountCommands, autoTransactions

### DepositRecord
**Definition:** `src/types.ts:340`  
**Type:** interface  
**Purpose:** Deposit with accruals/top-ups/withdrawals  
**Related:** DepositAccrual, DepositTopUp, DepositWithdrawal  
**Used by:** DepositsTab, AccountCommands, autoTransactions

### ViewState
**Definition:** `src/types.ts:92`  
**Type:** interface  
**Purpose:** Sort/filter/pagination state for all tabs  
**Related:** FilterState, SortState  
**Used by:** ViewContext, tabs

### AccountCommands
**Definition:** `src/domain/AccountCommands.ts:33`  
**Type:** class  
**Purpose:** Transactional CRUD with linked records sync  
**Related:** FinanceStorage, linkedRecords  
**Used by:** tabs

### applyAutoTransactions
**Definition:** `src/domain/autoTransactions.ts:242`  
**Type:** function  
**Purpose:** Advances schedules, materializes records  
**Related:** processDeposit, processCredit, RecordMirror  
**Used by:** AccountView.checkAutoTransactions()

### DataTable
**Definition:** `src/ui/DataTable.ts` (exact line not read, ~50)  
**Type:** class  
**Purpose:** Generic table with sort/filter/pagination  
**Related:** ViewContext, pagination, tabHelpers  
**Used by:** all tabs

### EntityModal
**Definition:** `src/ui/EntityModal.ts:28`  
**Type:** abstract class (extends FinanceBaseModal)  
**Purpose:** Base for create/edit modals — `validate → collectData → onSave` lifecycle  
**Related:** FinanceBaseModal, formHelpers, FieldInfoModal  
**Used by:** all 9 CRUD modals

### RecordsTab
**Definition:** `src/tabs/RecordsTab.ts:16`  
**Type:** class  
**Purpose:** Income/expense table with analytics  
**Related:** DataTable, RecordModal, AnalyticsView  
**Used by:** AccountView

### DebtsTab
**Definition:** `src/tabs/DebtsTab.ts` (~line 20)  
**Type:** class  
**Purpose:** Debt list with movements  
**Related:** DataTable, DebtModal, AccountCommands  
**Used by:** AccountView

### CreditsTab
**Definition:** `src/tabs/CreditsTab.ts` (~line 20)  
**Type:** class  
**Purpose:** Credit list with payments  
**Related:** DataTable, CreditModal, AccountCommands  
**Used by:** AccountView

### DepositsTab
**Definition:** `src/tabs/DepositsTab.ts` (~line 20)  
**Type:** class  
**Purpose:** Deposit list with accruals  
**Related:** DataTable, DepositModal, AccountCommands  
**Used by:** AccountView

### OverviewTab
**Definition:** `src/tabs/OverviewTab.ts` (~line 20)  
**Type:** class  
**Purpose:** Dashboard with metrics and charts  
**Related:** overviewMetrics, currencyBalance  
**Used by:** AccountView

### AccountHeader
**Definition:** `src/AccountHeader.ts:26`  
**Type:** class  
**Purpose:** Renders header with title, currency, tabs  
**Related:** ViewContext  
**Used by:** AccountView

## 7. Execution Flows

### Plugin startup

```
Obsidian plugin system
 → main.ts FinanceTrackerPlugin.onload()
 → await loadSettings()
 → FinanceStorage = new FinanceStorage(app, pluginId, defaultCurrency)
 → await injectStyles() — reads styles.css from plugin folder
 → registerMarkdownCodeBlockProcessor('finance-account', callback)
 → addCommand('find-orphaned-accounts')
 → addCommand('insert-finance-account-template')
 → addSettingTab(FinanceSettingTab)
```

### Code block render

```
Obsidian markdown processor detects ```finance-account block
 → main.ts code block callback
 → resolveAccountId(source, el, ctx)
    ├── parseAccountId(source) — check if accountId exists
    ├── if missing: newAccountId(crypto.randomUUID())
    ├── insertAccountId() — write "# <accountId>" to note
    └── storage.touchSourcePath(accountId, notePath) — record last seen location
 → new AccountView(app, el, accountId, notePath, storage, settings, pluginId)
 → ctx.addChild(view)
 → await view.render()
    ├── storage.load(accountId) → ctx.data = AccountData
    ├── ctx.loadStateFromFile() → merge state.json over localStorage
    ├── header.render() — title, currency badge, tab dropdown
    ├── checkAutoTransactions() — advance schedules, materialize records
    ├── scheduler.start() — schedule hourly checks
    └── renderBodyContent() — switch to active tab
```

### User adds a debt

```
User clicks "Add Debt" in DebtsTab
 → opens DebtModal (extends EntityModal<DebtRecord>)
 → user fills form → clicks Save
 → DebtModal.validate() → null (valid; a string would be shown as an inline error)
 → DebtModal.collectData() → DebtRecord
 → onSave callback → DebtsTab
 → accountCommands.addDebt(debt, initialMovement, category, translations)
    ├── storage.addDebt(accountId, debt)
    ├── createDebtMovementRecord() — mirror record with linkedId
    └── storage.addRecord(accountId, record)
 → debounced flush (500ms)
 → DebtsTab.onUpdate() → AccountView.refreshAndRender()
    ├── ctx.data = await storage.load(accountId)
    ├── checkAutoTransactions()
    └── renderBodyContent()
```

### Auto-transaction check (hourly)

```
AutoTxScheduler fires (every 3600s)
 → AccountView.refreshAndRender()
 → AccountView.checkAutoTransactions()
    ├── applyAutoTransactions(ctx.data, deps)
    │    ├── for each deposit: processDeposit()
    │    │    ├── if no accruals: buildDepositSchedule()
    │    │    ├── RecordMirror.ensure() — create opening expense
    │    │    ├── settleDue() — mark past-due accruals paid
    │    │    ├── if accrualType === 'to_account': RecordMirror.ensure() — income records
    │    │    └── if matured: status = 'closed', RecordMirror.ensure() — refund income
    │    ├── for each credit: processCredit()
    │    │    ├── if no payments: buildCreditSchedule()
    │    │    ├── settleDue() — mark past-due payments paid
    │    │    └── RecordMirror.ensure() — expense records
    │    └── return { records, deposits, credits, changed }
    ├── if changed.records: storage.saveAllRecords()
    ├── if changed.deposits: storage.saveAllDeposits()
    └── if changed.credits: storage.saveAllCredits()
 → renderBodyContent()
```

### Plugin unload

```
Obsidian unloads plugin
 → FinanceTrackerPlugin.onunload()
 → await storage.flush()
    ├── FlushScheduler.flushNow() — cancel timer
    └── for each FileStore: flush()
         └── vault.atomicWrite(file, JSON.stringify(value))
 → styleEl?.remove()
```

## 8. Data Flow

### Settings
`plugin.loadData()` → `PluginSettings` → passed to `AccountView` → used for currency list, default page size

### Account data
`.obsidian/plugins/<pluginId>/accounts/<accountId>/` folder with 7 JSON files:
- `meta.json` — name, currency, accentColor, sourcePath
- `records.json` — FinanceRecord[], categories, tags, payers
- `debts.json` — DebtRecord[]
- `credits.json` — CreditRecord[]
- `deposits.json` — DepositRecord[]
- `exchanges.json` — CurrencyExchange[]
- `state.json` — ViewState (sort/filter/pagination)

Each file has its own `FileStore<T>` cache. Writes are debounced 500ms. Reads are cached until invalidate().

### View state persistence
**Dual storage:**
1. `localStorage.getItem('ft-view:<pluginId>:<notePath>')` — synchronous read on ViewContext creation
2. `.obsidian/plugins/<pluginId>/accounts/<accountId>/state.json` — async read, merges over localStorage

Both writes force `page: 0`. This survives vault moves and plugin reinstalls.

### Linked records sync
Debts/credits/deposits do NOT have separate income/expense ledgers. Instead:
1. Entity is created/updated → `AccountCommands` layer
2. `AccountCommands` calls `createDebtMovementRecord()` / `createCreditPaymentRecord()` / etc.
3. These create `FinanceRecord` with `linkedId = entity.id`
4. `storage.saveAllRecords()` atomically with entity update
5. AutoTransactions scheduler also materializes records (deposits/credits only)

**Key insight:** `linkedId` records are a materialized view. Deleting an entity requires filtering `records.filter(r => r.linkedId !== entityId)`.

### Cache invalidation
- On note rename: `storage.invalidate(accountId)` clears all FileStore caches
- On account delete: `storage.invalidate(accountId)` after `vault.rmdir()`
- FileStore never auto-invalidates — caches live until explicit invalidate or plugin unload

## 9. Dependencies

Internal (within src/):

```
main.ts → storage/index → storage/{AccountRepo, VaultAdapter, AccountFiles}
main.ts → AccountView → context → storage/index
AccountView → tabs/* → ui/* → domain/*
tabs/* → domain/AccountCommands → storage/index + domain/linkedRecords
AccountView.checkAutoTransactions → domain/autoTransactions → domain/{schedule, money, dateMath}
storage/index → domain/validate
tabs/* → ui/DataTable → ui/{pagination, tabHelpers}
```

External (npm):
- `obsidian` — App, Plugin, Modal, Notice, Platform, TFile, MarkdownPostProcessorContext
- `moment` — date parsing (imported in dateMath, could be removed)
- No other runtime dependencies

Build/test:
- esbuild, typescript, vitest, eslint, playwright

## 10. Obsidian Integration

### Plugin lifecycle
- `Plugin.onload()` — init storage, register processor, inject styles, add commands/settings
- `Plugin.onunload()` — flush storage, remove styles
- `MarkdownRenderChild` — AccountView extends this, gets `onunload()` callback

### Markdown code block processor
- `registerMarkdownCodeBlockProcessor('finance-account', callback)` in main.ts
- Callback receives `(source, el, ctx)` where ctx has `sourcePath`, `getSectionInfo()`
- AccountView instantiated as child of MarkdownPostProcessorContext

### Vault API
- `app.vault.getAbstractFileByPath()` — get TFile
- `app.vault.process(file, fn)` — atomic read-modify-write (used for accountId minting)
- `app.vault.adapter.read(path)` — read file (used for styles.css)
- `app.vault.adapter.write(path, content)` — write file
- `app.vault.adapter.mkdir(path)` — create folder
- `app.vault.adapter.remove(path)` — delete file/folder
- `app.vault.adapter.list(path)` — list folder contents
- `app.vault.configDir` — `.obsidian` path
- `app.vault.cachedRead(file)` — cached markdown read

### Workspace
- Not used directly (no custom views, ribbons, or statusbar)

### MetadataCache
- Not used (no frontmatter, no links, no backlinks)

### Events
- Plugin listens to vault `rename` event in main.ts for note renames (not shown in excerpts, but mentioned in CLAUDE.md)

### Settings
- `PluginSettingTab` in main.ts:183-311
- `this.loadData()` / `this.saveData()` for persistence

### Notices
- `new Notice(message)` for user feedback (record added, import success, etc.)

### Platform
- `Platform.isMobile` — detect mobile device
- `window.innerWidth <= MOBILE_BREAKPOINT` — responsive detection

### UI
- `Modal` — base for all modals
- `Setting` — settings UI builder
- No custom views, no workspace leaves

## 11. Configuration

### Plugin settings
**File:** `src/types.ts:128-138`  
**Interface:** `PluginSettings`  
**Fields:**
- `defaultCurrency: string` — "₽"
- `defaultPageSize: number` — 25
- `customCurrencies: string[]` — ["₽"]

**Storage:** `.obsidian/plugins/<pluginId>/data.json` via Obsidian `loadData()`/`saveData()`

**UI:** `main.ts:183-311` FinanceSettingTab

### Account meta
**File:** each account's `meta.json`  
**Fields:**
- `name: string` — custom display name (empty → use note filename)
- `currency: string` — account currency
- `accentColor?: string` — custom theme color
- `sourcePath?: string` — where note was last seen (diagnostics only)

**Migration:** none (current version is 1, future changes handled in `parseMeta()`)

### Constants
**File:** `src/types.ts` and `src/constants.ts`  
All magic numbers extracted as `UPPER_SNAKE_CASE`:
- `MOBILE_BREAKPOINT = 480`
- `SEARCH_DEBOUNCE_MS = 280`
- `AUTO_TX_INTERVAL_MS = 3_600_000` (1 hour)
- `FLUSH_DEBOUNCE_MS = 500` (storage)
- Chart dimensions, colors, pagination defaults

## 12. Common Change Locations

### Добавить новую команду
`main.ts:42-60` → `this.addCommand({ id, name, callback })`

### Изменить обработку code block
`main.ts:28-40` → callback в `registerMarkdownCodeBlockProcessor`

### Добавить новый тип данных
1. `src/types.ts` → interface
2. `src/domain/validate.ts` → parser
3. `src/storage/index.ts` → add FileStore, CRUD methods
4. `src/storage/AccountFiles.ts` → add to `AccountFileKind`
5. Create tab in `src/tabs/`
6. Add tab to `AccountView.renderBodyContent()`
7. Add to `AccountHeader` dropdown

### Изменить расчёты процентов/аннуитета
`src/domain/creditCalculations.ts` или `src/domain/debtCalculations.ts`

### Изменить schedule generation
`src/domain/schedule.ts` → `buildCreditSchedule()` / `buildDepositSchedule()`

### Изменить auto-transaction logic
`src/domain/autoTransactions.ts` → `processDeposit()` / `processCredit()`

### Добавить фильтр/сортировку
1. `src/types.ts` → add field to FilterState/SortState
2. Tab → `filterControls()` — add FilterControl
3. Tab → `getFiltered()` — apply filter
4. `src/domain/viewState.ts` → add default

### Изменить UI таблицы
`src/ui/DataTable.ts` → columns definition, renderCard, filterControls

### Добавить новую модалку
1. Extend `EntityModal<T>` from `src/ui/EntityModal.ts`
2. Override `getTitle()`, `buildForm()`, `validate()`, `collectData()`
3. Call from tab with `onSave` callback

### Изменить стили
`styles.css` — весь CSS в одном файле

### Добавить перевод
1. `src/i18n.ts` → add key to `Translations` interface
2. Add to `ru` object
3. Add to `en` object

### Изменить формат хранения
1. Update interface in `src/types.ts`
2. Update parser in `src/domain/validate.ts`
3. Add migration in `src/storage/index.ts` `parseX()` method (use `??=` for backwards compat)
4. Increment `DATA_VERSION` if format is incompatible

### Изменить настройки
1. `src/types.ts` → update `PluginSettings`
2. `main.ts:183-311` → update `FinanceSettingTab.display()`
3. Update `DEFAULT_SETTINGS` if adding field

## 13. Architecture Constraints

### Tabs are stateless across renders
Tabs are recreated on every `renderBodyContent()`. State lives in `ctx.state` (ViewState). Tabs must not store mutable state in instance properties that persists across renders.

### Storage is eventually consistent
Writes are debounced 500ms. `storage.addX()` returns immediately but data is not on disk yet. `onunload()` awaits `storage.flush()` to ensure durability.

### Linked records are materialized views
Debts/credits/deposits do NOT own their income/expense records. Records are materialized with `linkedId` field. Deleting entity requires filtering records. Use `AccountCommands` layer to maintain atomicity.

### Auto-transactions run on every render
`AccountView.checkAutoTransactions()` is called on initial render and every hour via scheduler. It is re-entrancy-guarded but NOT date-cached. Must be idempotent (uses `RecordMirror` to avoid duplicates).

### ViewState is persisted twice
Written to both localStorage and state.json. localStorage is read synchronously, state.json is merged async. Both writes force `page: 0`.

### Account identity is code block location
AccountId is minted once per code block. Note path is NOT identity (stored in meta.sourcePath for diagnostics only). Renaming note triggers folder rename via vault event.

### Styles are injected, not bundled
`styles.css` is read from plugin folder at runtime and injected as `<style>` element. Sidesteps Obsidian CSS caching. Missing styles.css → unstyled plugin.

### One AccountView per code block
Each code block gets its own AccountView instance, its own ViewContext, its own data load. No shared state between blocks except FinanceStorage singleton.

### FileStore caches never auto-invalidate
Cache lives until explicit `invalidate(accountId)` or plugin unload. This means in-memory changes can drift from disk if another process writes to the same file (not a real scenario for Obsidian plugins).

### Obsidian API calls must be wrapped
Tests use `mock-obsidian.ts` stubs. Any code calling Obsidian API directly cannot be unit-tested. Domain modules must stay pure.

## 14. Non-obvious Details

### AccountId minting is guarded against re-render loop
When plugin writes accountId to note, Obsidian triggers re-render of that code block. `mintedBlocks` Set guards against writing twice. Guard expires after 3 seconds (MINT_GUARD_MS).

### Folder name collision handling
Account folder name is derived from last 2 path segments: `path/to/note.md` → `to_note`. Collisions are rare but handled: `base`, `base_1`, `base_2`, ... `folderOverrides` map is in-memory only, rebuilt on each session by detecting collision during load.

### RecordMirror uses composite key
Mirrored records are keyed by `${linkedId}|${date}|${type}|${category}`. This means changing category of a deposit breaks the link and creates duplicate records. AutoTransactions logic assumes categories don't change.

### Credit schedule rebuilds on paymentDay change
When user edits credit and changes `paymentDay`, auto-transactions detects pending payments with wrong day and fixes them. This is NOT a full schedule rebuild — only wrong-day payments are updated. Manual edits to other payments are preserved.

### Deposit capitalization updates amount eagerly
When accrual is marked paid and `accrualType === 'capitalization'`, `deposit.amount` is increased immediately. This is cumulative: each paid accrual adds to amount. Non-capitalized deposits keep original amount, only create income records.

### isInternal records are hidden from stats but count toward balance
`isInternal: true` records (auto-generated from deposits/credits) are excluded from income/expense stats in RecordsTab, but still affect balance calculation in `context.ts:89`. This prevents double-counting (deposit opening is expense, but shouldn't show in stats — the deposit itself is the stat).

### ViewState page is always reset to 0 on save
Both `localStorage` and `state.json` writes force `page: 0` in `ctx.saveState()`. This prevents confusion when filter changes and pagination would land on empty page.

### Note renames trigger storage folder rename
Plugin listens to vault `rename` event. When note is renamed, storage folder is renamed to match new path. This keeps folder name aligned with note location (though folder name is NOT identity).

### Credit downPayment creates standalone record
Credit with downPayment creates a FinanceRecord with `downPaymentRecordId` stored on credit. This record does NOT have `linkedId` (it's a real expense, not mirrored). Deleting credit must also delete this record.

### Escrow credits don't create receipt record
`credit.isEscrow` flag suppresses receipt record generation (money goes to developer, not to user's balance). Used for mortgages with escrow accounts.

### Chart colors are deterministic
`CHART_PALETTE` array in types.ts. Categories/tags are assigned colors by index modulo palette length. Same category always gets same color within session (order may change across sessions if new categories are added).

### Mobile detection is render-time only
`Platform.isMobile || window.innerWidth <= MOBILE_BREAKPOINT` is computed once per render. Not reactive to window resize. User must refresh note to pick up responsive changes.

### Debt movements don't have status
Unlike credit payments and deposit accruals, debt movements are always "completed". No pending/paid tracking. This is intentional: debts are manual ledger, credits/deposits are scheduled.

### FinanceStorage is shared singleton
One FinanceStorage instance per plugin, shared by all AccountView instances. Cache is keyed by accountId, so multiple accounts can coexist in same session.

### Code block source line is used for mint guard
`blockKey = ${ctx.sourcePath}:${section.lineStart}` is the identity for mint guard. If user copies code block within same note, both blocks get same blockKey but different sections → both can mint. If user moves block (changes lineStart), it can mint again. This is acceptable: orphan cleanup command handles abandoned folders.

## 15. Symbol Index

```
AccountCommands → src/domain/AccountCommands.ts:33
AccountData → src/types.ts:57
AccountFiles → src/storage/AccountFiles.ts:8
AccountHeader → src/AccountHeader.ts:26
AccountView → src/AccountView.ts:19
AnalyticsView → src/AnalyticsView.ts (~20)
applyAutoTransactions → src/domain/autoTransactions.ts:242
AutoTxScheduler → src/AutoTxScheduler.ts (~10)
buildCreditSchedule → src/domain/schedule.ts (~50)
buildDepositSchedule → src/domain/schedule.ts (~150)
ConfirmModal → src/ConfirmModal.ts (~10)
createCreditPaymentRecord → src/domain/linkedRecords.ts (~100)
createCreditReceiptRecord → src/domain/linkedRecords.ts (~50)
createDebtMovementRecord → src/domain/linkedRecords.ts (~20)
createDepositRefundRecord → src/domain/linkedRecords.ts (~180)
CreditModal → src/CreditModal.ts (~20)
CreditPaymentModal → src/CreditPaymentModal.ts (~15)
CreditRecord → src/types.ts:281
CreditsAnalyticsView → src/CreditsAnalyticsView.ts (~15)
CreditsTab → src/tabs/CreditsTab.ts (~40)
CurrencyExchange → src/types.ts:362
CurrencyTab → src/tabs/CurrencyTab.ts (~30)
DataTable → src/ui/DataTable.ts (~80)
DebtModal → src/DebtModal.ts (~20)
DebtMovementModal → src/DebtMovementModal.ts (~15)
DebtRecord → src/types.ts:36
DebtsTab → src/tabs/DebtsTab.ts (~40)
DEFAULT_SETTINGS → src/types.ts:134
DepositModal → src/DepositModal.ts (~20)
DepositRecord → src/types.ts:340
DepositsAnalyticsView → src/DepositsAnalyticsView.ts (~15)
DepositsTab → src/tabs/DepositsTab.ts (~40)
EntityModal → src/ui/EntityModal.ts:28
FileStore → src/storage/AccountRepo.ts:10
FinanceBaseModal → src/ui/FinanceBaseModal.ts (~10)
FinanceRecord → src/types.ts:6
FinanceStorage → src/storage/index.ts:50
FinanceTrackerPlugin → main.ts:14
findLinkedRecord → src/domain/linkedRecords.ts (~250)
FlushScheduler → src/storage/AccountRepo.ts:62
getLocaleFromApp → src/i18n.ts (~200)
ImportExportModal → src/ImportExportModal.ts (~20)
newAccountId → src/domain/accountId.ts (~15)
OrphanedAccountsModal → src/OrphanedAccountsModal.ts (~10)
OverviewTab → src/tabs/OverviewTab.ts (~40)
parseAccountId → src/domain/accountId.ts (~50)
parseCredits → src/domain/validate.ts (~200)
parseDebts → src/domain/validate.ts (~150)
parseDeposits → src/domain/validate.ts (~250)
parseRecords → src/domain/validate.ts (~50)
PluginSettings → src/types.ts:128
processCredit → src/domain/autoTransactions.ts:174
processDeposit → src/domain/autoTransactions.ts:95
RecordModal → src/RecordModal.ts (~20)
RecordsTab → src/tabs/RecordsTab.ts:16
RecordType → src/types.ts:1
resolveAccountId → main.ts:75
Translations → src/i18n.ts:15
unlinkRecords → src/domain/linkedRecords.ts (~270)
VaultAdapter → src/storage/VaultAdapter.ts (~10)
ViewContext → src/context.ts:8
ViewState → src/types.ts:92
```

---

**Lines:** 1102  
**Sections covered:** 15/15  

**Основные подсистемы:**
- Plugin lifecycle & code block processing
- Storage (split-file persistence, debounced flush)
- View hierarchy (AccountView → tabs)
- Domain logic (calculations, validation, auto-transactions)
- UI components (DataTable, EntityModal, charts)

**Намеренно не включены:**
- Подробные списки всех props/methods для каждого класса (см. исходники)
- Детали реализации всех модальных окон (следуют паттерну EntityModal)
- Полное описание всех chart helpers и form utilities
- Детали CSS классов и стилей (см. styles.css)
- Подробности всех 50+ тестов (см. `src/__tests__/`)

**Участки, сложные для однозначного описания:**
- Точное разрешение коллизий folder names (логика в `folderOverrides`, не персистится)
- Порядок, в котором auto-transactions создаёт records (важен для tests, не для использования)
- Как именно DataTable определяет, рендерить table или cards (проверяет isMobile + column count)
- Детали взаимодействия между RecordMirror и processDeposit/processCredit (ключ композитный, но зачем именно type в ключе — неочевидно из кода)
