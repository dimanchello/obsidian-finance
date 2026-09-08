# AGENTS.md — Finance Tracker Plugin

## Project Overview

**Name:** Finance Tracker  
**Type:** Obsidian plugin (Community plugin for Obsidian.md)  
**Version:** 2.0.1  
**Min Obsidian Version:** 1.4.0  
**Languages:** Russian (default), English (Obsidian setting)

Плагин для учёта доходов и расходов непосредственно в заметках Obsidian. Каждая заметка — отдельный счёт (наличные, карта, криптокошелёк и т.д.). Данные хранятся в JSON-файлах в директории плагина.

---

## Tech Stack

- **Language:** TypeScript 5.3+
- **Build:** esbuild (bundler)
- **API:** Obsidian API (`obsidian` npm package)
- **Target:** Obsidian Desktop + Mobile (responsive design)
- **Output:** Single bundled `main.js` (CJS, ES2021)

---

## Build Commands

```bash
npm run dev    # Development: watch + rebuild on changes
npm run build  # Production: typecheck + minified bundle
npm run lint   # ESLint strict check (must pass 0 errors)
npm test       # Run unit tests
```

**Build Process:**
1. TypeScript typecheck (`tsc --noEmit --skipLibCheck`)
2. esbuild bundles `main.ts` → `main.js`
3. External modules: `obsidian`, `electron`, all `@codemirror/*`, `@lezer/*`, node built-ins

**Output:** `dist/main.js` plus `manifest.json` and `styles.css` — copy `dist/` folder to `.obsidian/plugins/obsidian-finance/`

---

## Code Conventions

### Language
- **All user-facing strings:** Russian and English via `src/i18n.ts` only — never hardcode UI text
- **Internal identifiers:** English (camelCase)
- **Comments:** only where the logic is non-obvious

### TypeScript
- Strict mode via `tsconfig.json` (implied default)
- Use explicit types for interfaces (see `src/types.ts`)
- Avoid `any`; use proper type guards

### Architecture Pattern
- **Storage layer:** `FinanceStorage` class (singleton per plugin instance, `src/storage/`)
- **View layer:** `AccountView` class (~250 lines, one per code block) delegating to stateless tabs in `src/tabs/`
- **Command layer:** `AccountCommands` (`src/domain/AccountCommands.ts`) — entity + linked-record writes, called by tabs instead of storage directly
- **Modal pattern:** CRUD forms extend `EntityModal<T>`; helper modals extend `FinanceBaseModal`
- **State:** Persisted per-account in `state.json` (no localStorage)

### Naming
- Classes: PascalCase (`AccountView`, `RecordModal`)
- Interfaces: PascalCase with descriptive names (`FinanceRecord`, `DebtRecord`)
- Enums/Types: PascalCase (`RecordType`, `DebtMovementType`)
- Constants: UPPER_SNAKE_CASE (`DEFAULT_SETTINGS`, `COMMON_CURRENCIES`)

### Constants & String Literals (Строго и обязательно!)
**1. Полный запрет сырых строк (String Literals)!**
Категорически запрещено использовать строковые литералы напрямую в коде (как в `src/`, так и в тестах `src/__tests__/`) для любых сущностей, которые могут быть переиспользованы:
- **Статусы:** `CreditStatus.ACTIVE`, `CreditStatus.PAID`, `DepositStatus.CLOSED`, `PaymentStatus.PENDING` и т.д. (никаких `'active'`, `'paid'`, `'closed'`, `'pending'`).
- **Типы записей и операций:** `RecordType.INCOME`, `RecordType.EXPENSE`, `CreditType.CONSUMER`, `DepositType.TERM`, `CurrencyOperationType.BUY`, `DebtMovementType.BORROW` и т.д.
- **Направления и опции:** `DebtDirection.BORROWED`, `EarlyRepaymentOption.TERM`, `DepositAccrualType.TO_ACCOUNT` и т.д.
- **Названия системных полей, ключей хранилища и сущностей.**
- Единый источник правды для строковых констант — `src/constants.ts` (реэкспортируются в `src/types.ts`). В тестах assertions, моки и фикстуры обязаны использовать константы: `expect(record.type).toBe(RecordType.EXPENSE)`, а не `'expense'`.

