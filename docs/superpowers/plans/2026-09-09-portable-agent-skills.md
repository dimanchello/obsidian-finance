# План реализации: переносимые навыки агентов для obsidian-finance

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОД-НАВЫК: используйте
> superpowers:subagent-driven-development (рекомендуется) или
> superpowers:executing-plans для выполнения этого плана задача за задачей.
> Шаги помечены чекбоксами (`- [ ]`) для отслеживания.

**Цель:** Свести все навыки проекта к единому источнику
`.agents/skills/<name>/SKILL.md`, читаемому Claude Code, Gemini CLI и
Antigravity, и привести навык `obsidian-finance-implement` в соответствие с
фактическими паттернами кодовой базы.

**Архитектура:** Канонический текст лежит один раз в `.agents/skills/`. В
`.claude/skills/` и `.gemini/skills/` ведут относительные симлинки. Тонкие
файлы-обёртки (`.gemini/commands/*.toml`, `.agents/workflows/*.md`) делают
навыки вызываемыми как слеш-команды. Правка одного канонического файла видна
всем агентам сразу.

**Стек:** Markdown с YAML-frontmatter (`name`, `description`), TOML для команд
Gemini, относительные симлинки POSIX, Node.js 22 для `driver.mjs`.

## Глобальные ограничения

- **Тексты навыков — на английском.** План, коммиты и обсуждение — на русском.
- **Frontmatter каждого `SKILL.md` — ровно два ключа:** `name` (совпадает с
  именем каталога) и `description`. Этот формат общий для всех трёх агентов.
- **Никаких изменений в `src/`.** В рабочей копии есть незакоммиченная работа
  (OverviewTab, overviewMetrics, графики) — её не трогать и не коммитить.
- **Симлинки только относительные** (`../../.agents/skills/<name>`), чтобы
  дерево оставалось валидным после клонирования и перемещения.
- **`git mv`, не `cp`+`rm`** — история файлов должна сохраниться.
- **Фактические числа кодовой базы** (проверены на момент 2026-09-09): 72
  файла `.ts` вне тестов, 16 671 строка, 28 файлов тестов, 512 блоков `it()`,
  6 вкладок, 9 подклассов `EntityModal<T>`, 7 подклассов `FinanceBaseModal`,
  7 файлов хранилища на счёт. В навыках не дублировать эти числа — ссылаться на
  `CLAUDE.md`; исключение — `run-obsidian-finance`, где число тестов есть в
  описании шагов драйвера.
- **Проверка после каждой задачи** — команда из раздела «Проверка» этой задачи
  должна пройти до коммита.

---

## Структура файлов

Что создаётся и за что отвечает:

| Путь | Ответственность |
|---|---|
| `.agents/skills/obsidian-finance-plan/SKILL.md` | Канон: протокол уточняющих вопросов + структура плана |
| `.agents/skills/obsidian-finance-implement/SKILL.md` | Канон: жёсткие правила кодовой базы + таблица эталонов |
| `.agents/skills/obsidian-finance-review/SKILL.md` | Канон: чек-листы ревью и покрытия тестами |
| `.agents/skills/obsidian-finance-sync-docs/SKILL.md` | Канон: обновление `CODEBASE.md` |
| `.agents/skills/run-obsidian-finance/SKILL.md` | Канон: сборка/линт/тесты/смок |
| `.agents/skills/run-obsidian-finance/driver.mjs` | Исполняемый драйвер (перемещается, содержимое правится в одной строке) |
| `.claude/skills/<name>` × 5 | Симлинк → `../../.agents/skills/<name>` |
| `.gemini/skills/<name>` × 5 | Симлинк → `../../.agents/skills/<name>` |
| `.gemini/commands/<name>.toml` × 5 | Обёртка: `description` + `prompt` со `{{args}}` |
| `.agents/workflows/<name>.md` × 5 | Обёртка: frontmatter `description` + тело |
| `CLAUDE.md` | Раздел Development Workflow: канонический путь и точки входа |

Границы задач проведены так, чтобы каждая давала самостоятельно проверяемый
результат: сначала переезд (Задача 1), затем содержательные правки канона
(Задачи 2–5, независимы друг от друга), затем точки входа агентов (Задача 6),
затем документация и финальная сверка (Задача 7).

---

## Задача 1: Переезд навыков в канонический каталог

