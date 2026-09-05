# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Codebase navigation

Before investigating a task, read `CODEBASE.md`.

Use `CODEBASE.md` to identify the relevant subsystem, modules and symbols before searching the repository.

Do not scan the entire `src/` directory unless the task genuinely requires it.

After identifying relevant symbols, use TypeScript/LSP symbol navigation where available to find definitions, references and implementations.

Only read source files that are relevant to the current task.

`CODEBASE.md` is a navigation index, not a source of truth. If it conflicts with the source code, trust the source code and update `CODEBASE.md` if appropriate.

## Commands

```bash
npm run dev          # esbuild watch mode (writes dist/main.js with inline sourcemap)
npm run build        # tsc --noEmit + esbuild production; also copies manifest.json + styles.css into dist/
npm run lint         # eslint src/ — must exit 0 errors (only no-explicit-any warnings are tolerated)
npm test             # vitest run
npm run test:watch   # vitest watch

npx vitest run src/__tests__/storage.test.ts        # single test file
npx vitest run -t "нормализует дату"                # single test by name
```

`npm run lint && npm run build && npm test` is the expected verification loop after any change — all three must pass.

Install into a vault: copy the contents of `dist/` into `<vault>/.obsidian/plugins/obsidian-finance/`. `dist/` is gitignored and never edited by hand.

## Architecture

See `CODEBASE.md` for detailed architecture map, module dependencies, and symbol index.

### Entry and rendering flow

`main.ts` registers a markdown code-block processor for the ` ```finance-account ` language. Every code block instantiates its own `AccountView`. **AccountId is minted once per block and stored in the note** as an `id: <12-hex>` line inside the block body (`domain/accountId.ts`). Note path is NOT identity — it's tracked in `meta.sourcePath` for diagnostics only.

```
main.ts (Plugin)
  ├── FinanceStorage (singleton, shared by all views)
  │    ├── VaultAdapter
  │    ├── AccountFiles (path calculations)
  │    └── FileStore<T> × 7 (meta, records, debts, credits, deposits, exchanges, state)
  └── AccountView (one per code block)
       ├── ViewContext (shared context: app, storage, data, state, locale, tr, isMobile)
       ├── AccountHeader (title, currency badge, tab dropdown)
       ├── AutoTxScheduler (hourly auto-transaction checks)
       └── Tabs (stateless, recreated on each render)
            ├── OverviewTab
            ├── RecordsTab
            ├── DebtsTab
            ├── CreditsTab
            ├── DepositsTab
            └── CurrencyTab
