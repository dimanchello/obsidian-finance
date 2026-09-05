---
name: obsidian-finance-implement
description: Implement features for obsidian-finance plugin following architecture and code style
---

# Obsidian Finance: Feature Implementation

You are implementing a feature or fix for the Obsidian Finance plugin following established architecture patterns and code style.

## Pre-Implementation Checklist

1. **Read project documentation:**
   - `CODEBASE.md` — architecture map, module dependencies, symbol index
   - `CLAUDE.md` — conventions, storage layout, common patterns
   - Plan file (if provided by user) — implementation roadmap

2. **Identify affected subsystems** using `CODEBASE.md`:
   - Which modules need changes?
   - Which symbols/classes/functions are involved?
   - What are the dependencies?

3. **Read only relevant source files** — don't scan entire `src/` directory.

## Architecture Patterns to Follow

### Storage Layer
- Use `AccountCommands` (`src/domain/AccountCommands.ts`) for CRUD operations involving linked records
- Never call `storage.addX()` directly from tabs if entity has `linkedId` records
- All storage writes are debounced 500ms — data not on disk immediately
- Account folders: `.obsidian/plugins/obsidian-finance/accounts/<accountId>/`
- 7 files per account: `meta.json`, `records.json`, `debts.json`, `credits.json`, `deposits.json`, `exchanges.json`, `state.json`

### Domain Layer
- Business logic goes in `src/domain/` — pure functions, no DOM, no Obsidian API
- `autoTransactions.ts` — schedule generation and record materialization
- `linkedRecords.ts` — linked record creation/deletion
- `*Calculations.ts` — mathematical operations
- `validate.ts` — parsing and validation

### View Layer
- `AccountView` — main controller, owns lifecycle, tab switching, auto-transactions
- `ViewContext` — shared context bag (data, state, locale, translations, formatting)
- Tabs — stateless, recreated on each render, receive only `ViewContext`
- Tabs expose `onUpdate?: () => void` callback → wired to `AccountView.refreshAndRender()`

### UI Components
- `DataTable<T>` — generic table with sort/filter/pagination/mobile cards
- `EntityModal<T>` — base for create/edit modals with validation
- Forms use `src/ui/formHelpers.ts` and `src/ui/tabHelpers.ts`
- Charts use `src/ui/chartHelpers.ts`

## Code Style Rules

### TypeScript
- **No magic numbers:** Extract to `UPPER_SNAKE_CASE` constants in `src/types.ts` or `src/constants.ts`
- **Explicit types:** Avoid `any`, use proper type guards
- **Nullish coalescing:** Use `??` not `||`
- **Optional chaining:** Use `?.` when appropriate
- **Interfaces over types:** `interface` for object shapes

### i18n
- **All user-facing strings** must be in `src/i18n.ts`
- Add to `Translations` interface, then to `ru` and `en` objects
- Access via `ctx.tr.stringKey` in tabs, `t(locale).stringKey` in modals

### Mobile
- **Mandatory responsive design**
- Detection: `Platform.isMobile || window.innerWidth <= MOBILE_BREAKPOINT`
- Tables: use `DataTable` component which handles mobile cards automatically
- No horizontal scroll on mobile

### Formatting
- Dates: `YYYY-MM-DD` strings, never `Date` objects in storage
- Times: `HH:MM` or `''`
- Amounts: `number` type, format via `ctx.fmt()` or `fmt(amount, currency)`
- Normalize dates/times with `normalizeDateStr()`/`normalizeTimeStr()` from `src/utils.ts`

### State Management
- ViewState persisted in both `localStorage` and `state.json`
- New state fields: add to `ViewState` interface, add default in `src/domain/viewState.ts:parseViewState()`
- Always reset `page: 0` when filters change

## Implementation Workflow

### 1. Add/Modify Types
```typescript
// src/types.ts
export interface NewEntity {
  id: string;
  createdAt: number;
  // ... fields
}

export const NEW_CONSTANT = 42;
```

### 2. Add Domain Logic
```typescript
// src/domain/newFeature.ts
export function calculateX(input: number): number {
  return input * NEW_CONSTANT;
}
```

### 3. Add Storage Methods (if needed)
```typescript
// src/storage/index.ts
async addNewEntity(accountId: string, entity: NewEntity): Promise<void> {
  (await this.loadNewEntities(accountId)).push(entity);
  this.newEntities.markDirty(accountId);
}
```

### 4. Add AccountCommands Methods (if has linkedId)
```typescript
// src/domain/AccountCommands.ts
async addNewEntity(entity: NewEntity, category: string): Promise<void> {
  await this.storage.addNewEntity(this.accountId, entity);
  const record = createNewEntityRecord(entity, category);
  await this.storage.addRecord(this.accountId, record);
}
```