**Файлы:**
- Создать: `.agents/skills/obsidian-finance-plan/SKILL.md` (из плоского файла)
- Создать: `.agents/skills/obsidian-finance-implement/SKILL.md`
- Создать: `.agents/skills/obsidian-finance-review/SKILL.md`
- Создать: `.agents/skills/obsidian-finance-sync-docs/SKILL.md`
- Переместить: `.claude/skills/run-obsidian-finance/{SKILL.md,driver.mjs}` →
  `.agents/skills/run-obsidian-finance/`
- Изменить: `.agents/skills/run-obsidian-finance/driver.mjs:10` (путь в комментарии)

**Интерфейсы:**
- Производит: пять каталогов навыков в `.agents/skills/`, каждый с `SKILL.md`;
  рабочий `driver.mjs` по новому пути. Задачи 2–5 правят содержимое этих
  файлов; Задача 6 создаёт ссылки на эти каталоги.

- [ ] **Шаг 1: Создать каталоги и перенести файлы через `git mv`**

Каталог `.agents/skills/run-obsidian-finance/` уже существует (пустой,
неотслеживаемый), поэтому `mkdir -p` безопасен.

```bash
cd /home/angus123/project/js/obsidian-finance
mkdir -p .agents/skills/obsidian-finance-plan \
         .agents/skills/obsidian-finance-implement \
         .agents/skills/obsidian-finance-review \
         .agents/skills/obsidian-finance-sync-docs \
         .agents/skills/run-obsidian-finance \
         .agents/workflows \
         .gemini/skills \
         .gemini/commands

git mv .claude/skills/obsidian-finance-plan.md      .agents/skills/obsidian-finance-plan/SKILL.md
git mv .claude/skills/obsidian-finance-implement.md .agents/skills/obsidian-finance-implement/SKILL.md
git mv .claude/skills/obsidian-finance-review.md    .agents/skills/obsidian-finance-review/SKILL.md
git mv .claude/skills/obsidian-finance-sync-docs.md .agents/skills/obsidian-finance-sync-docs/SKILL.md
git mv .claude/skills/run-obsidian-finance/SKILL.md   .agents/skills/run-obsidian-finance/SKILL.md
git mv .claude/skills/run-obsidian-finance/driver.mjs .agents/skills/run-obsidian-finance/driver.mjs
```

- [ ] **Шаг 2: Проверить, что старый каталог пуст, и что все пять `SKILL.md` на месте**

```bash
ls .claude/skills/ 2>&1
ls .agents/skills/*/SKILL.md
```

Ожидается: `ls .claude/skills/` выводит пустой список (или сообщение об
отсутствии каталога); второй `ls` печатает ровно пять путей.

- [ ] **Шаг 3: Обновить путь в шапке `driver.mjs`**

Строка 10 файла `.agents/skills/run-obsidian-finance/driver.mjs` содержит
устаревший путь. Заменить

```
 *   node .claude/skills/run-obsidian-finance/driver.mjs [--verbose]
```

на

```
 *   node .agents/skills/run-obsidian-finance/driver.mjs [--verbose]
```

- [ ] **Шаг 4: Запустить драйвер с нового пути**

```bash
node .agents/skills/run-obsidian-finance/driver.mjs
```

Ожидается: пять строк `✓` (build, dist artefacts, lint, unit tests, domain
smoke) и `All checks passed.`

Правка вычисления корня не требуется, и это проверено: `driver.mjs:19` содержит
`const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')`.
Из `.agents/skills/run-obsidian-finance/` три уровня вверх дают корень проекта —
ровно как и из `.claude/skills/run-obsidian-finance/`. Глубина вложенности
совпадает, поэтому `ROOT` разрешается в тот же каталог.

- [ ] **Шаг 5: Коммит**

