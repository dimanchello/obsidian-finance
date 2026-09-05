---
name: obsidian-finance-sync-docs
description: Sync code changes to CODEBASE.md after implementation
---

# Obsidian Finance: Documentation Sync

After completing implementation work on the Obsidian Finance plugin, update `CODEBASE.md` to reflect architectural changes.

## When to Use This Skill

Run this skill after:
- Adding new modules or files
- Changing execution flows
- Introducing new patterns
- Refactoring significant architecture
- Adding new subsystems

Do NOT run for:
- Minor bug fixes (typos, small logic fixes)
- Adding individual functions to existing modules
- CSS-only changes
- Documentation-only changes

## Update Process

### 1. Identify Changes

Review what was implemented:
- **New modules?** → Add to "Core Modules" section
- **New execution flows?** → Update "Execution Flows" section
- **Changed data flow?** → Update "Data Flow" section
- **New patterns?** → Document in "Architecture" or "Non-obvious Details"
- **New important symbols?** → Add to "Symbol Index"

### 2. Read Current CODEBASE.md

Understand existing structure and find the right sections to update.

### 3. Update Relevant Sections

Follow the existing format and keep updates concise.

#### Adding a New Module

In **"5. Core Modules"** section:

```markdown
### ModuleName

**Path:** `src/path/to/module.ts`

**Purpose:** Brief one-line description of what it does

**Important symbols:**
- `ClassName`
- `functionName()`
- `CONSTANT_NAME`

**Depends on:**
- module1, module2

**Used by:**
- Tab, Component
```

#### Updating an Existing Module

Find the module in "Core Modules" and update:
- Purpose (if changed)
- Important symbols (add new ones)
- Dependencies (if changed)
- Used by (if new usages)

#### Adding to Symbol Index

In **"15. Symbol Index"** section, maintain alphabetical order:

```markdown
NewSymbol → src/path/file.ts:lineNumber
```

To find line number:
```bash
grep -n "export.*NewSymbol" src/path/file.ts
```

#### Updating Execution Flows

In **"7. Execution Flows"** section, update affected flows:

```markdown
### Flow Name

\`\`\`
Step 1
 → Step 2
 → Step 3
    ├── Branch A
    └── Branch B
\`\`\`
```

#### Documenting New Patterns

If introducing a new pattern, add to:
- **"4. Architecture"** — if it's a structural pattern
- **"14. Non-obvious Details"** — if it's a subtle implementation detail

#### Updating Data Flow

In **"8. Data Flow"** section, if data paths changed:

```markdown
### Data Type

Source → Transform → Storage → View
```

### 4. Keep It Concise

`CODEBASE.md` is a navigation index, not API documentation:
- **One-line descriptions** for purpose
- **List symbols**, don't describe each in detail
- **Show structure**, don't explain implementation
- **Guide navigation**, don't duplicate source code

### 5. Verify Accuracy

After updating:
- **Check file paths** are correct
- **Verify line numbers** are accurate (or close enough)
- **Test navigation** — can you find code using only CODEBASE.md?
- **Check consistency** — format matches existing entries

## Common Updates

### New Tab Added

Update these sections:

1. **"1. Project Overview"** — add to subsystems list if significant
2. **"3. Directory Structure"** → `src/tabs/` — mention new file
3. **"4. Architecture"** — add to tab list
4. **"5. Core Modules"** — add full entry
5. **"7. Execution Flows"** → update "Code block render" flow
6. **"12. Common Change Locations"** — add "Изменить X" entry
7. **"15. Symbol Index"** — add `NewTab → src/tabs/NewTab.ts:lineNumber`

### New Domain Module Added

Update:

1. **"3. Directory Structure"** → `src/domain/` — list new file
2. **"5. Core Modules"** — add full entry
3. **"9. Dependencies"** — update dependency graph
4. **"15. Symbol Index"** — add exported symbols

### Refactored Storage

Update:

1. **"5. Core Modules"** → FinanceStorage — update methods
2. **"7. Execution Flows"** — update storage flows
3. **"8. Data Flow"** — update storage section
4. **"14. Non-obvious Details"** — document any gotchas

### New UI Component

Update:

1. **"3. Directory Structure"** → `src/ui/` — list new file
2. **"5. Core Modules"** — add entry (if reusable component)
3. **"15. Symbol Index"** — add symbol

## Examples

### Example 1: Adding BudgetsTab

```markdown
### BudgetsTab

**Path:** `src/tabs/BudgetsTab.ts`

**Purpose:** Budget tracking and analysis with monthly/yearly views

**Important symbols:**
- `BudgetsTab` class
- `renderBudgetList()`
- `renderAnalytics()`

**Depends on:**
- ViewContext, DataTable, BudgetModal, AccountCommands

**Used by:**
- AccountView
```

And in Symbol Index:
```markdown
BudgetsTab → src/tabs/BudgetsTab.ts:18
```

### Example 2: New autoTransaction Pattern

In "Non-obvious Details":

```markdown
### Budget accruals respect fiscal year

When budget accruals are generated, they use the account's `fiscalYearStart` setting (default: January 1) rather than calendar year. This means a budget created in November 2025 with `fiscalYearStart: 'April'` will generate accruals starting April 2026, not January 2026.
```

### Example 3: Updated Execution Flow

```markdown
### Budget recalculation

\`\`\`
User updates budget amount
 → BudgetsTab.onSave()
 → accountCommands.updateBudget()
    ├── storage.updateBudget()
    ├── recalculateAllocations() — recompute category allocations
    └── updateLinkedRecords() — adjust mirrored records
 → AccountView.refreshAndRender()
\`\`\`
```

## Edge Cases

### Minor Changes

For small additions to existing modules:
- Update "Important symbols" list
- Update "Used by" if new usage
- Don't add new section unless it's a major change

### Reorganization

If files moved:
- Update ALL references to old paths
- Update Symbol Index line numbers
- Update "Directory Structure"

### Deprecation

If removing a module:
- Remove from "Core Modules"
- Remove from "Symbol Index"
- Update flows that referenced it
- Add note in "Architecture Constraints" if it affects future work

## After Updating

1. **Read through changes** — does it make sense?
2. **Test navigation** — pick a random task, can you find the code?
3. **Check line count** at end of file — update if significantly changed
4. **Commit with clear message:**
   ```
   docs: sync CODEBASE.md with [feature name]
   
   - Add BudgetsTab to Core Modules
   - Update execution flows for budget operations
   - Add budget symbols to index
   ```

## Don't Over-Document

Remember:
- `CODEBASE.md` is for **navigation**, not **understanding**
- Developers will **read the source code** for details
- Keep entries **short and scannable**
- Link to source locations, don't duplicate source content
- If in doubt, **less is more**

## Template for Quick Updates

Use this checklist for common scenarios:

**New Feature (Tab + Modal + Domain):**
- [ ] Add tab to Core Modules
- [ ] Add domain module to Core Modules
- [ ] Add modal to Symbol Index (if complex)
- [ ] Update Architecture diagram (if new pattern)
- [ ] Update Common Change Locations
- [ ] Add symbols to Symbol Index

**Refactoring:**
- [ ] Update affected module entries
- [ ] Update execution flows
- [ ] Update dependencies
- [ ] Document gotchas in Non-obvious Details

**Bug Fix:**
- Usually no CODEBASE.md update needed
- Only update if fix revealed architectural issue

## Remember

- Update `CODEBASE.md` AFTER implementation, not before
- Focus on navigation, not explanation
- Keep it concise and scannable
- Verify all paths and line numbers
- Test that you can navigate using the updated doc
