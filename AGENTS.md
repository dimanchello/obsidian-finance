# AGENTS.md — Finance Tracker Plugin

## Project Overview

**Name:** Finance Tracker  
**Type:** Obsidian plugin (Community plugin for Obsidian.md)  
**Version:** 1.0.0  
**Min Obsidian Version:** 1.4.0  
**Languages:** Russian (default), English (Obsidian setting)

Плагин для учёта доходов и расходов непосредственно в заметках Obsidian. Каждая заметка — отдельный счёт (наличные, карта, криптокошелёк и т.д.). Данные хранятся в JSON-файлах в директории плагина.

---

## Tech Stack

- **Language:** TypeScript 5.3+
- **Build:** esbuild (bundler)
- **API:** Obsidian API (`obsidian` npm package)
- **Target:** Obsidian Desktop + Mobile (responsive design)
- **Output:** Single bundled `main.js` (CJS, ES2018)

---

## Build Commands

```bash
npm run dev    # Development: watch + rebuild on changes
npm run build  # Production: typecheck + minified bundle
```

**Build Process:**
1. TypeScript typecheck (`tsc --noEmit --skipLibCheck`)
2. esbuild bundles `main.ts` → `main.js`
3. External modules: `obsidian`, `electron`, all `@codemirror/*`, `@lezer/*`, node built-ins

**Output:** `main.js` in root directory — copy to `.obsidian/plugins/obsidian-finance/`

---

## Code Conventions

### Language
- **All user-facing strings:** Russian
- **Internal identifiers:** English (camelCase)
- **No comments** in code unless absolutely necessary for complex logic

### TypeScript
- Strict mode via `tsconfig.json` (implied default)
- Use explicit types for interfaces (see `src/types.ts`)
- Avoid `any`; use proper type guards

### Architecture Pattern
- **Storage layer:** `FinanceStorage` class (singleton per plugin instance)
- **View layer:** `AccountView` class (one per code block)
- **Modal pattern:** Separate modal classes for each operation
- **State:** Persisted in localStorage per-note (`ft-view:{notePath}`)

### Naming
- Classes: PascalCase (`AccountView`, `RecordModal`)
- Interfaces: PascalCase with descriptive names (`FinanceRecord`, `DebtRecord`)
- Enums/Types: PascalCase (`RecordType`, `DebtMovementType`)
- Constants: UPPER_SNAKE_CASE (`DEFAULT_SETTINGS`, `COMMON_CURRENCIES`)

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
├── main.ts              # Plugin entry point, settings tab
├── main.js              # Bundled output (DO NOT EDIT)
├── src/
│   ├── types.ts         # All TypeScript interfaces and constants
│   ├── i18n.ts          # Internationalization (Russian/English)
│   ├── storage.ts       # FinanceStorage class (CRUD for accounts)
│   ├── AccountView.ts   # Main view component (~1200 lines)
│   ├── RecordModal.ts   # Add/edit record modal
│   ├── ConfirmModal.ts  # Delete confirmation modal
│   ├── ImportExportModal.ts
│   ├── AnalyticsView.ts
│   ├── DebtModal.ts
│   └── DebtMovementModal.ts
├── src/__tests__/       # Unit tests
├── esbuild.config.mjs   # Build configuration
├── vitest.config.ts     # Test configuration
├── manifest.json        # Obsidian plugin manifest
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
}

// Debt system
type DebtMovementType = 'borrow' | 'repay';
type DebtDirection = 'lent' | 'borrowed';

interface DebtRecord {
  id: string;
  person: string;
  amount: number;       // current total (sum borrow - sum repay)
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

### Storage (src/storage.ts)
- **Caching:** In-memory Map<string, AccountData>
- **Lazy loading:** `load(notePath)` returns cached or loads from file
- **Debounced writes:** 500ms delay before flushing to disk
- **Location:** `.obsidian/plugins/obsidian-finance/accounts/{sanitized-path}.json`
- **Versioning:** DATA_VERSION = 3 (handles backward compat for missing fields)

### View State
- Saved to localStorage: `ft-view:{notePath}`
- Contains: sort, filter, pagination, debt filters
- Reset page to 0 on filter change (preserved in state)

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
- Current: v3
- Migration handled in `storage.ts` `load()` method
- Auto-adds missing fields: `time`, `direction`, `dueDate`, `accentColor`

### Mobile Adaptation
- Desktop: Full table with sticky header
- Mobile (< 480px): Card-based layout (each record is a block)
- Detection: `Platform.isMobile || window.innerWidth <= 480`

### Import/Export
- Supported formats: CSV, JSON, XML
- JSON path support: `data.records` for nested arrays
- XML tag auto-detection
- Field mapping UI for custom column names

### Debts System
- Two directions: "lent" (мне должны), "borrowed" (я должен)
- Movement tracking: borrow + repay
- Auto-calculated balance from movements
- Filter by status (paid/unpaid), direction, person, dates

---

## Common Pitfalls

1. **Don't edit main.js** — it's generated by esbuild. Edit source files and rebuild.

2. **State persistence** — view state persists per-note in localStorage. When adding new filter fields, must handle backward compat (see lines 24-28 in AccountView.ts).

3. **Storage flush** — always call `await this.storage.flush()` in `onunload()` to prevent data loss.

4. **Currency handling** — amounts stored as numbers (not strings). Always format with `toLocaleString('ru-RU')`.

5. **Date formats** — stored as `YYYY-MM-DD` strings (not Date objects). Time as `HH:MM` or empty string.

6. **Mobile detection** — computed at render time; not reactive to window resize after initial render.

---

## Testing / Development

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
- [ ] Transfers between accounts
- [ ] Recurring payments

---

## Contributing Notes

- Follow existing naming conventions (Russian UI, English code)
- Keep `AccountView.ts` organized with region comments (// ── ──)
- Add new fields to types with proper defaults
- Update `DATA_VERSION` in storage.ts if schema changes
- Test backward compat: load old JSON files and verify migration