```bash
git add -A .agents .claude
git commit -m "refactor: move skills to canonical .agents/skills

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Проверка:** `node .agents/skills/run-obsidian-finance/driver.mjs` завершается
успешно; `git status --short src/` не показывает изменений.

---

## Задача 2: Переписать `obsidian-finance-implement`

**Файлы:**
- Заменить целиком: `.agents/skills/obsidian-finance-implement/SKILL.md`

**Интерфейсы:**
- Потребляет: каталог из Задачи 1.
- Производит: канонический текст навыка реализации. Задача 7 сверяет упомянутые
  в нём пути с файловой системой.

**Что именно неверно в текущем тексте** (проверено по исходникам, не по докам):

| Строка | Текущее утверждение | Факт |
|---|---|---|
| `:79` | «ViewState persisted in both `localStorage` and `state.json`» | `state.json` — единственный источник истины, fallback на localStorage отсутствует (`CLAUDE.md:79`) |
| `:289` | чек-лист «State changes persist correctly (localStorage + state.json)» | то же |
| — | правило про `src/constants.ts` отсутствует полностью | жёсткое правило: никаких строковых литералов для доменных состояний, и в `src/`, и в `src/__tests__/` |
| `:55` | «No magic numbers» одной строкой | нужны исключения: `0`, `1`, `-1`, `2`, `slice(0, 10)`, `i + 1` |
| `:86-173` | выдуманные скелеты `NewEntity` / `NewTab` / `NewModal` | заменяются таблицей эталонов из реальных файлов |
| `:191` | «One assertion per test» | набор тестов написан не так; правило убрать |

- [ ] **Шаг 1: Записать новый файл — часть 1 из 4 (frontmatter, преамбула, жёсткие правила)**

Полностью перезаписать `.agents/skills/obsidian-finance-implement/SKILL.md`
следующим содержимым:

````markdown
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
````

- [ ] **Шаг 2: Проверить frontmatter**

```bash
head -5 .agents/skills/obsidian-finance-implement/SKILL.md
```

Ожидается: строка `---`, затем `name: obsidian-finance-implement`, затем
`description: ...`, затем `---`. Имя обязано совпадать с именем каталога.

- [ ] **Шаг 3: Дописать часть 2 из 4 (остальные жёсткие правила)**

Добавить в конец файла:

````markdown
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
````
- [ ] **Шаг 4: Дописать часть 3 из 4 (таблица эталонов и слои)**

Добавить в конец файла:

````markdown
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
````
- [ ] **Шаг 5: Дописать часть 4 из 4 (тесты, миграции, проверка, чек-лист)**

Добавить в конец файла:

````markdown
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
````

- [ ] **Шаг 6: Убедиться, что устаревшие утверждения исчезли**

```bash
grep -n "localStorage\|NewEntity\|One assertion\|246 tests" \
  .agents/skills/obsidian-finance-implement/SKILL.md
```

Ожидается: пустой вывод (код возврата 1). Любое совпадение означает, что
фрагмент старого текста остался.

- [ ] **Шаг 7: Убедиться, что новые обязательные правила присутствуют**

```bash
grep -c "src/constants.ts\|AccountCommands\|parseViewState\|mirror.ensure\|MOBILE_BREAKPOINT" \
  .agents/skills/obsidian-finance-implement/SKILL.md
```

Ожидается: число не меньше 5.

- [ ] **Шаг 8: Коммит**

```bash
git add .agents/skills/obsidian-finance-implement/SKILL.md
git commit -m "docs(skills): rewrite implement skill against actual codebase

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Проверка:** оба `grep` из шагов 6–7 дают ожидаемый результат.




---

## Задача 3: Точечные правки `obsidian-finance-plan`

**Файлы:**
- Изменить: `.agents/skills/obsidian-finance-plan/SKILL.md` (frontmatter, чек-лист
  качества плана, удаление выдуманных скелетов из шаблона плана)

**Интерфейсы:**
- Потребляет: каталог из Задачи 1.
- Производит: канонический навык планирования. Протокол уточняющих вопросов
  (строки ~10–104 исходного файла) сохраняется без изменений — это его ценность.

- [ ] **Шаг 1: Обновить `description` во frontmatter**

Заменить строки 1–4 файла на:

```markdown
---
name: obsidian-finance-plan
description: Create an implementation plan for a feature or fix in the obsidian-finance plugin. Asks clarifying questions before planning. Use before writing code for anything non-trivial.
---
```

- [ ] **Шаг 2: Заменить блок «Architecture Analysis → Data Model» на ссылки на эталоны**

В шаблоне плана есть выдуманные примеры (`interface NewEntity`, `NewTab`,
`NewModal`, `newEntities.json`). Они безвредны как заполнители формы, но
провоцируют копирование. Заменить подраздел `### Data Model` (начинается со
строки `**New Types:**`) на:

