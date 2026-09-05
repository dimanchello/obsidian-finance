---
name: obsidian-finance-review
description: Code review and test coverage for obsidian-finance plugin
---

# Obsidian Finance: Code Review & Testing

You are reviewing code changes in the Obsidian Finance plugin and ensuring adequate test coverage.

## Review Scope

### What to Review

1. **Architecture conformance** — follows patterns from `CODEBASE.md`
2. **Code quality** — clean, readable, maintainable
3. **Business logic correctness** — calculations, validations, edge cases
4. **Test coverage** — unit tests for domain logic, integration tests for complex flows
5. **Mobile support** — responsive design at <480px
6. **i18n completeness** — all strings in `i18n.ts` (ru + en)
7. **Type safety** — no `any`, proper type guards
8. **Convention adherence** — matches `CLAUDE.md` conventions

## Review Process

### Step 1: Understand Changes

Read the files that changed:
```bash
git diff main --name-only
git diff main
```

Identify:
- New features added
- Bug fixes applied
- Refactorings done
- Files modified

### Step 2: Architecture Review

Using `CODEBASE.md`, verify:

**Storage Layer:**
- [ ] Uses `AccountCommands` for entities with `linkedId`
- [ ] No direct `storage.addX()` calls from tabs if linked records exist
- [ ] FileStore pattern followed for new entity types
- [ ] Debounced writes respected (no synchronous expectations)

**Domain Layer:**
- [ ] Business logic in `src/domain/`, not in tabs/modals
- [ ] Pure functions (no DOM, no Obsidian API)
- [ ] Proper validation in `validate.ts`
- [ ] Calculations isolated in `*Calculations.ts`

**View Layer:**
- [ ] Tabs are stateless (recreated on each render)
- [ ] State lives in `ViewContext.state`, not in tab instances
- [ ] `onUpdate` callback wired correctly to `AccountView.refreshAndRender()`
- [ ] No direct DOM manipulation outside render methods

**Auto-Transactions:**
- [ ] Idempotent (uses `RecordMirror` or similar guard)
- [ ] Runs on every render without side effects
- [ ] Schedule generation in `src/domain/schedule.ts`
- [ ] Record materialization in `src/domain/autoTransactions.ts`

**Linked Records:**
- [ ] Created via `src/domain/linkedRecords.ts` helpers
- [ ] Synced atomically with entity changes
- [ ] Deleted when parent entity deleted
- [ ] Not duplicated (proper `linkedId` checking)

### Step 3: Code Quality Review

**TypeScript:**
- [ ] No `any` types (use proper types or `unknown` with guards)
- [ ] Interfaces for object shapes (not types)
- [ ] Nullish coalescing (`??`) used instead of `||` where appropriate
- [ ] Optional chaining (`?.`) used for nullable access
- [ ] Proper error handling (try/catch for async, null checks)

**Constants:**
- [ ] No magic numbers (all extracted to `UPPER_SNAKE_CASE`)
- [ ] Constants in `src/types.ts` or `src/constants.ts`
- [ ] Meaningful names (not `CONSTANT_1`, `CONSTANT_2`)

**Formatting:**
- [ ] Dates as `YYYY-MM-DD` strings (never Date objects in storage)
- [ ] Times as `HH:MM` or `''`
- [ ] Amounts as `number`, formatted via `ctx.fmt()` or `fmt()`
- [ ] Normalized via `normalizeDateStr()`/`normalizeTimeStr()`

**Code Organization:**
- [ ] Shared utilities in `src/utils.ts` (no duplication in modals)
- [ ] Similar code follows similar patterns (check existing tabs/modals)
- [ ] Reasonable function/method length (<100 lines)
- [ ] Clear variable names (not `x`, `tmp`, `data1`)

### Step 4: Business Logic Review

**Correctness:**
- [ ] Calculations are correct (interest, annuity, accruals)
- [ ] Edge cases handled (zero amounts, negative numbers, missing fields)
- [ ] Date math correct (leap years, month boundaries, DST)
- [ ] Currency precision maintained (use `round2()` from `money.ts`)

**Data Integrity:**
- [ ] Linked records stay in sync
- [ ] Balance calculations correct
- [ ] No data loss on edit/delete
- [ ] State persistence works (localStorage + state.json)

**User Experience:**
- [ ] Validation messages clear and helpful
- [ ] Error handling graceful (no crashes)
- [ ] Loading states for async operations
- [ ] Confirmations for destructive actions

### Step 5: Mobile Support Review

**Responsive Design:**
- [ ] Tested at <480px width
- [ ] No horizontal scroll
- [ ] Tables use `DataTable` (automatic card fallback)
- [ ] Buttons are large enough (min 44px)
- [ ] Touch targets spaced appropriately
- [ ] Text readable without zoom

**Detection:**
- [ ] Uses `Platform.isMobile || window.innerWidth <= MOBILE_BREAKPOINT`
- [ ] Computed at render time (not reactive)
- [ ] Consistent across components