**2. Полный запрет магических чисел (Magic Numbers)!**
Любые числовые литералы, несущие логический смысл, должны быть вынесены в именованные константы (`UPPER_SNAKE_CASE`) в `src/types.ts` или `src/constants.ts`:
- Пагинация, размеры страниц, пороги отображения → `PAGE_SIZE_OPTIONS`, `PAGE_RANGE_THRESHOLD`
- Лимиты, пороги валидации, округления → `CURRENCY_ROUNDING_PRECISION`, `PLURAL_THRESHOLD`
- Тайминги, дебаунсы, задержки фокуса → `SEARCH_DEBOUNCE_MS`, `MODAL_FOCUS_DELAY_MS`, `AUTOFILL_DEBOUNCE_MS`
- Мобильные брейкпоинты → `MOBILE_BREAKPOINT`
- Шаги и периоды расчётов, константы времени → `MS_PER_DAY`, `DAYS_IN_YEAR`, `ACCRUAL_STEP_MONTHLY`
- *Исключения:* допускаются только тривиальные базовые числа (`0`, `1`, `-1`, `2`) и простые базовые операции (например, смещение индекса `+ 1` или простое обрезание длины строки `str.slice(0, 10)`). Всё остальное — строго через именованные константы!

### Mobile Adaptation (Обязательно!)
**Все новые фичи должны поддерживать мобильные устройства!**

При добавлении любой функциональности необходимо:
- Предусмотреть адаптивную верстку (использовать `Platform.isMobile` или `window.innerWidth <= 480`)
- Для таблиц добавить блочную версию (card-based layout) как в `renderDebtsAsBlocks`
- Тестировать узкий экран (≤ 480px) — все элементы должны помещаться и быть удобными
- Избегать горизонтального скролла на мобильных устройствах
- Использовать большие кнопки и элементы управления (минимум 44px)

### UI Patterns
- DOM manipulation: Native `document.createElement()` + Obsidian's `el.createEl()`
- No external UI framework
- CSS via `addClass()` with custom CSS injected via Obsidian (user-provided)
- Responsive: detect mobile via `Platform.isMobile` or viewport width ≤ 480px

---

## Project Structure

```
├── main.ts                  # Plugin entry point, settings tab
├── src/
│   ├── types.ts             # Interfaces and numeric constants
│   ├── constants.ts         # String-literal unions (RecordType, PaymentStatus, …)
│   ├── utils.ts             # Shared utilities (fmtAmount, parseAmount, fmtDate, fmt, fmtInteger)
│   ├── i18n.ts              # Internationalization (Russian/English)
│   ├── context.ts           # ViewContext — the only object tabs receive
│   ├── AccountView.ts       # Per-code-block view (~250 lines), wires header + tabs
│   ├── AnalyticsView.ts     # Records analytics charts
│   ├── CreditsAnalyticsView.ts
│   ├── DepositsAnalyticsView.ts
│   ├── storage/             # FinanceStorage, FileStore<T>, VaultAdapter, AccountFiles
│   ├── domain/              # Pure business logic (no DOM):
│   │   ├── AccountCommands.ts   # Transactional entity + linked-record writes
│   │   ├── linkedRecords.ts     # FinanceRecord mirrors of debts/credits/deposits
│   │   ├── autoTransactions.ts  # Schedule generation, past-due materialization
│   │   ├── creditCalculations.ts, overviewMetrics.ts, dateMath.ts, money.ts,
│   │   ├── currencyBalance.ts, debtCalculations.ts, schedule.ts, csv.ts,
│   │   └── validate.ts, viewState.ts, accountId.ts, records.ts
│   ├── ui/                  # Reusable DOM components:
│   │   ├── FinanceBaseModal.ts  # Base for every modal
│   │   ├── EntityModal.ts       # CRUD lifecycle: validate → collect → save
│   │   ├── DataTable.ts, AmountInput.ts, Combobox.ts, formHelpers.ts,
│   │   ├── tabHelpers.ts, statCards.ts, attachmentField.ts, chartHelpers.ts,
│   │   └── charts/              # OverviewTab chart components
│   ├── tabs/                # Stateless tabs, recreated each render:
│   │   └── OverviewTab.ts, RecordsTab.ts, DebtsTab.ts, CreditsTab.ts,
│   │       DepositsTab.ts, CurrencyTab.ts
│   ├── modals/              # CurrencyExchangeModal
│   ├── RecordModal.ts, DebtModal.ts, CreditModal.ts, DepositModal.ts,
│   ├── DebtMovementModal.ts, CreditPaymentModal.ts, CreditEarlyRepaymentModal.ts,
│   ├── DepositTopUpModal.ts, DepositWithdrawalModal.ts,
│   ├── CalculatorModal.ts, ColumnVisibilityModal.ts, ConfirmModal.ts,
│   ├── FieldInfoModal.ts, ImportExportModal.ts, OrphanedAccountsModal.ts
│   └── __tests__/           # Unit tests (business logic only)
├── esbuild.config.mjs       # Build configuration
├── vitest.config.ts         # Test configuration
├── manifest.json            # Obsidian plugin manifest
├── styles.css               # Injected at runtime, NOT bundled
└── package.json
```