```markdown
### Data Model

**New types:** list each interface to add to `src/types.ts`, with its fields.

**Type changes:** list each existing interface and the field being added.

**Domain constants:** any new status / type / direction goes to
`src/constants.ts` as an `as const` object plus its `ValueOf` union — never a
bare string union. See the existing `CreditStatus` / `DepositStatus` pairs.

**Numeric constants:** every semantic number named in `UPPER_SNAKE_CASE` in
`src/types.ts` or `src/constants.ts`.
```

- [ ] **Шаг 3: Расширить «Plan Quality Checklist»**

К существующему чек-листу (строки ~503–518) добавить три пункта:

```markdown
- [ ] Domain values planned as `src/constants.ts` entries, not string literals
- [ ] Semantic numbers planned as named constants
- [ ] i18n keys listed for `Translations`, `ru` and `en` — all three
```

- [ ] **Шаг 4: Исправить путь сохранения плана**

Строка «Save to file: `implementation-plan-[feature-name].md` in project root»
противоречит фактическому расположению планов. Заменить на:

```markdown
1. **Save to file:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
```

- [ ] **Шаг 5: Проверить**

```bash
head -4 .agents/skills/obsidian-finance-plan/SKILL.md
grep -c "src/constants.ts" .agents/skills/obsidian-finance-plan/SKILL.md
grep -n "implementation-plan-\[feature-name\]" .agents/skills/obsidian-finance-plan/SKILL.md
```

Ожидается: frontmatter с `name: obsidian-finance-plan`; счётчик ≥ 2; последний
`grep` — пустой вывод.

- [ ] **Шаг 6: Коммит**

```bash
git add .agents/skills/obsidian-finance-plan/SKILL.md
git commit -m "docs(skills): add constants and i18n gates to plan skill

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Проверка:** три команды из шага 5 дают ожидаемый результат.

---

## Задача 4: Точечные правки `obsidian-finance-review`

**Файлы:**
- Изменить: `.agents/skills/obsidian-finance-review/SKILL.md` (frontmatter,
  раздел Constants, строка про localStorage, раздел i18n)

**Интерфейсы:**
- Потребляет: каталог из Задачи 1.
- Производит: канонический навык ревью.

- [ ] **Шаг 1: Обновить frontmatter**

Заменить строки 1–4 на:

```markdown
---
name: obsidian-finance-review
description: Review code changes in the obsidian-finance plugin for architecture conformance, convention violations and test coverage. Use after implementing a feature or before merging.
---
```

- [ ] **Шаг 2: Заменить подраздел «Constants» на проверку доменных литералов**

Найти в разделе «Step 3: Code Quality Review» блок:

```markdown
**Constants:**
- [ ] No magic numbers (all extracted to `UPPER_SNAKE_CASE`)
- [ ] Constants in `src/types.ts` or `src/constants.ts`
- [ ] Meaningful names (not `CONSTANT_1`, `CONSTANT_2`)
```

Заменить на:

```markdown
**Constants:**
- [ ] No raw string literals for domain state — statuses, entity types,
      directions, movements, operations all come from `src/constants.ts`
- [ ] The same holds in `src/__tests__/` — fixtures use `RecordType.EXPENSE`,
      never `'expense'`
- [ ] No unnamed semantic numbers; only `0`, `1`, `-1`, `2` and simple basic
      operations such as `slice(0, 10)` or `i + 1` are exempt
- [ ] Numeric constants in `src/types.ts` or `src/constants.ts`, named
      `UPPER_SNAKE_CASE` and meaningful (not `CONSTANT_1`)
```

Быстрая механическая проверка на нарушения:

```bash
grep -rnE "(status|type|direction) *[:=]+ *'(active|paid|closed|pending|income|expense|lent|borrowed|borrow|repay|buy|sell)'" \
  src --include=*.ts
```

Ожидается пустой вывод — на 2026-09-09 нарушений нет.

- [ ] **Шаг 3: Исправить строку про localStorage**

Строка 111 содержит `- [ ] State persistence works (localStorage + state.json)`.
Заменить на:

```markdown
- [ ] State persistence works — `state.json` only; there is no localStorage
      fallback. New `ViewState` fields have a `??=` default in `parseViewState()`
```

- [ ] **Шаг 4: Уточнить раздел i18n**

В «Step 6: i18n Review» к блоку **Completeness** добавить:

```markdown
- [ ] Every new key present in all three places: the `Translations` interface,
      the `ru` object and the `en` object
