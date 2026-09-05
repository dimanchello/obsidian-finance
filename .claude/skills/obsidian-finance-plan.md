---
name: obsidian-finance-plan
description: Create implementation plan for obsidian-finance plugin features
---

# Obsidian Finance: Implementation Planning

You are creating a detailed implementation plan for a feature or fix in the Obsidian Finance plugin. This plan will be executed by another agent (or yourself in a future session) using the `obsidian-finance-implement` skill.

## Critical: Ask Questions First

**BEFORE creating a plan, you MUST clarify ambiguities with the user.**

Do NOT make assumptions about:
- User requirements
- Design choices
- UI/UX decisions
- Data structures
- Business logic

If ANYTHING is unclear or could be interpreted multiple ways, STOP and ask the user.

### Examples of What to Clarify

**Unclear requirement:**
User: "Add budgets"
❌ DON'T assume: monthly budgets, category-based, limit tracking
✅ ASK: 
- What period? (monthly/yearly/custom)
- Per category or total?
- What happens when exceeded?
- How to display? (new tab/part of records?)

**Ambiguous design:**
User: "Add tags to debts"
❌ DON'T assume: single tag, predefined list, required field
✅ ASK:
- Multiple tags or single?
- Predefined list or free text?
- Required or optional?
- Filter/search by tags?

**Missing business logic:**
User: "Add recurring transactions"
❌ DON'T assume: frequency, duration, auto-execution
✅ ASK:
- How to define recurrence? (daily/weekly/monthly/custom)
- End date or forever?
- Auto-create or require confirmation?
- Edit/delete affects past or future only?

**Unclear scope:**
User: "Improve deposits"
❌ DON'T assume what to improve
✅ ASK:
- What specifically needs improvement?
- Current pain point?
- Expected behavior?

## Question-Asking Protocol

1. **Identify ambiguities** — list all unclear points
2. **Group related questions** — don't overwhelm with 20 separate questions
3. **Propose options** — suggest 2-3 alternatives for each decision point
4. **Mark critical vs optional** — distinguish must-have from nice-to-have

### Question Format

```markdown
## Clarification Questions

Before creating the implementation plan, I need to clarify a few points:

### Critical Decisions

1. **Budget Period**
   - Option A: Monthly budgets (reset every month)
   - Option B: Yearly budgets (annual tracking)
   - Option C: Custom period (user-defined)
   
   Which approach do you prefer?

2. **Exceed Behavior**
   - Option A: Visual warning only (no restrictions)
   - Option B: Block adding expense when exceeded
   - Option C: Show warning + require confirmation
   
   What should happen when budget is exceeded?

### Optional Details

3. **Budget Categories**
   - Should all categories have budgets, or only selected ones?
   - Default budget amount when creating new category?

4. **UI Placement**
   - Option A: New "Budgets" tab
   - Option B: Integrate into existing Records tab
   - Option C: Show in Overview dashboard only
   
   Where should budget information live?

Please answer these questions, then I'll create a detailed implementation plan.
```

## Planning Process

### 1. Understand the Request

Clarify with the user:
- What is the user-visible behavior?
- What problem does this solve?
- Are there any constraints or preferences?

### 2. Read Project Documentation

**Required reading:**
- `CODEBASE.md` — architecture, modules, symbols, execution flows
- `CLAUDE.md` — conventions, patterns, storage layout
- `README.md` or `README.en.md` — current features

**Identify:**
- Which subsystems are affected?
- Which modules will need changes?
- Are there similar features to use as reference?

### 3. Analyze Architecture Impact

Using `CODEBASE.md`, determine:

**Data Model Changes:**
- New interfaces/types needed?
- Changes to existing types?
- New constants needed?

**Storage Changes:**
- New file type per account?
- New FileStore needed?
- Changes to existing storage methods?

**Domain Logic:**
- Pure business logic in `src/domain/`?
- Calculations, validations, transformations?
- Linked records involved?

**View Layer:**
- New tab needed?
- Extend existing tab?
- Changes to AccountView?

**UI Components:**
- New modal needed?
- Use existing components (DataTable, EntityModal)?
- New reusable component?

**Auto-Transactions:**
- Does entity generate scheduled records?
- Needs integration with `autoTransactions.ts`?

### 4. Check for Similar Patterns

Look at existing implementations:
- **Debts** (`src/tabs/DebtsTab.ts`, `src/domain/AccountCommands.ts`) — entity with movements, linked records
- **Credits** (`src/tabs/CreditsTab.ts`, `src/domain/autoTransactions.ts`) — scheduled payments, auto-transactions
- **Deposits** (`src/tabs/DepositsTab.ts`) — accruals, top-ups, withdrawals
- **Currency** (`src/tabs/CurrencyTab.ts`) — exchanges with linked records
- **Records** (`src/tabs/RecordsTab.ts`) — table, filters, analytics