```

`ViewContext` (`src/context.ts`) is the only thing tabs receive. It owns `data` (the loaded `AccountData`), `state` (`ViewState`: sorts/filters/pagination/column visibility), the resolved translations `tr`, and formatting helpers `fmt`/`fmtDate`. Tabs expose `onUpdate` callback that `AccountView` wires to `refreshAndRender()`.

Tab instances are recreated on every `renderBodyContent()` — tabs must be stateless across renders except for what lives in `ctx.state`.

### Storage layout

`FinanceStorage` (`src/storage/index.ts`) writes one folder per account under `.obsidian/plugins/<pluginId>/accounts/<accountId>/`, split into `meta.json`, `records.json`, `debts.json`, `credits.json`, `deposits.json`, `exchanges.json`, `state.json`. Each file type has its own `FileStore<T>` (cache + dirty Set); writes are debounced 500ms via shared `FlushScheduler`. `main.ts` `onunload()` awaits `storage.flush()` — losing that call loses unsaved data.

**AccountId is a 12-hex-char slice of a UUID** (`newAccountId()`), written into the block body as `id: <12-hex>` on first render and validated against `/^[0-9a-f]{12}$/`. Folder name = accountId. `meta.sourcePath` tracks where the note was last seen (for diagnostics/orphan detection).

Field-level backfill for older schemas happens in parsers (e.g. `d.direction ??= 'borrowed'`, `c.payments ??= []`). `DATA_VERSION` is 1 (storage layer was refactored, version reset).

Note renames: plugin listens to vault `rename` event, updates `meta.sourcePath` (accountId stays the same).

### View state persistence

`ctx.saveState()` writes to `state.json` in the account folder. **`state.json` is the single source of truth** — no localStorage fallback. `AccountView.render()` awaits `ctx.loadStateFromFile()` during initialization. Both writes force `page: 0`. When adding a new state field, add a `??=` default in `src/domain/viewState.ts:parseViewState()` — old persisted blobs will be missing it.

### Linked records (`linkedId`)

Debts, credits, and deposits do NOT have separate ledgers — they **materialize `FinanceRecord`s into `records`** and tag them with `linkedId = <entity>.id`. Use `AccountCommands` layer (`src/domain/AccountCommands.ts`) to maintain atomicity: entity + linked records are updated together. Direct storage calls from tabs were eliminated (62 → 0).

`AccountView.checkAutoTransactions()` runs on every `render()` and hourly via `AutoTxScheduler`. It delegates to `applyAutoTransactions()` (`src/domain/autoTransactions.ts`), which generates schedules for deposits/credits, marks past-due items paid, and materializes income/expense records. Idempotent via `RecordMirror` (composite key: `${linkedId}|${date}|${type}|${category}`). Re-entrancy-guarded by `isCheckingAutoTransactions`.

`isInternal` records are excluded from income/expense stats but still count toward the balance (`context.ts:86`).

### i18n

`src/i18n.ts` holds a `Translations` interface plus full `ru` and `en` objects — adding a key requires updating all three. `getLocaleFromApp()` probes `document.documentElement.lang` → `localStorage.language` → `app.vault.getConfig('language')` → `navigator.language`, defaulting to Russian. Access via `ctx.tr` inside tabs; call `t(getLocaleFromApp(app))` in `main.ts` and modals.

### Styles

`styles.css` (~100KB) is **not** imported by the bundle. `main.ts injectStyles()` reads it from the plugin folder at runtime via `vault.adapter.read()` and injects a `<style>` element, to sidestep Obsidian's CSS caching. Consequence: shipping `main.js` without `styles.css` produces an unstyled plugin, and the `<style>` id (`finance-tracker-styles-v4`) is bumped when the injection scheme changes.

## Conventions

- **User-facing strings are Russian/English via i18n only** — never hardcode UI text. Internal identifiers are English camelCase.
- **No magic numbers.** Numeric literals other than 0/1/-1/2 go into `src/types.ts` or `src/constants.ts` as `UPPER_SNAKE_CASE` constants (`MOBILE_BREAKPOINT`, `SEARCH_DEBOUNCE_MS`, `DAYS_IN_YEAR`, …).
- **Mobile is mandatory.** Detection is `Platform.isMobile || window.innerWidth <= MOBILE_BREAKPOINT`, computed once at render (not reactive to resize). Tables need a card/block fallback via `DataTable` component; no horizontal scroll.
- Dates are `YYYY-MM-DD` strings and times are `HH:MM` (or `''`) — never `Date` objects in stored data. Normalize with `normalizeDateStr`/`normalizeTimeStr` from `src/utils.ts`; compare dates as strings.
- Shared formatting lives in `src/utils.ts`; do not duplicate it in modals.
- ESLint runs `strict-type-checked` + `stylistic-type-checked`. `prefer-nullish-coalescing`, `prefer-optional-chain`, and `consistent-type-definitions: interface` are errors.
- Tests cover business logic only (utils, domain modules, storage CRUD/migrations) — not DOM or modal rendering. `vitest.config.ts` aliases the `obsidian` module to `src/__tests__/mock-obsidian.ts`, so anything imported from `obsidian` must be stubbed there before it can be tested.
- `README.md` (Russian) and `README.en.md` (English) must both be updated when features or installation change.

**Current codebase stats:**
- ~71 source files (excluding tests)
- ~15,600 lines of TypeScript
- 7 storage files per account (meta, records, debts, credits, deposits, exchanges, state)
- 6 tabs (Overview, Records, Debts, Credits, Deposits, Currency)
- 15+ modals for CRUD operations

See `AGENTS.md` for historical conventions (some are outdated; trust `CLAUDE.md` and `CODEBASE.md` over `AGENTS.md`).

## Development Workflow

### For New Features or Significant Changes

1. **Planning phase** — use `/obsidian-finance-plan` skill:
   - Read `CODEBASE.md` and `CLAUDE.md`
   - Analyze architecture impact
   - Create implementation plan file
   - Get user approval

2. **Implementation phase** — use `/obsidian-finance-implement` skill:
   - Follow the plan
   - Read only relevant source files
   - Follow architecture patterns
   - Verify at each step (lint, build, test)

3. **Documentation sync** — use `/obsidian-finance-sync-docs` skill:
   - Update `CODEBASE.md` with new modules/flows/symbols
   - Keep concise and navigation-focused
   - Update README if user-visible changes

### For Bug Fixes or Minor Changes

1. Read `CODEBASE.md` to locate relevant code
2. Fix the issue following conventions
3. Verify: `npm run lint && npm run build && npm test`
4. Update `CODEBASE.md` only if architecture changed

### Verification is Mandatory

After ANY code change:

```bash
npm run lint   # Must exit 0 errors (warnings OK for no-explicit-any)
npm run build  # Must compile cleanly (tsc + esbuild)
npm test       # All tests must pass
```

If any step fails, the task is not complete.

