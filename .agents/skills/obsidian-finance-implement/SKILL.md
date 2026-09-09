---
name: obsidian-finance-implement
description: Implement a feature or fix in the obsidian-finance Obsidian plugin, following its architecture, conventions and code style. Use when writing or modifying code in this repository.
---

# Obsidian Finance: Feature Implementation

You are implementing a feature or fix in the Obsidian Finance plugin. This
codebase enforces its conventions strictly — lint, build and tests all gate the
change, and several rules below are not machine-checkable but will be rejected
in review.

## Pre-flight

1. Read `CODEBASE.md` — it is the navigation index: architecture map, module
   dependencies, symbol index. Use it to find the subsystem before searching.
2. Read `CLAUDE.md` — conventions, storage layout, current codebase stats.
3. Read the plan file, if one was provided.
4. Read **only** the source files your task touches. Do not scan `src/`.
   `CODEBASE.md` is a navigation index, not a source of truth: if it disagrees
   with the code, the code wins — and update `CODEBASE.md`.

## Hard rules

Violating any of these fails review.

### Domain values come from `src/constants.ts`

Never write a raw string literal for a status, entity type, direction,
movement, or operation. Every reusable domain value is exported from
`src/constants.ts` and re-exported through `src/types.ts`:

`RecordType.INCOME` / `.EXPENSE`, `CreditStatus.ACTIVE` / `.PAID`,
`DepositStatus.ACTIVE` / `.CLOSED`, `PaymentStatus.PENDING` / `.PAID`,
`DebtDirection.LENT` / `.BORROWED`, `DebtMovementType.BORROW` / `.REPAY`,
`DepositAccrualType.TO_ACCOUNT` / `.CAPITALIZATION`,
`CurrencyOperationType.BUY` / `.SELL` / `.ADD` / `.SPEND`, `CreditType`,
`DepositType`, `EarlyRepaymentOption`, `DownPaymentType`.

This applies to production code **and** to tests. Write
`type: RecordType.EXPENSE` in a fixture, never `type: 'expense'`.

Each constant object is `as const` with a matching `ValueOf` union type of the
same name, so the value and the type share one declaration. Adding a member
widens both the type and the runtime validator in `domain/validate.ts`.

### Semantic numbers become named constants

Any numeric literal carrying meaning — pagination, page size, limit,
threshold, timeout, debounce delay, calculation step, breakpoint — goes to
`src/types.ts` or `src/constants.ts` as `UPPER_SNAKE_CASE`. Existing examples:
`MOBILE_BREAKPOINT`, `SEARCH_DEBOUNCE_MS`, `MODAL_FOCUS_DELAY_MS`,
`AUTOFILL_DEBOUNCE_MS`, `DAYS_IN_YEAR`, `PAGE_SIZE_OPTIONS`,
`CREDIT_PAGE_SIZE`, `AUTO_TX_INTERVAL_MS`, `OVERVIEW_UPCOMING_DAYS`.

Exempt: trivial primitives (`0`, `1`, `-1`, `2`) and simple basic operations
such as `str.slice(0, 10)` or an index offset `i + 1`. Everything else is named.

### i18n — правка всегда в трёх местах

`src/i18n.ts` содержит интерфейс `Translations` и полные объекты `ru` и `en`.
Adding a key requires updating all three; a missing key is a type error in one
language and a silent gap in the other. Never hardcode UI text. Access
translations via `ctx.tr` inside tabs and `t(getLocaleFromApp(app))` in
`main.ts` and modals. Internal identifiers stay English camelCase.

### Dates and times are strings

Stored data never contains `Date` objects. Dates are `YYYY-MM-DD`, times are
`HH:MM` or `''`. Normalize with `normalizeDateStr()` / `normalizeTimeStr()` from
`src/utils.ts` and compare dates as strings. Shared formatting lives in
`src/utils.ts` — do not duplicate it in modals.

### Entities with linked records go through `AccountCommands`