---

## Key Interfaces (src/types.ts)

```typescript
// Record types
type RecordType = 'income' | 'expense';
type SortField = 'date' | 'amount' | 'category' | 'type' | 'payer' | 'tag' | 'createdAt';

interface FinanceRecord {
  id: string;
  createdAt: number;   // ms timestamp (stable sort key)
  date: string;         // YYYY-MM-DD
  time: string;         // HH:MM or ""
  type: RecordType;
  amount: number;
  category: string;
  tag: string;
  payer: string;
  note: string;
  attachmentPath: string;
  isInternal?: boolean;
  linkedId?: string;
  exchangeRate?: number;
}

// Debt system
type DebtMovementType = 'borrow' | 'repay';
type DebtDirection = 'lent' | 'borrowed';

interface DebtRecord {
  id: string;
  person: string;
  amount: number;       // current total (sum borrow - sum repay) with interest
  originalAmount: number;
  interestRate: number;
  direction: DebtDirection;
  date: string;
  time: string;
  dueDate: string;
  createdAt: number;
  note: string;
  movements: DebtMovement[];
}

// Account structure
interface AccountData {
  version: number;
  name: string;
  currency: string;
  accentColor?: string;
  records: FinanceRecord[];
  debts: DebtRecord[];
  credits: CreditRecord[];
  deposits: DepositRecord[];
  categories: string[];
  tags: string[];
  payers: string[];
}
```

---

## Architecture

### Plugin Lifecycle (main.ts)

1. **onload()**: Load settings → create storage → register markdown processor → add setting tab
2. **onunload()**: Flush storage (ensures pending writes complete)

### Markdown Processor
- Language: `finance-account`
- Creates `AccountView` instance per code block
- Passes: `app`, `rootElement`, `sourcePath`, `storage`, `settings`

### Storage (src/storage/)
- **Caching:** one `FileStore<T>` per file type, each with its own cache + dirty set
- **Lazy loading:** `load(accountId)` returns cached or loads from disk
- **Debounced writes:** 500ms delay via a shared `FlushScheduler`
- **Location:** `.obsidian/plugins/obsidian-finance/accounts/{accountId}/` — 7 files per account: `meta.json`, `records.json`, `debts.json`, `credits.json`, `deposits.json`, `exchanges.json`, `state.json`
- **Identity:** accountId is a 12-hex-char slice of a UUID, written into the code block as `id: <12-hex>`. The note path is NOT identity — it is tracked in `meta.sourcePath` for diagnostics only.
- **Versioning:** DATA_VERSION = 1 (reset when the storage layer was split); per-field backfill happens in the parsers

### View State
- Saved per account to `state.json` (single source of truth, no localStorage)
- Contains: sort, filter, pagination, column visibility, per-tab analytics filters
- Reset page to 0 on every write
- New fields need a `??=` default in `src/domain/viewState.ts:parseViewState()`

### Internationalization (src/i18n.ts)
- **Supported locales:** Russian (`ru`), English (`en`)
- **Language detection:** `app.vault.getConfig('language')` from Obsidian
- **Default:** Russian if language is not detected or unknown
- **Usage:** Import `getLocale(lang)` and `t(locale)` from i18n.ts
- **Adding new languages:** Add locale to `Locale` type, add translation object, update `LOCALES` constant
- All UI strings are externalized in the `Translations` interface
- Community can add new languages by extending the translations object

---

## Important Implementation Details

### Smart Autocomplete (RecordModal)
When user enters category/payer, the modal automatically fills amount, tag, and the other field from the last matching record. Visual indicator shows "✨ данные подставлены".

### Currency Selection
- Predefined list: `COMMON_CURRENCIES` in types.ts
- Custom currency input supported
- Per-account currency (stored in AccountData.currency)

### Data Versioning
- Current: DATA_VERSION = 1 (`src/types.ts`)
- Field-level backfill happens in the per-file parsers (e.g. `d.direction ??= 'borrowed'`, `c.payments ??= []`)
- Note renames update `meta.sourcePath`; the accountId never changes

### Mobile Adaptation
- Desktop: Full table with sticky header
- Mobile (< 480px): Card-based layout (each record is a block)
- Detection: `Platform.isMobile || window.innerWidth <= 480`

### Import/Export
- Supported formats: CSV, JSON
- JSON path support: `data.records` for nested arrays
- Field mapping UI for custom column names

