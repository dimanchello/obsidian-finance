---
name: run-obsidian-finance
description: Build, lint, test, and smoke-test the obsidian-finance plugin from source. Use when asked to run, build, verify, or test this plugin.
---

`obsidian-finance` is a TypeScript Obsidian plugin. It cannot be launched headless — the plugin runs inside Obsidian's Electron process. "Running" it means building the bundle and driving the pure-domain layer that covers all financial logic (`src/domain/`).

The driver at `.claude/skills/run-obsidian-finance/driver.mjs` is the agent path. It runs in seconds and covers build, lint, unit tests, and domain smoke assertions.

## Prerequisites

```bash
npm install   # installs vitest, esbuild, eslint, tsx, etc.
```

No OS packages needed. Node 18+ required (`node --version` → v22.23.2 in this container).

## Run (agent path)

```bash
node .claude/skills/run-obsidian-finance/driver.mjs
```

Output on success:
```
obsidian-finance driver

  ✓ build (tsc + esbuild)
  ✓ dist artefacts present
  ✓ lint (0 errors)
  ✓ unit tests
  ✓ domain smoke tests

All checks passed.
```

Add `--verbose` to see full command output at each step.

The driver runs these checks in order:

1. **build** — `npm run build` (tsc typecheck of src + tests, then esbuild bundle → `dist/`)
2. **dist artefacts** — verifies `dist/main.js`, `dist/manifest.json`, `dist/styles.css` exist
3. **lint** — `npm run lint` must exit with 0 errors (10 pre-existing `no-explicit-any` warnings are tolerated)
4. **unit tests** — `npm test` (246 tests across 15 files, ~2s)
5. **domain smoke** — imports and exercises `dateMath`, `money`, `csv`, `schedule`, `accountId`, `viewState` via `npx tsx`

## Direct domain invocation

For a PR that touches a specific domain module, skip the driver and import directly:

```bash
npx tsx --tsconfig tsconfig.json - <<'EOF'
import { addMonthsClamped } from './src/domain/dateMath.ts';
import { buildDepositSchedule } from './src/domain/schedule.ts';

console.log(addMonthsClamped('2026-01-31', 1));  // 2026-02-28
EOF
```

Available domain modules: `dateMath`, `money`, `schedule`, `autoTransactions`, `csv`, `accountId`, `validate`, `viewState`.

## Build (distribution)

```bash
npm run build
# → Built to dist/
ls dist/   # main.js  manifest.json  styles.css
```

Install into a vault: copy `dist/` to `<vault>/.obsidian/plugins/obsidian-finance/`.

## Test

```bash
npm test                                                        # all 246 tests
npx vitest run src/__tests__/dateMath.test.ts                  # single file
npx vitest run -t "addMonthsClamped"                          # single test by name
```

## Run (human path)

Not applicable headless. The plugin must be installed into a live Obsidian vault — copy `dist/` to the vault's plugin directory and enable it in Obsidian settings.

## Gotchas

- **`obsidian` module is stubbed in tests** — `src/__tests__/mock-obsidian.ts` replaces the real package. Any new Obsidian API used in source must be added there before it can appear in tests.
- **Two tsconfig projects** — `tsconfig.json` covers `src/` (with `noUncheckedIndexedAccess: true`); `src/__tests__/tsconfig.json` covers tests (same flags minus `noUncheckedIndexedAccess`). `npm run build` checks both. ESLint is configured with both paths via `eslint.config.mjs`.
- **`npx tsx` resolves from the npx cache** — if the cache is cold, first run downloads tsx (~1s). Subsequent runs are instant.
- **`npm run dev`** starts esbuild in watch mode (writes sourcemap-annotated `dist/main.js`). It never exits — not useful from a script.
- **Domain functions are pure** — they take explicit `today`/`newId` deps and return new data; they never touch the filesystem or Obsidian APIs. This makes them safe to import and call directly.

## Troubleshooting

| Error | Fix |
|---|---|
| `Cannot find module './src/domain/…'` when running smoke manually | Pass absolute paths; the smoke script in the driver uses `ROOT`-prefixed imports. |
| `npm run lint` exits 0 but shows "10 warnings" | Expected. All 10 are pre-existing `@typescript-eslint/no-explicit-any` in framework glue code. |
| `tsc --noEmit` fails on test files | Run `tsc -p src/__tests__/tsconfig.json` instead; test files are excluded from root tsconfig. |
| Build output missing `styles.css` | `npm run build` copies `styles.css` from root. If it's missing at root, the copy fails silently — check `ls styles.css`. |
