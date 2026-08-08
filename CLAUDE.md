# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Entry and rendering flow

`main.ts` registers a markdown code-block processor for the ` ```finance-account ` language. Every code block in every note instantiates its own `AccountView`, keyed by `ctx.sourcePath` — **the note path is the account identity**. There is no central account list; one note = one account.

```
main.ts (Plugin)
  └── FinanceStorage          — singleton, shared by all views
  └── AccountView             — one per code block; header, tab switching, auto-transactions
        └── ViewContext       — shared mutable bag: app, storage, data, state, locale, tr, isMobile
              ├── RecordsTab  — income/expense table, filters, analytics, import/export
              ├── DebtsTab
              ├── CreditsTab
              └── DepositsTab
```

`ViewContext` (`src/context.ts`) is the only thing tabs receive. It owns `data` (the loaded `AccountData`), `state` (`ViewState`: sorts/filters/pagination/column visibility), the resolved translations `tr`, and formatting helpers `fmt`/`fmtDate`. Tabs never touch `AccountView` directly; `DebtsTab` and `DepositsTab` expose an `onUpdate` callback that `AccountView` wires to `refreshAndRender()`.

Tab instances are recreated on every `renderBodyContent()` — tabs must be stateless across renders except for what lives in `ctx.state`.

### Storage layout

`FinanceStorage` (`src/storage.ts`) writes one folder per account under `.obsidian/plugins/<pluginId>/accounts/<folder>/`, split into `meta.json`, `records.json`, `debts.json`, `credits.json`, `deposits.json`, `state.json`. Each file type has its own in-memory cache Map + dirty Set; writes are debounced 500ms via a single shared timer and flushed by `flushDirty()`. `main.ts` `onunload()` awaits `storage.flush()` — losing that call loses unsaved data.

Folder name = last two path segments of the note joined with `_`, sanitized. Because that collapses distinct notes into the same name, `meta.json` carries a `sourcePath` field; on collision `ensureNoteFolder` allocates `<base>_1`, `_2`, … and records it in the in-memory `folderOverrides` map. **`folderOverrides` is not persisted** — it is rebuilt on each session by re-detecting the collision.

`load()` runs two migrations before reading: `migrateLegacy()` (single `<note>.json` → split flat files → per-folder files) and `migrateToShortFolder()` (full-path folder name → two-segment name). Field-level backfill for older schemas happens in the individual `loadX()` methods (e.g. `d.direction ??= 'borrowed'`, `c.payments ??= []`). `DATA_VERSION` is 4.

Note renames are handled by a vault `rename` event in `main.ts`: it moves the storage folder via `storage.renameAccount()` and re-keys the localStorage view-state entry.

### View state is persisted twice

`ctx.saveState()` writes to **both** `localStorage` (`ft-view:<pluginId>:<notePath>`) and `state.json` in the account folder. `loadState()` reads localStorage synchronously in the `ViewContext` constructor; `AccountView.render()` then awaits `loadStateFromFile()` which merges `state.json` over it. Both writes force `page: 0`. When adding a new state field, add a `??=` default in `loadState()` — old persisted blobs will be missing it.

### Derived records (`linkedId`)

Debts, credits, and deposits do not have separate ledgers — they **materialize `FinanceRecord`s into `records`** and tag them with `linkedId = <debt|credit|deposit>.id`. Deleting or editing a credit/deposit/debt means finding and rewriting those mirrored records (see `CreditsTab.ts:1147`, `DebtsTab.ts:1074`, `DepositsTab.ts:1061`). Any change to how these entities work must keep the mirrored records in sync, or balances drift.

`AccountView.checkAutoTransactions()` is the engine for this: it runs on every `render()` and `refreshAndRender()`, generates the full accrual/payment schedule the first time a deposit or credit is seen, marks past-due items paid, and pushes the corresponding income/expense records. It guards against duplicates by scanning for an existing record with the same `linkedId` + `date` + `type`. It is re-entrancy-guarded by `isCheckingAutoTransactions` but is **not** date-cached, so it re-runs on every render.

`isInternal` records are excluded from income/expense stats but still count toward the balance (`context.ts:130`, `RecordsTab.ts:153`).

### i18n

`src/i18n.ts` holds a `Translations` interface plus full `ru` and `en` objects — adding a key requires updating all three. `getLocaleFromApp()` probes `document.documentElement.lang` → `localStorage.language` → `app.vault.getConfig('language')` → `navigator.language`, defaulting to Russian. Access via `ctx.tr` inside tabs; call `t(getLocaleFromApp(app))` in `main.ts` and modals.

### Styles

`styles.css` (~100KB) is **not** imported by the bundle. `main.ts injectStyles()` reads it from the plugin folder at runtime via `vault.adapter.read()` and injects a `<style>` element, to sidestep Obsidian's CSS caching. Consequence: shipping `main.js` without `styles.css` produces an unstyled plugin, and the `<style>` id (`finance-tracker-styles-v4`) is bumped when the injection scheme changes.

## Conventions

- **User-facing strings are Russian/English via i18n only** — never hardcode UI text. Internal identifiers are English camelCase.
- **No magic numbers.** Numeric literals other than 0/1/-1/2 go into `src/types.ts` as `UPPER_SNAKE_CASE` constants (`MOBILE_BREAKPOINT`, `SEARCH_DEBOUNCE_MS`, `DAYS_IN_YEAR`, …).
- **Mobile is mandatory.** Detection is `Platform.isMobile || window.innerWidth <= MOBILE_BREAKPOINT`, computed once at render (not reactive to resize). Tables need a card/block fallback; no horizontal scroll.
- Dates are `YYYY-MM-DD` strings and times are `HH:MM` (or `''`) — never `Date` objects in stored data. Normalize with `normalizeDateStr`/`normalizeTimeStr` from `src/utils.ts`; compare dates as strings.
- Shared formatting lives in `src/utils.ts`; do not duplicate it in modals.
- ESLint runs `strict-type-checked` + `stylistic-type-checked`. `prefer-nullish-coalescing`, `prefer-optional-chain`, and `consistent-type-definitions: interface` are errors.
- Tests cover business logic only (utils, types, i18n, storage CRUD/migrations) — not DOM or modal rendering. `vitest.config.ts` aliases the `obsidian` module to `src/__tests__/mock-obsidian.ts`, so anything imported from `obsidian` must be stubbed there before it can be tested.
- `README.md` (Russian) and `README.en.md` (English) must both be updated when features or installation change.

`AGENTS.md` contains a longer-form version of these conventions plus a feature roadmap; parts of its file inventory and line counts are out of date, so trust the source tree over it.