### Debts System
- Two directions: "lent" (мне должны), "borrowed" (я должен)
- Movement tracking: borrow + repay
- Auto-calculated balance from movements
- Filter by status (paid/unpaid), direction, person, dates

---

## Common Pitfalls

1. **Don't edit main.js** — it's generated by esbuild. Edit source files and rebuild.

2. **State persistence** — view state lives in each account's `state.json`. When adding a new filter field, give it a `??=` default in `src/domain/viewState.ts:parseViewState()` so older blobs keep loading.

3. **Storage flush** — always call `await this.storage.flush()` in `onunload()` to prevent data loss.

4. **Currency handling** — amounts stored as numbers (not strings). Always format with `toLocaleString('ru-RU')`.

5. **Date formats** — stored as `YYYY-MM-DD` strings (not Date objects). Time as `HH:MM` or empty string.

6. **Mobile detection** — computed at render time; not reactive to window resize after initial render.

---

## Testing / Development

### Verification (Обязательно после каждой задачи!)

После завершения любой задачи необходимо выполнить:

```bash
npm run lint   # 0 errors, warnings допустимы только no-explicit-any
npm run build  # tsc + esbuild — чистый выход
npm test       # все тесты зелёные
```

Если хоть один шаг падает — фикс не завершён, править до прохождения.

### Unit Tests

- **Test framework:** Vitest 2.0+
- **Coverage:** Types, i18n, storage CRUD operations

**Commands:**
```bash
npm test              # Run all tests once
npm run test:watch   # Run tests in watch mode
```

**Coverage report:** Generated in `coverage/` directory after test run.

**Test files:**
- `src/__tests__/types.test.ts` — Type definitions and data structures
- `src/__tests__/i18n.test.ts` — Translations and locale detection
- `src/__tests__/storage.test.ts` — Storage CRUD, caching, migrations

**Правила написания тестов:**
- Покрывать только **бизнес-логику** (типы, функции трансформации, storage CRUD, фильтрация, сортировка, миграции, i18n)
- **НЕ покрывать** UI/рендер (AccountView, модалки, DOM-манипуляции)
- Один тест — одна проверка
- Использовать `describe` + `it`, без `test`

### Manual Testing

- Create note → add ```finance-account```
- Add/edit/delete records
- Test filters, sorting, pagination
- Import/export flows
- Mobile view (use mobile app or narrow viewport)

- **Dev workflow:**
  ```bash
  npm run dev  # watch mode
  # Reload plugin in Obsidian: Ctrl/Cmd+P → "Reload" → "Reload app without saving"
  ```

- **Build verification:**
  ```bash
  npm run build  # must pass tsc + esbuild
  ```

---

## Roadmap (from README.md)

- [x] CRUD records with date+time
- [x] Inline account name editing
- [x] Per-account currency
- [x] Filters + sorting + pagination
- [x] Statistics (income/expense/balance)
- [x] Smart autocomplete
- [x] Attachments (photo receipts)
- [x] Import CSV/JSON/XML with field mapping
- [x] Export CSV/JSON/XML
- [x] Mobile card layout
- [x] Analytics: charts by category/month
- [x] Credits management
- [x] Deposits management
- [x] Column visibility
- [x] Built-in calculator

---

## Documentation

### Bilingual README
- `README.md` — Russian (primary, with link to English)
- `README.en.md` — English (with link to Russian)
- **Both files must be updated** when adding/modifying features, changing the roadmap, or updating installation instructions

## Contributing Notes

- Follow existing naming conventions (Russian/English UI via i18n, English code)
- Keep tabs stateless across renders — everything that must survive lives in `ctx.state`
- Add new fields to types with proper defaults
- Update `DATA_VERSION` in `src/types.ts` if the schema changes incompatibly
- **Strings & Statuses → constants:** never use raw string literals for statuses, types, directions, movements, operations, or field names — always use constants from `src/constants.ts` (in both production code and tests).
- **Magic numbers → constants:** always extract numeric constants (pagination, limits, thresholds, timeouts, debounce) to `src/types.ts` or `src/constants.ts`; only trivial 0, 1, -1, 2 or simple string slicing are exempt.
- **View state:** persist through `ctx.saveState()`; there is no localStorage fallback
- **Shared utilities:** put reusable formatting functions in `utils.ts`, don't duplicate across modals
- **Modals:** CRUD forms extend `EntityModal<T>` (implement `getTitle`/`buildForm`/`validate`/`collectData`); helper modals extend `FinanceBaseModal` and use `openHeader()`/`openBody()`