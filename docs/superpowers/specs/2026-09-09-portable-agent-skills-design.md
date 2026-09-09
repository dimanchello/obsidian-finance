# Portable agent skills for obsidian-finance

**Date:** 2026-09-09
**Status:** approved

## Problem

The project has four `obsidian-finance-*` skills plus `run-obsidian-finance`, all
authored for Claude Code. Two problems:

1. **The four `obsidian-finance-*` skills never load.** They live as flat files
   (`.claude/skills/obsidian-finance-plan.md`). Claude Code discovers skills as
   `.claude/skills/<name>/SKILL.md`. Only `run-obsidian-finance/` — a real
   directory — appears in the skill list. `CLAUDE.md` tells the agent to use
   `/obsidian-finance-plan`, which cannot resolve.
2. **They are Claude-only.** Other harnesses (Gemini CLI, Antigravity) read
   different directories and cannot see them at all.

`obsidian-finance-implement` has also drifted from the codebase: it documents a
localStorage fallback that no longer exists, omits the constants rule entirely,
and teaches invented code skeletons (`NewEntity`, `NewTab`, `NewModal`) that
match no file in `src/`.

## Goals

- One canonical copy of each skill's text, readable by Claude Code, Gemini CLI,
  and Antigravity.
- `obsidian-finance-implement` accurately captures every convention actually
  enforced in the codebase, verified against source rather than against docs.
- Skills stay invocable as slash commands on each harness.
- No change to `src/` — uncommitted work in progress there is untouched.

## Non-goals

- Porting the `.claude/agents/` subagents (`code-reviewer`, `frontend`). Gemini
  CLI and Antigravity have no equivalent dispatch mechanism; out of scope.
- Codex CLI support. `.codex/agents/` exists but is empty; not requested.
- Any generator script or build step. Symlinks make one edit visible everywhere.

## Layout

Canonical text lives once, under `.agents/skills/`:

```
.agents/skills/
├── obsidian-finance-plan/SKILL.md
├── obsidian-finance-implement/SKILL.md
├── obsidian-finance-review/SKILL.md
├── obsidian-finance-sync-docs/SKILL.md
└── run-obsidian-finance/
    ├── SKILL.md
    └── driver.mjs
```

`.agents/skills/` was chosen because both target harnesses read it natively:
Google's official Antigravity codelab scaffolds `.agents/skills` and
`.agents/workflows`, and Gemini CLI's skills documentation names
`.agents/skills/` an alias of `.gemini/skills/`.

Per-harness entry points, all pointing at the canonical text:

| Path | Kind | Purpose |
|---|---|---|
| `.claude/skills/<name>` | symlink → `../../.agents/skills/<name>` | Claude Code discovery |
| `.gemini/skills/<name>` | symlink → `../../.agents/skills/<name>` | Gemini CLI discovery (explicit, not relying on the alias) |
| `.gemini/commands/<name>.toml` | thin file | makes the skill invocable as `/<name>` |
| `.agents/workflows/<name>.md` | thin file | makes the skill invocable as a slash command in Antigravity |

Symlinks are relative, so the tree stays valid after clone or move. `.gitignore`
does not exclude `.agents/`, so no change is needed there.

### Thin entry-point format

`.gemini/commands/obsidian-finance-implement.toml`:

```toml
description = "Implement a feature or fix in the obsidian-finance plugin, following its architecture and conventions."
prompt = """
Read `.agents/skills/obsidian-finance-implement/SKILL.md` and follow it exactly
for the task below. Also read `CODEBASE.md` and `CLAUDE.md` as that skill
instructs.

Task: {{args}}
"""
```

`.agents/workflows/obsidian-finance-implement.md`:

```markdown
---
description: Implement a feature or fix in the obsidian-finance plugin, following its architecture and conventions.
---

Read `.agents/skills/obsidian-finance-implement/SKILL.md` and follow it exactly
for the user's task. Also read `CODEBASE.md` and `CLAUDE.md` as that skill
instructs.
```

Gemini's `{{args}}` carries the user's task text; when absent the CLI appends the
typed command to the prompt, so both invocation styles work. Antigravity workflow
files take a single `description` frontmatter key and a free-form body.

## Skill content changes

`SKILL.md` frontmatter is `name` + `description` for all three harnesses — the
same two keys Claude Code already uses — so the canonical files need no
per-harness frontmatter variation.

### obsidian-finance-implement — rewrite