### Step 6: i18n Review

**Completeness:**
- [ ] All user-facing strings in `src/i18n.ts`
- [ ] Added to `Translations` interface
- [ ] Russian translations (`ru` object)
- [ ] English translations (`en` object)
- [ ] No hardcoded strings in components

**Quality:**
- [ ] Translations are natural (not literal word-for-word)
- [ ] Consistent terminology across UI
- [ ] Proper pluralization handled
- [ ] Date/time formats locale-appropriate

### Step 7: Test Coverage Review

This is the MOST IMPORTANT part. See "Test Coverage Requirements" below.

## Test Coverage Requirements

### What MUST Be Tested

**Domain Logic (Unit Tests):**
- [ ] Calculations (`*Calculations.ts`)
- [ ] Validations (`validate.ts`)
- [ ] Parsers (backfill logic)
- [ ] Date math (`dateMath.ts`)
- [ ] Money operations (`money.ts`)
- [ ] Schedule generation (`schedule.ts`)
- [ ] Linked record helpers (`linkedRecords.ts`)
- [ ] View state parsing (`viewState.ts`)
- [ ] Currency balance (`currencyBalance.ts`)
- [ ] Overview metrics (`overviewMetrics.ts`)

**Storage (Unit Tests):**
- [ ] CRUD operations work
- [ ] Caching works (load twice, second is cached)
- [ ] Dirty tracking works (marks dirty on change)
- [ ] Flush works (writes to vault)
- [ ] Debouncing works (waits 500ms)
- [ ] Linked record deletion (cascades correctly)

**Auto-Transactions (Integration Tests):**
- [ ] Schedule generation (first time)
- [ ] Settle due items (marks paid)
- [ ] Record materialization (creates FinanceRecords)
- [ ] Idempotency (run twice, same result)
- [ ] Deposit opening/refund/interest
- [ ] Credit receipt/payments
- [ ] Edge cases (zero rate, past dates, closed entities)

**Complex Flows (Integration Tests):**
- [ ] Add entity → linked records created
- [ ] Edit entity → linked records updated
- [ ] Delete entity → linked records deleted
- [ ] Auto-transactions → records appear
- [ ] State persistence → survives reload
- [ ] Concurrent operations → no race conditions

### What Should NOT Be Tested

**Do NOT test:**
- DOM rendering (AccountView, tabs, modals)
- Obsidian API calls (vault, notices, settings)
- User interactions (clicks, typing)
- CSS/styling
- Manual operations (no way to test user clicking buttons)

### Test Structure

**Unit Test Example:**
```typescript
// src/__tests__/myFeature.test.ts
import { describe, it, expect } from 'vitest';
import { calculateX } from '../domain/myFeature';

describe('calculateX', () => {
  it('returns correct result for positive input', () => {
    expect(calculateX(10)).toBe(20);
  });

  it('handles zero input', () => {
    expect(calculateX(0)).toBe(0);
  });

  it('handles negative input', () => {
    expect(calculateX(-5)).toBe(-10);
  });
});
```

**Integration Test Example:**
```typescript
// src/__tests__/integration-myFeature.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { applyAutoTransactions } from '../domain/autoTransactions';
import type { AccountData, AutoTxDeps } from '../types';

describe('MyFeature Auto-Transactions', () => {
  let data: AccountData;
  let deps: AutoTxDeps;

  beforeEach(() => {
    data = {
      version: 1,
      name: 'Test',
      currency: '₽',
      records: [],
      debts: [],
      credits: [],
      deposits: [],
      exchanges: [],
      categories: [],
      tags: [],
      payers: [],
    };
    
    deps = {
      today: '2024-01-15',
      now: Date.now(),
      nowTime: '12:00',
      newId: () => crypto.randomUUID(),
      labels: {
        // ... translation labels
      },
    };
  });

  it('creates records for new entity', () => {
    data.myEntities.push({
      id: 'test-1',
      amount: 1000,
      startDate: '2024-01-01',
      // ... fields
    });

    const result = applyAutoTransactions(data, deps);
    
    expect(result.changed.records).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].linkedId).toBe('test-1');
  });

  it('is idempotent when run twice', () => {
    data.myEntities.push({ /* entity */ });

    const result1 = applyAutoTransactions(data, deps);
    const result2 = applyAutoTransactions(result1, deps);
    
    expect(result1.records).toEqual(result2.records);
  });
});
```

### Test Coverage Goals

**Minimum Coverage:**
- Domain logic: **90%+**
- Storage CRUD: **80%+**
- Auto-transactions: **85%+**
- Integration flows: **70%+**

**Critical Paths:**
- Any calculation involving money: **100%**
- Date/time logic: **100%**
- Data migrations: **100%**
- Linked record sync: **100%**

## Review Checklist

Use this checklist for each review:

### Architecture
- [ ] Storage layer: AccountCommands used for linked records
- [ ] Domain layer: business logic isolated, pure functions
- [ ] View layer: tabs stateless, state in ViewContext
- [ ] Auto-transactions: idempotent, uses RecordMirror
- [ ] Linked records: synced atomically