Debts, credits and deposits have no separate ledgers. They materialize
`FinanceRecord`s into `records` tagged with `linkedId = <entity>.id`. Use
`src/domain/AccountCommands.ts` so the entity and its records change together;
direct `storage.addX()` calls from tabs were deliberately eliminated (62 → 0).
Do not reintroduce them.

### New `ViewState` fields need a default in the parser

`state.json` in the account folder is the **single source of truth** for view
state — there is no localStorage fallback. `ctx.saveState()` writes it;
`AccountView.render()` awaits `ctx.loadStateFromFile()`. Both writes force
`page: 0`. When you add a field to `ViewState`, add a `??=` default in
`src/domain/viewState.ts:parseViewState()` — persisted blobs from older versions
will not have it. Reset `page: 0` whenever filters change.

### Mobile is mandatory

Detection is `Platform.isMobile || window.innerWidth <= MOBILE_BREAKPOINT`,
computed once at render and not reactive to resize. Tables must use `DataTable`,
which renders a card/block fallback automatically. No horizontal scroll.

### Auto-transactions must be idempotent

`AccountView.checkAutoTransactions()` runs on **every** render plus hourly via
`AutoTxScheduler`, delegating to `applyAutoTransactions()` in
`src/domain/autoTransactions.ts`. Idempotency comes from `RecordMirror`, keyed
on `${linkedId}|${date}|${type}|${category}`. Any new scheduled record must go
through `mirror.ensure()` or it will duplicate on the next render.

### Storage writes are debounced

`FileStore<T>` caches and marks dirty; the shared `FlushScheduler` writes after
500 ms. Never assume data is on disk immediately after a call returns.

### Type-level rules enforced by ESLint

`strict-type-checked` + `stylistic-type-checked` are on.
`prefer-nullish-coalescing` (`??`, not `||`), `prefer-optional-chain` (`?.`) and
`consistent-type-definitions: interface` are **errors**, not warnings. Avoid
`any`; use `unknown` plus a type guard. Ten pre-existing `no-explicit-any`
warnings in framework glue are tolerated — do not add more.

## Imitate an existing file

Do not invent structure. For each kind of work there is a file in the repository
that already does it correctly — read it and follow its shape.

| Task | Read and imitate |
|---|---|
| List with sort / filter / pagination / mobile cards | `src/tabs/DepositsTab.ts` (also CreditsTab, CurrencyTab, RecordsTab, DebtsTab — all five use `DataTable`) |
| Create/edit form modal | `src/CreditModal.ts` (9 subclasses of `EntityModal<T>`) |
| Helper modal that is not CRUD | `src/ConfirmModal.ts` (7 subclasses of `FinanceBaseModal`) |
| Entity + linked records changed atomically | `src/domain/AccountCommands.ts` — see `addCredit()`, `addDebtMovement()`, `deleteDeposit()` |
| Pure calculation module | `src/domain/creditCalculations.ts` |
| Scheduled record materialization | `src/domain/autoTransactions.ts` + `src/domain/schedule.ts` |
| Domain unit test | `src/__tests__/dateMath.test.ts` |
| Chart | `src/ui/charts/` + `src/ui/chartHelpers.ts` |

`EntityModal<T>` requires four members: `getTitle()`, `buildForm(form)`,
`validate()` returning `string | null`, and `collectData()` returning `T`.
Optional hooks: `getSaveLabel()`, `getInfoFields()`, `onFormReady()`.

`DataTable<T>` is configured by object, not subclassed. Required keys include
`ctx`, `items()`, `itemId()`, `columns`, `rowActions`, `filterControls`,
`sortFields`, `state`, `renderStats`, `renderCard`, `emptyState`,
`emptyFiltered`, `hasAnyItems`. Read the interface at the top of
`src/ui/DataTable.ts` before configuring one.

## Layers

- `src/domain/` — pure business logic. No DOM, no Obsidian API. Takes explicit
  `today` / `newId` dependencies and returns new data, which is what makes it
  directly testable.