```

- [ ] **Шаг 5: Проверить**

```bash
grep -n "localStorage" .agents/skills/obsidian-finance-review/SKILL.md
grep -c "src/constants.ts" .agents/skills/obsidian-finance-review/SKILL.md
```

Ожидается: первый `grep` — пустой вывод; счётчик ≥ 1.

- [ ] **Шаг 6: Коммит**

```bash
git add .agents/skills/obsidian-finance-review/SKILL.md
git commit -m "docs(skills): add constants and i18n checks to review skill

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Проверка:** обе команды из шага 5 дают ожидаемый результат.

---

## Задача 5: Правки `obsidian-finance-sync-docs` и `run-obsidian-finance`

**Файлы:**
- Изменить: `.agents/skills/obsidian-finance-sync-docs/SKILL.md` (только frontmatter)
- Изменить: `.agents/skills/run-obsidian-finance/SKILL.md` (пути и число тестов)

**Интерфейсы:**
- Потребляет: каталоги из Задачи 1, включая уже перемещённый `driver.mjs`.
- Производит: два канонических навыка без устаревших путей.

- [ ] **Шаг 1: Обновить frontmatter `sync-docs`**

Архитектурного дрейфа в этом навыке нет — меняется только описание, чтобы
активация срабатывала точнее. Заменить строки 1–4 на:

```markdown
---
name: obsidian-finance-sync-docs
description: Update CODEBASE.md after implementation work on the obsidian-finance plugin. Use after adding modules, changing execution flows or introducing patterns.
---
```

- [ ] **Шаг 2: Обновить пути в `run-obsidian-finance/SKILL.md`**

Заменить `.claude/skills/run-obsidian-finance/driver.mjs` на
`.agents/skills/run-obsidian-finance/driver.mjs` в двух местах — строка 8
(«The driver at ...») и строка 21 (блок с командой запуска).

```bash
grep -n "\.claude/skills" .agents/skills/run-obsidian-finance/SKILL.md
```

Ожидается после правки: пустой вывод.

- [ ] **Шаг 3: Исправить число тестов**

Строка 44 говорит «246 tests across 15 files, ~2s», строка 75 — «all 246 tests».
Фактически: 28 файлов, 512 блоков `it()`. Заменить на «512 tests across 28
files, ~2s» и «all tests» соответственно.

Пересчитать перед правкой, чтобы не зафиксировать снова устаревшее число:

```bash
ls src/__tests__/*.test.ts | wc -l
grep -c "  it(" src/__tests__/*.test.ts | awk -F: '{s+=$2} END {print s}'
```

Использовать в тексте полученные числа, а не приведённые здесь, если они
разошлись.

- [ ] **Шаг 4: Запустить драйвер ещё раз**

```bash
node .agents/skills/run-obsidian-finance/driver.mjs
```

Ожидается: `All checks passed.`

- [ ] **Шаг 5: Коммит**

```bash
git add .agents/skills/obsidian-finance-sync-docs/SKILL.md \
        .agents/skills/run-obsidian-finance/SKILL.md
git commit -m "docs(skills): fix paths and test counts after move

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Проверка:** `grep -rn "\.claude/skills" .agents/` даёт пустой вывод; драйвер
проходит.

---

## Задача 6: Точки входа для всех агентов

**Файлы:**
- Создать: `.claude/skills/<name>` × 5 — симлинки
- Создать: `.gemini/skills/<name>` × 5 — симлинки
- Создать: `.gemini/commands/<name>.toml` × 5
- Создать: `.agents/workflows/<name>.md` × 5

**Интерфейсы:**
- Потребляет: пять каталогов навыков в `.agents/skills/` (Задачи 1–5).
- Производит: работающие слеш-команды на трёх агентах.

Почему именно так: официальный кодлаб Google по Antigravity создаёт
`.agents/skills` и `.agents/workflows`; документация Gemini CLI называет
`.agents/skills/` алиасом `.gemini/skills/`. То есть канонический каталог
читается обоими нативно, а обёртки нужны, чтобы навык был *вызываемым*
слеш-командой, а не только обнаружимым текстом.

- [ ] **Шаг 1: Создать симлинки**

```bash
cd /home/angus123/project/js/obsidian-finance
for n in obsidian-finance-plan obsidian-finance-implement \
         obsidian-finance-review obsidian-finance-sync-docs \
         run-obsidian-finance; do
  ln -sfn "../../.agents/skills/$n" ".claude/skills/$n"
  ln -sfn "../../.agents/skills/$n" ".gemini/skills/$n"