### Code Quality
- [ ] No `any` types
- [ ] No magic numbers (all constants)
- [ ] Proper error handling
- [ ] Clear variable names
- [ ] Shared utilities not duplicated

### Business Logic
- [ ] Calculations correct
- [ ] Edge cases handled
- [ ] Data integrity maintained
- [ ] UX graceful (errors, confirmations)

### Mobile Support
- [ ] Responsive at <480px
- [ ] No horizontal scroll
- [ ] Touch targets adequate
- [ ] Tested on mobile viewport

### i18n
- [ ] All strings in i18n.ts
- [ ] Both ru and en translated
- [ ] No hardcoded text

### Test Coverage
- [ ] Domain logic: 90%+ coverage
- [ ] Storage: 80%+ coverage
- [ ] Auto-transactions: 85%+ coverage
- [ ] Integration tests for complex flows
- [ ] Critical paths: 100% coverage

### Verification
- [ ] `npm run lint` passes (0 errors)
- [ ] `npm run build` passes (clean compile)
- [ ] `npm test` passes (all green)
- [ ] Manual testing done (desktop + mobile)

## Review Report Format

After review, provide a structured report:

```markdown
# Code Review: [Feature Name]

## Summary

**Overall Assessment:** ✅ Approved / ⚠️ Needs Changes / ❌ Major Issues

**Files Changed:** X files
**Lines Changed:** +XXX -YYY
**Test Coverage:** XX%

## Architecture Review

✅ **Strengths:**
- Follows AccountCommands pattern correctly
- Domain logic properly isolated
- Tabs remain stateless

⚠️ **Issues:**
- [Issue 1]: [Description + suggestion]
- [Issue 2]: [Description + suggestion]

## Code Quality

✅ **Good:**
- No `any` types
- Constants extracted properly
- Clear naming

⚠️ **Improvements Needed:**
- [File.ts:42]: Magic number 30 should be constant
- [File.ts:89]: Consider extracting to helper function

## Business Logic

✅ **Correct:**
- Calculations verified
- Edge cases handled

❌ **Critical Issues:**
- [File.ts:156]: Division by zero not handled
- [File.ts:203]: Negative amount breaks calculation

## Test Coverage

**Current Coverage:** XX%

**Missing Tests:**
- [ ] `calculateX()` — edge cases (zero, negative)
- [ ] `validateY()` — invalid input handling
- [ ] Integration: entity deletion with linked records
- [ ] Integration: auto-transaction idempotency

**Existing Tests:** ✅ All passing

## Mobile Support

✅ **Responsive:** Tested at 375px, works correctly

⚠️ **Issues:**
- [Component]: Horizontal scroll on small screens
- [Modal]: Buttons too small (<44px)

## i18n

✅ **Complete:** All strings in i18n.ts (ru + en)

## Required Changes

### Critical (Must Fix):
1. [File.ts:156]: Add division by zero check
2. Add test coverage for `calculateX()` edge cases
3. Fix mobile horizontal scroll in [Component]

### Recommended:
1. Extract magic numbers to constants
2. Add integration test for deletion cascade
3. Consider refactoring [LongMethod] for clarity

### Optional:
1. Consider adding [Feature] for better UX
2. Could optimize [SlowOperation] if performance issue

## Next Steps

1. Fix critical issues
2. Add missing tests (aim for 90%+ domain coverage)
3. Re-run verification: `npm run lint && npm run build && npm test`
4. Re-review changed areas

## Approval Status

- [ ] Architecture: Approved
- [ ] Code Quality: Needs minor changes
- [ ] Business Logic: Critical issue (division by zero)
- [ ] Test Coverage: Needs tests added
- [ ] Mobile: Needs fix
- [ ] i18n: Approved

**Overall:** ⚠️ Address critical issues and add tests, then re-review.
```

## Remember

- Be thorough but constructive
- Provide specific file:line references
- Suggest fixes, not just problems
- Prioritize: Critical > Recommended > Optional
- Test coverage is NON-NEGOTIABLE for domain logic
- 90%+ coverage for calculations/validations/parsers
- 100% coverage for money/date math
- Integration tests for complex flows

## Common Issues to Watch For

### Architecture Violations
- Direct storage calls from tabs (should use AccountCommands)
- Business logic in tabs/modals (should be in domain/)
- Stateful tabs (state should be in ViewContext)

### Type Safety Issues
- Using `any` instead of proper types
- Missing null checks
- Type assertions without validation

### Data Integrity Issues
- Linked records not synced
- Balance calculations wrong
- State not persisted

### Mobile Issues
- Horizontal scroll
- Too-small touch targets
- Desktop-only assumptions

### i18n Issues
- Hardcoded strings
- Missing translations
- Literal word-for-word translations

### Test Coverage Gaps
- No tests for calculations
- No tests for edge cases
- No integration tests for complex flows
- Critical paths untested