### 5. Identify Edge Cases

Consider:
- Mobile responsive design
- Empty states
- Data migration (if changing existing data)
- Linked records sync
- Auto-transaction idempotency
- State persistence
- i18n for both languages

### 6. Create Implementation Steps

Break down into atomic, sequential steps. Each step should:
- Be independently verifiable
- Build on previous steps
- Have clear success criteria

## Plan Document Structure

Create a plan file with this structure:

```markdown
# Implementation Plan: [Feature Name]

## Overview

**Goal:** [One sentence: what user-visible behavior will change]

**Affected Subsystems:**
- Storage: [yes/no - changes to storage layer]
- Domain: [which modules in src/domain/]
- View: [which tabs/views]
- UI: [which components]

**Estimated Complexity:** [Low/Medium/High]
- Low: < 5 files, no new patterns
- Medium: 5-15 files, follows existing patterns
- High: > 15 files, new patterns or significant refactoring

## Architecture Analysis

### Data Model

**New Types:**
```typescript
interface NewEntity {
  id: string;
  // ... fields
}
```

**Type Changes:**
- `ExistingType`: add field `newField?: string`

**Constants:**
- `NEW_CONSTANT = 42` in `src/types.ts`

### Storage

**New Files per Account:**
- `newEntities.json` — NewEntity[]

**FileStore:**
- Add `newEntities: FileStore<NewEntity[]>` to FinanceStorage

**Methods:**
- `addNewEntity(accountId, entity)`
- `updateNewEntity(accountId, entity)`
- `deleteNewEntity(accountId, id)`

### Domain Logic

**New Modules:**
- `src/domain/newFeature.ts` — [purpose]

**Functions:**
- `calculateX(input): output` — [what it does]
- `validateY(data): boolean` — [what it validates]

**AccountCommands:**
- Add methods if NewEntity has linked records

**Auto-Transactions:**
- Integrate if NewEntity generates scheduled records

### View Layer

**New Tab:** `src/tabs/NewTab.ts`
- Renders list using DataTable
- Filters: [list filters]
- Sort: [sort fields]
- Actions: add, edit, delete

**Changes to AccountView:**
- Add `renderNewTab()` method
- Add case to `renderBodyContent()`
- Wire `onUpdate` callback

**Changes to AccountHeader:**
- Add menu item in dropdown

### UI Components

**New Modal:** `src/NewModal.ts` extends EntityModal<NewEntity>
- Fields: [list form fields]
- Validation: [validation rules]

**Reused Components:**
- DataTable for entity list
- AmountInput for money fields
- DateField for date inputs

### i18n

**New Translation Keys:**
```typescript
// Translations interface
newTab: string;
newEntityAdd: string;
newEntityEdit: string;
// ... etc
```

**Russian:**
- `newTab: 'Новая Вкладка'`

**English:**
- `newTab: 'New Tab'`

## Implementation Steps

### Step 1: Data Model
**Files:** `src/types.ts`, `src/constants.ts`

1. Add `NewEntity` interface
2. Add filter/sort state interfaces if needed
3. Add constants (extract magic numbers)
4. Update `AccountData` interface to include new entity array

**Verification:** TypeScript compiles

### Step 2: Storage Layer
**Files:** `src/storage/index.ts`, `src/storage/AccountFiles.ts`

1. Add `'newEntities'` to `AccountFileKind` type
2. Add `newEntities: FileStore<NewEntity[]>` to FinanceStorage
3. Add CRUD methods
4. Update `load()` to include new entities

**Verification:** 
- `npm run build` passes
- Storage tests pass

### Step 3: Domain Logic
**Files:** `src/domain/newFeature.ts`, `src/domain/validate.ts`

1. Implement calculation functions
2. Add parser/validator for NewEntity
3. Add tests

**Verification:**
- `npm test` passes for new tests
- Business logic covered

### Step 4: AccountCommands (if needed)
**Files:** `src/domain/AccountCommands.ts`, `src/domain/linkedRecords.ts`

1. Add methods for CRUD with linked records
2. Implement linked record creation
3. Add tests

**Verification:** Integration tests pass

### Step 5: Tab Implementation
**Files:** `src/tabs/NewTab.ts`

1. Create tab class
2. Implement render()
3. Configure DataTable
4. Implement filters and sorting
5. Wire CRUD actions
6. Test mobile layout

**Verification:**
- Tab renders correctly
- Filters work
- Responsive on mobile

### Step 6: Modal Implementation
**Files:** `src/NewModal.ts`

1. Extend EntityModal
2. Implement buildForm()
3. Implement validate()
4. Implement collectData()
5. Handle edit mode

**Verification:**
- Modal opens
- Validation works
- Save works

### Step 7: Integration with AccountView
**Files:** `src/AccountView.ts`, `src/AccountHeader.ts`

1. Add mode type to AccountMode
2. Add renderNewTab() method
3. Add case to renderBodyContent()
4. Add menu item to dropdown
5. Wire onUpdate callback

**Verification:**
- Tab accessible from menu
- Navigation works
- Data refresh works

### Step 8: i18n
**Files:** `src/i18n.ts`

1. Add keys to Translations interface
2. Add Russian translations
3. Add English translations
4. Replace any hardcoded strings

**Verification:** All strings show correctly in both languages

### Step 9: Auto-Transactions (if needed)
**Files:** `src/domain/autoTransactions.ts`

1. Implement processNewEntity()
2. Integrate with applyAutoTransactions()
3. Add tests for schedule generation

**Verification:** Scheduled records materialize correctly

### Step 10: Testing
**Files:** `src/__tests__/`

1. Add unit tests for domain logic
2. Add integration tests if complex
3. Run full test suite

**Verification:**
- All tests pass
- Coverage adequate

### Step 11: Documentation
**Files:** `CODEBASE.md`, `README.md`, `README.en.md`

1. Update CODEBASE.md:
   - Add new module to Core Modules
   - Add symbols to Symbol Index
   - Update execution flows if changed
2. Update README.md with new feature
3. Update README.en.md with new feature

**Verification:** Documentation is clear and accurate

### Step 12: Final Verification

```bash
npm run lint   # Must pass
npm run build  # Must pass
npm test       # Must pass
```

Manual testing:
- [ ] Add entity works
- [ ] Edit entity works
- [ ] Delete entity works
- [ ] Filters work
- [ ] Sort works
- [ ] Pagination works
- [ ] Mobile layout works
- [ ] Linked records sync (if applicable)
- [ ] Auto-transactions work (if applicable)
- [ ] State persists across sessions
- [ ] Both languages work

## Edge Cases

List potential issues and how to handle them:

1. **Empty state:** [how to handle when no entities exist]
2. **Data migration:** [if changing existing data structure]
3. **Linked records:** [how to ensure sync]
4. **Auto-transactions:** [ensure idempotency]
5. **Mobile:** [specific mobile considerations]
6. **State persistence:** [what state needs to persist]

## Migration Strategy (if needed)

If changing existing data:

```typescript
// In parser (src/domain/validate.ts or storage)
function parseNewEntity(raw: unknown): NewEntity {
  // ... parsing
  // Backfill new fields
  entity.newField ??= defaultValue;
  return entity;
}
```

If incompatible change:
- Increment DATA_VERSION
- Document migration in plan

## Open Questions

List any questions for the user or uncertainties:

1. [Question about requirement]
2. [Question about design choice]
3. [Question about constraint]

## References

Similar features to reference during implementation:

- **Module:** `src/tabs/SimilarTab.ts` — [why similar]
- **Pattern:** Credits payment schedule — [pattern to follow]
- **Component:** DataTable usage in RecordsTab — [example]

## Notes

Any additional context or warnings:

- [Important note about implementation]
- [Gotcha to watch out for]
- [Performance consideration]
```

## Plan Quality Checklist

Before presenting plan to user:

- [ ] All affected files identified
- [ ] Steps are sequential and atomic
- [ ] Each step has clear verification
- [ ] Edge cases considered
- [ ] Mobile responsive addressed
- [ ] i18n addressed for both languages
- [ ] Similar patterns referenced
- [ ] Open questions listed
- [ ] Testing strategy included
- [ ] Documentation updates included
- [ ] Follows existing architecture patterns
- [ ] No new patterns without justification

## Presenting the Plan

After creating the plan:

1. **Save to file:** `implementation-plan-[feature-name].md` in project root
2. **Summarize for user:**
   - Estimated complexity
   - Number of files affected
   - Key architectural decisions
   - Any open questions
3. **Get approval** before implementation begins
4. **Iterate** based on feedback

## Remember

- Use `CODEBASE.md` to understand current architecture
- Follow existing patterns — don't reinvent
- Break into small, verifiable steps
- Consider mobile, i18n, testing, documentation
- Ask questions if requirements unclear
- The plan should be executable by someone who hasn't seen the codebase before