### 5. Create Tab or Extend Existing
```typescript
// src/tabs/NewTab.ts
export class NewTab {
  constructor(private ctx: ViewContext, private el: HTMLElement) {}
  
  render(): void {
    // Use DataTable for lists
    const table = new DataTable<NewEntity>({
      ctx: this.ctx,
      items: () => this.getFiltered(),
      // ... config
    });
    table.render(this.el);
  }
}
```

### 6. Create Modal (if needed)
```typescript
// src/NewModal.ts
export class NewModal extends EntityModal<NewEntity> {
  protected getTitle(): string { return this.isEdit ? 'Edit' : 'Add'; }
  protected buildForm(form: HTMLElement): void { /* fields */ }
  protected validate(): string | null { /* validation */ }
  protected collectData(): NewEntity { /* collect form */ }
}
```

### 7. Wire in AccountView
```typescript
// src/AccountView.ts
// Add to renderBodyContent():
else if (this.mode === 'newTab') {
  this.renderNewTab(body);
}

private renderNewTab(body: HTMLElement): void {
  const tab = new NewTab(this.ctx, body);
  tab.onUpdate = () => this.refreshAndRender();
  tab.renderHeaderActions?.(this.header.actionsContainer);
  tab.render();
}
```

### 8. Add to AccountHeader Dropdown
```typescript
// src/AccountHeader.ts in renderModeDropdown():
mkItem('🆕', this.tr.newTab, 'newTab');
```

## Testing

After implementation:

```bash
npm run lint   # Must pass with 0 errors
npm run build  # Must compile cleanly
npm test       # All tests must pass
```

If any step fails, fix before considering the task complete.

### Writing Tests
- Test business logic only (domain functions, storage CRUD, utils)
- Do NOT test DOM/rendering/modals
- Use `describe` + `it` (not `test`)
- One assertion per test
- Mock Obsidian API via `src/__tests__/mock-obsidian.ts`

Example:
```typescript
// src/__tests__/newFeature.test.ts
import { describe, it, expect } from 'vitest';
import { calculateX } from '../domain/newFeature';

describe('calculateX', () => {
  it('multiplies input by constant', () => {
    expect(calculateX(2)).toBe(84);
  });
});
```

## Common Patterns

### Linked Records Pattern
```typescript
// Entity with linked records uses AccountCommands
const commands = new AccountCommands(storage, accountId);
await commands.addEntity(entity, category, translations);
// NOT: await storage.addEntity() + await storage.addRecord()
```

### Auto-Transactions Pattern
```typescript
// Entities that generate scheduled records (credits/deposits)
// Implement in src/domain/autoTransactions.ts:
function processEntity(entity: Entity, mirror: RecordMirror, deps: AutoTxDeps) {
  // Generate schedule if missing
  // Settle due items
  // Mirror records via mirror.ensure()
}
```

### Filter Pattern
```typescript
// In tab:
private getFiltered(): Entity[] {
  let items = this.ctx.data?.entities ?? [];
  const f = this.ctx.state.entityFilter;
  if (f.search) items = items.filter(/* search logic */);
  if (f.status !== 'all') items = items.filter(/* status logic */);
  return items;
}
```

### Pagination Pattern
```typescript
// DataTable handles pagination automatically
// Just provide items via getFiltered()
```

## Data Migration

When changing stored data format:

1. Update interface in `src/types.ts`
2. Update parser in `src/domain/validate.ts`
3. Add backfill in parser: `entity.newField ??= defaultValue`
4. If incompatible change, increment `DATA_VERSION` in `src/storage/index.ts`

## Updating CODEBASE.md

After completing implementation:

1. **If new module added:** Add to "Core Modules" and "Symbol Index"
2. **If execution flow changed:** Update "Execution Flows"
3. **If new pattern introduced:** Document in "Architecture" section
4. **Keep concise:** Only add information that helps future navigation

Example update:
```markdown
### NewFeature

**Path:** `src/domain/newFeature.ts`

**Purpose:** Calculates X from Y using Z algorithm

**Important symbols:**
- `calculateX()`
- `validateInput()`

**Depends on:** types, utils

**Used by:** NewTab, AccountCommands
```

## Quality Checklist

Before marking complete:

- [ ] Follows existing code style (camelCase, interfaces, no magic numbers)
- [ ] All user-facing strings in i18n.ts (both ru and en)
- [ ] Mobile responsive (tested at <480px width)
- [ ] No direct storage calls if entity has linkedId (use AccountCommands)
- [ ] State changes persist correctly (localStorage + state.json)
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Tests added for new business logic
- [ ] CODEBASE.md updated if architecture changed
- [ ] README.md and README.en.md updated if user-visible feature

## Remember

- Read `CODEBASE.md` BEFORE starting implementation
- Only read source files relevant to your task
- Follow established patterns — don't invent new architectures
- Tabs are stateless — state lives in ViewContext
- Storage writes are debounced — not immediate
- Auto-transactions run on every render — must be idempotent
- Mobile support is mandatory, not optional
- Verification (lint + build + test) is mandatory