done
```

- [ ] **Шаг 2: Проверить, что все десять симлинков разрешаются**

```bash
for d in .claude/skills .gemini/skills; do
  for n in obsidian-finance-plan obsidian-finance-implement \
           obsidian-finance-review obsidian-finance-sync-docs \
           run-obsidian-finance; do
    test -f "$d/$n/SKILL.md" && echo "ok   $d/$n" || echo "FAIL $d/$n"
  done
done
```

Ожидается: десять строк `ok`, ни одной `FAIL`. `test -f` проходит через
симлинк, поэтому это проверяет и ссылку, и наличие целевого файла.

- [ ] **Шаг 3: Создать пять TOML-обёрток для Gemini CLI**

Формат: обязательное поле `prompt`, необязательное `description`. `{{args}}`
подставляет текст после имени команды; если аргументов нет, CLI отправляет
промпт как есть.

`.gemini/commands/obsidian-finance-implement.toml`:

```toml
description = "Implement a feature or fix in obsidian-finance, following its architecture and conventions."
prompt = """
Read `.agents/skills/obsidian-finance-implement/SKILL.md` and follow it exactly.
Read `CODEBASE.md` and `CLAUDE.md` first, as that skill instructs.

Task: {{args}}
"""
```

`.gemini/commands/obsidian-finance-plan.toml`:

```toml
description = "Create an implementation plan for an obsidian-finance feature, asking clarifying questions first."
prompt = """
Read `.agents/skills/obsidian-finance-plan/SKILL.md` and follow it exactly,
including its requirement to ask clarifying questions before planning.

Feature to plan: {{args}}
"""
```

`.gemini/commands/obsidian-finance-review.toml`:

```toml
description = "Review obsidian-finance changes for architecture, conventions and test coverage."
prompt = """
Read `.agents/skills/obsidian-finance-review/SKILL.md` and follow it exactly.

Review scope: {{args}}
"""
```

`.gemini/commands/obsidian-finance-sync-docs.toml`:

```toml
description = "Update CODEBASE.md after implementation work on obsidian-finance."
prompt = """
Read `.agents/skills/obsidian-finance-sync-docs/SKILL.md` and follow it exactly.

Changes to document: {{args}}
"""
```

`.gemini/commands/run-obsidian-finance.toml`:

```toml
description = "Build, lint, test and smoke-test the obsidian-finance plugin."
prompt = """
Read `.agents/skills/run-obsidian-finance/SKILL.md` and follow it. The default
path is to run `node .agents/skills/run-obsidian-finance/driver.mjs` and report
the result.

Additional instructions: {{args}}
"""
```

- [ ] **Шаг 4: Проверить, что TOML парсится**

```bash
node -e '
const fs = require("fs");
for (const f of fs.readdirSync(".gemini/commands")) {
  const t = fs.readFileSync(".gemini/commands/" + f, "utf8");
  const hasPrompt = /^prompt\s*=/m.test(t);
  const hasDesc = /^description\s*=/m.test(t);
  const quotes = (t.match(/"""/g) || []).length;
  console.log((hasPrompt && hasDesc && quotes % 2 === 0 ? "ok   " : "FAIL ") + f);
}'
```

Ожидается: пять строк `ok`. Проверяются обязательное `prompt`, наличие
`description` и парность тройных кавычек.

- [ ] **Шаг 5: Создать пять workflow-обёрток для Antigravity**

Формат: frontmatter с единственным ключом `description`, затем свободное тело.

`.agents/workflows/obsidian-finance-implement.md`:

```markdown
---
description: Implement a feature or fix in obsidian-finance, following its architecture and conventions.
---

Read `.agents/skills/obsidian-finance-implement/SKILL.md` and follow it exactly
for the user's task. Read `CODEBASE.md` and `CLAUDE.md` first, as that skill
instructs.

Antigravity has no todo tool. Maintain a task artifact instead: a markdown
checklist written with `write_to_file` (`IsArtifact: true`,
`ArtifactMetadata.ArtifactType: "task"`), listing every step, updated to `- [x]`
as you go.
```

`.agents/workflows/obsidian-finance-plan.md`:

```markdown
---
description: Create an implementation plan for an obsidian-finance feature, asking clarifying questions first.
---

Read `.agents/skills/obsidian-finance-plan/SKILL.md` and follow it exactly,
including its requirement to ask the user clarifying questions before writing
the plan.
```

`.agents/workflows/obsidian-finance-review.md`:

```markdown
---
description: Review obsidian-finance changes for architecture, conventions and test coverage.
---

Read `.agents/skills/obsidian-finance-review/SKILL.md` and follow it exactly for
the changes under review.
```

`.agents/workflows/obsidian-finance-sync-docs.md`:

```markdown
---
description: Update CODEBASE.md after implementation work on obsidian-finance.
---

Read `.agents/skills/obsidian-finance-sync-docs/SKILL.md` and follow it exactly.
```

`.agents/workflows/run-obsidian-finance.md`:

```markdown
---
description: Build, lint, test and smoke-test the obsidian-finance plugin.
---

Read `.agents/skills/run-obsidian-finance/SKILL.md` and follow it. The default
path is `node .agents/skills/run-obsidian-finance/driver.mjs`; report the result.
```

- [ ] **Шаг 6: Проверить frontmatter workflow-файлов**

```bash
for f in .agents/workflows/*.md; do
  head -1 "$f" | grep -q '^---$' && grep -q '^description:' "$f" \
    && echo "ok   $f" || echo "FAIL $f"
done
```

Ожидается: пять строк `ok`.

- [ ] **Шаг 7: Коммит**

```bash
git add -A .claude/skills .gemini .agents/workflows
git commit -m "feat(skills): add per-harness entry points for Claude, Gemini, Antigravity

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Симлинки Git хранит как symlink-объекты; убедиться, что не закоммичены копии:

```bash
git ls-files -s .claude/skills .gemini/skills | awk '{print $1, $4}'
```

Ожидается: режим `120000` (симлинк) у всех десяти записей.

**Проверка:** шаги 2, 4, 6 дают только `ok`; `git ls-files -s` показывает режим
`120000`.

---

## Задача 7: Документация и финальная сверка

**Файлы:**
- Изменить: `CLAUDE.md` — раздел «Development Workflow» (строки ~123–145) и
  раздел «Commands»
- Изменить: `.claudeignore` — проверить, не скрывает ли он новые пути

**Интерфейсы:**
- Потребляет: всё, созданное Задачами 1–6.
- Производит: согласованную документацию и подтверждение, что каждый путь,
  упомянутый в навыках, существует.

- [ ] **Шаг 1: Обновить раздел «Development Workflow» в `CLAUDE.md`**

Перед пунктом «1. **Planning phase**» вставить абзац:

```markdown
Skill texts live once at `.agents/skills/<name>/SKILL.md`. `.claude/skills/` and
`.gemini/skills/` are relative symlinks to that directory, and
`.gemini/commands/*.toml` plus `.agents/workflows/*.md` are thin wrappers that
make each skill invocable as a slash command. **Edit the canonical file** — the
copies are links, not duplicates.
```

- [ ] **Шаг 2: Добавить путь драйвера в раздел «Commands»**

После блока с `npx vitest run ...` добавить:

```markdown
node .agents/skills/run-obsidian-finance/driver.mjs   # build + lint + tests + domain smoke
```

- [ ] **Шаг 3: Проверить `.claudeignore`**

Файл исключает `.claude/`, из-за чего симлинки навыков могут быть невидимы для
поиска по файлам (на обнаружение самих навыков это не влияет — оно идёт по
файловой системе, а не через инструменты поиска). Канонический `.agents/` не
исключён, так что доступ к текстам остаётся. Ничего менять не требуется;
подтвердить командой:

```bash
grep -n "agents\|gemini" .claudeignore
```

Ожидается: пустой вывод — значит новые каталоги не скрыты.

Заодно подтвердить, что `.gitignore` не исключает новые каталоги (иначе Git не
возьмёт ни канон, ни симлинки, а Antigravity не проиндексирует workflow-файлы):

```bash
grep -nE "agents|gemini" .gitignore
git check-ignore -v .agents/skills .gemini/commands .agents/workflows
```

Ожидается: оба вывода пустые. `git check-ignore` печатает только
проигнорированные пути, поэтому пустой вывод означает, что каталоги
отслеживаются.

- [ ] **Шаг 4: Сверить каждый путь, упомянутый в навыках, с файловой системой**

Это ловит опечатки и ссылки на файлы, переименованные с момента написания
навыка.

```bash
cd /home/angus123/project/js/obsidian-finance
grep -rhoE '`(src|docs)/[A-Za-z0-9_./-]+`' .agents/skills/*/SKILL.md \
  | tr -d '`' | sort -u | while read -r p; do
      test -e "$p" || echo "MISSING $p"
    done
```

Ожидается: пустой вывод. Каждая `MISSING` строка — либо опечатка, либо
устаревшая ссылка; исправить и перезапустить.

Отдельно проверить пути с двоеточием и номером строки (например
`src/domain/viewState.ts:parseViewState()`):

```bash
grep -rhoE '`src/[A-Za-z0-9_./-]+\.ts:[A-Za-z0-9_]+' .agents/skills/*/SKILL.md \
  | tr -d '`' | sort -u | while read -r ref; do
      f="${ref%%:*}"; sym="${ref##*:}"
      test -e "$f" || { echo "MISSING FILE $f"; continue; }
      grep -q "$sym" "$f" || echo "MISSING SYMBOL $sym in $f"
    done
```

Ожидается: пустой вывод.

- [ ] **Шаг 5: Проверить, что frontmatter каждого навыка согласован с именем каталога**

```bash
for f in .agents/skills/*/SKILL.md; do
  dir=$(basename "$(dirname "$f")")
  name=$(grep -m1 '^name:' "$f" | sed 's/^name: *//')
  [ "$dir" = "$name" ] && echo "ok   $dir" || echo "FAIL $dir != $name"
  grep -q '^description:' "$f" || echo "FAIL $dir has no description"
done
```

Ожидается: пять строк `ok`.

- [ ] **Шаг 6: Финальная сверка — драйвер и нетронутость `src/`**

```bash
node .agents/skills/run-obsidian-finance/driver.mjs
git status --short src/
```

Ожидается: `All checks passed.`; затем ровно те же изменённые файлы в `src/`,
что были до начала работы (OverviewTab, overviewMetrics, viewState, dateMath,
i18n, types, четыре графика, два теста) — ни одного нового и ни одного
пропавшего.

- [ ] **Шаг 7: Коммит**

```bash
git add CLAUDE.md
git commit -m "docs: document canonical skill layout in CLAUDE.md

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Проверка:** шаги 4, 5 дают пустой вывод и пять `ok`; драйвер проходит; в
`src/` нет новых изменений.

---

## Ручная проверка агентов

Автоматически проверить регистрацию слеш-команд в чужих харнессах нельзя — в
этом окружении нет ни Gemini CLI, ни Antigravity. После выполнения плана
подтвердить вручную:

| Агент | Команда проверки | Ожидание |
|---|---|---|
| Claude Code | перезапуск, затем список навыков | пять навыков `obsidian-finance-*` и `run-obsidian-finance` присутствуют |
| Gemini CLI | `/commands reload`, затем `/commands list`; `/skills` | пять команд и пять навыков видны |
| Antigravity | открыть проект, начать вводить `/` в чате | пять workflow-команд в подсказках |

Если Antigravity не показывает команды — проверить, что `.agents/` не попал в
`.gitignore` и не скрыт от индексации IDE; это известная причина отсутствия
слеш-команд.

## Риски

- **Симлинки под Windows.** Git выкладывает их обычными текстовыми файлами без
  developer mode или `core.symlinks=true`. Проект разрабатывается на Linux;
  если появится участник на Windows, откат — заменить симлинки файлами-заглушками
  вида «Read `.agents/skills/<name>/SKILL.md` and follow it».
- **Разночтения `.agents/` vs `.agent/`.** Часть сторонних сборников навыков
  Antigravity использует `.agent/` (единственное число). План следует
  официальному кодлабу Google (`.agents/`). Если у конкретной версии
  Antigravity команды не появятся, продублировать `.agents/workflows/` в
  `.agent/workflows/` симлинком: `ln -sfn ../.agents/workflows .agent/workflows`.
- **Устаревание навыка вслед за кодом.** Таблица эталонов ссылается на реальные
  файлы, поэтому переименование файла делает навык неверным. Шаг 4 Задачи 7 —
  готовая команда для периодической перепроверки; стоит запускать её при
  крупных рефакторингах.