Corrections verified against source, not against docs:

| Current claim | Verified reality |
|---|---|
| "ViewState persisted in both `localStorage` and `state.json`" | `state.json` is the single source of truth; no localStorage fallback |
| No mention of `src/constants.ts` | Hard rule: no raw string literals for domain state, in `src/` **and** `src/__tests__/` |
| "No magic numbers" as a one-line aside | Needs the real rule plus its exemptions (`0`, `1`, `-1`, `2`, `slice(0, 10)`, `i + 1`) |
| `NewEntity` / `NewTab` / `NewModal` skeletons | Replaced by pointers to real exemplars |
| "One assertion per test" | Not how the suite is written; drop |
| "246 tests across 15 files" | 28 test files, 512 `it()` blocks; cite `CLAUDE.md` instead of duplicating counts |

New structure:

1. **Pre-flight** — read `CODEBASE.md`, locate the subsystem, read only what is
   relevant. Never scan all of `src/`.
2. **Hard rules** — the constraints that fail review if violated: domain
   constants from `src/constants.ts`; named constants for semantic numbers;
   i18n triple-update (`Translations` interface + `ru` + `en`); dates as
   `YYYY-MM-DD` strings normalized via `normalizeDateStr`; `AccountCommands` for
   any entity with `linkedId` records; a `??=` default in `parseViewState()` for
   every new `ViewState` field; mobile via `DataTable`; idempotent
   auto-transactions.
3. **Exemplar table** — task → file to imitate, replacing the invented
   skeletons. Verified to exist:

   | Task | Imitate |
   |---|---|
   | Table with sort/filter/pagination/mobile cards | `src/tabs/DepositsTab.ts` (also Credits, Currency, Records, Debts) |
   | Create/edit modal | `src/CreditModal.ts` (9 subclasses of `EntityModal<T>`) |
   | Non-CRUD helper modal | `src/ConfirmModal.ts` (7 subclasses of `FinanceBaseModal`) |
   | Entity + linked records atomically | `src/domain/AccountCommands.ts` (`addCredit`, `addDebtMovement`) |
   | Pure calculation module | `src/domain/creditCalculations.ts` |
   | Scheduled record materialization | `src/domain/autoTransactions.ts` |
   | Domain unit test | `src/__tests__/dateMath.test.ts` |

4. **Verification** — `npm run lint && npm run build && npm test`, all three.
5. **Completion checklist** — including `CODEBASE.md` and both READMEs.

### obsidian-finance-plan — targeted edits

Keep the question-first protocol; it is the skill's value. Add constants, i18n
triple-update, and mobile to the plan quality checklist so plans do not omit
them.

### obsidian-finance-review — targeted edits

Add two review checks: raw domain string literals (production and tests) and
i18n triple-update completeness.

### obsidian-finance-sync-docs — targeted edits

No architectural drift; update paths only.

### run-obsidian-finance — path and count fixes

Move `driver.mjs` to `.agents/skills/run-obsidian-finance/driver.mjs` and update
every path reference in the skill body and in `CLAUDE.md`. Fix the stale test
count.

## Documentation updates

`CLAUDE.md`'s Development Workflow section names the skills; update it with the
canonical path, the per-harness entry points, and a one-line note that editing a
skill means editing the canonical file. No README change — this is not
user-visible.

## Verification

Skills are not code, so the loop is:

1. `node .agents/skills/run-obsidian-finance/driver.mjs` passes from the new path.
2. Every symlink resolves (`test -e` through the link, for all five skills in
   both `.claude/skills/` and `.gemini/skills/`).
3. Every `.gemini/commands/*.toml` parses as TOML.
4. Every file path cited inside every skill exists — checked by extracting
   backticked `src/...` paths and testing each.
5. `git status` shows no modification to `src/`, confirming the uncommitted
   work in progress was untouched.

## Risks

- **Symlinks on Windows.** Git checks out symlinks as plain text files without
  developer mode or `core.symlinks=true`. This repo is developed on Linux; if a
  Windows contributor appears, the fallback is converting the symlinks to stub
  files that read the canonical path.
- **Harness discovery may differ from documentation.** The `.agents/skills`
  alias and Antigravity's workflow format come from vendor docs and an official
  codelab, not from local observation — no Gemini CLI or Antigravity install is
  available here to confirm. Verification steps 2–4 check internal consistency;
  actual slash-command registration must be confirmed by running each harness.