- `src/storage/` — `FinanceStorage` plus one `FileStore<T>` per file kind.
  Account folder is `.obsidian/plugins/<pluginId>/accounts/<accountId>/` with 7
  files: `meta.json`, `records.json`, `debts.json`, `credits.json`,
  `deposits.json`, `exchanges.json`, `state.json`.
- `src/tabs/` — stateless. Tab instances are recreated on every
  `renderBodyContent()`; anything that must survive a render lives in
  `ctx.state`. Tabs receive only `ViewContext` and expose `onUpdate`, which
  `AccountView` wires to `refreshAndRender()`.
- `src/ui/` — reusable components and form/table/chart helpers.
- Modals live at `src/` root (plus `src/modals/CurrencyExchangeModal.ts`).

`AccountId` is a 12-hex slice of a UUID, minted once per code block and stored
in the note body as `id: <12-hex>`. The note path is **not** identity — it is
tracked in `meta.sourcePath` for diagnostics only.

`isInternal` records are excluded from income/expense statistics but still count
toward the balance.

`styles.css` is not bundled. `main.ts injectStyles()` reads it at runtime from
the plugin folder, so a new style must ship in `styles.css`, and shipping
`main.js` alone yields an unstyled plugin.

## Tests

Cover business logic only: `src/domain/`, `src/utils.ts`, storage CRUD and
migrations. Do **not** test DOM rendering, modals, or Obsidian API calls. Use
`describe` + `it`. `vitest.config.ts` aliases the `obsidian` module to
`src/__tests__/mock-obsidian.ts`, so any newly used Obsidian API must be stubbed
there before it can appear in a test.

Fixtures obey the constants rule exactly as production code does:

```typescript
import { describe, it, expect } from 'vitest';
import { RecordType } from '../constants';

describe('someDomainFunction', () => {
  it('excludes internal records from expenses', () => {
    const records = [
      { id: 'a', type: RecordType.EXPENSE, amount: 100, date: '2026-01-15', isInternal: false },
      { id: 'b', type: RecordType.EXPENSE, amount: 50,  date: '2026-01-16', isInternal: true },
    ];
    expect(totalExpenses(records)).toBe(100);
  });
});
```

Two TypeScript projects exist: `tsconfig.json` covers `src/` with
`noUncheckedIndexedAccess: true`; `src/__tests__/tsconfig.json` covers tests
with the same flags minus that one. `npm run build` checks both.

## Data migration

When the stored shape changes:

1. Update the interface in `src/types.ts`.
2. Update the parser in `src/domain/validate.ts`.
3. Backfill in the parser with `??=` — this is how older schemas are handled
   (`d.direction ??= DebtDirection.BORROWED`, `c.payments ??= []`).
4. Only for a genuinely incompatible change, bump `DATA_VERSION` in
   `src/storage/index.ts` (currently 1).

## Verification — mandatory

```bash
npm run lint   # 0 errors; only pre-existing no-explicit-any warnings tolerated
npm run build  # tsc --noEmit on both projects + esbuild
npm test       # vitest run — all tests must pass
```

All three must pass. If any fails, the task is not done. Single file:
`npx vitest run src/__tests__/<name>.test.ts`. Single test by name:
`npx vitest run -t "<name>"`.

## Completion checklist

- [ ] No raw string literals for domain state, in `src/` or `src/__tests__/`
- [ ] No unnamed semantic numbers
- [ ] New user-facing strings added to `Translations`, `ru` and `en`
- [ ] Mobile path works via `DataTable`; no horizontal scroll
- [ ] Entities with `linkedId` records go through `AccountCommands`
- [ ] New `ViewState` fields have a `??=` default in `parseViewState()`
- [ ] New scheduled records go through `mirror.ensure()`
- [ ] Tests added for new domain logic
- [ ] `npm run lint && npm run build && npm test` all pass
- [ ] `CODEBASE.md` updated if a module, flow or pattern changed
- [ ] `README.md` **and** `README.en.md` updated if the change is user-visible
