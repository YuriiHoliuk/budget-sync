---
description: Fix rename input disappearing bug and add unallocate feature to move funds sheet
---

# Plan: Fix rename bug + Add unallocate feature

## Context

Two bugs and one feature request:
1. **Bug (rename):** Clicking "Rename" from the budget group dropdown menu causes the inline input to appear and immediately disappear. The dropdown's close behavior triggers a blur event on the newly focused input, calling `handleSave()` → `setIsEditing(false)`.
2. **Bug (move funds preselection):** Already fixed — `useEffect` syncs `sourceBudgetId` when sheet opens.
3. **Feature (unallocate):** Allow unallocating funds from a budget without selecting a destination, returning money to "Ready to Assign".

## 1. Fix: Rename input disappearing (clean approach)

**File:** `web/src/components/budget/budget-table.tsx` — `GroupHeaderRow` component (line ~736)

**Approach:** Use DropdownMenu's `onOpenChange` to defer edit start until after the menu is fully closed. This replaces the `justStartedEditingRef` hack.

- Add `pendingAction` ref to track that a rename was requested
- In `DropdownMenuItem onClick`, set the pending flag instead of calling `handleStartEdit` directly
- Control the dropdown with `open`/`onOpenChange` state; when `onOpenChange(false)` fires (menu fully closed), check the pending flag and start editing
- Remove `justStartedEditingRef` and `handleBlur` — revert `onBlur` to call `handleSave` directly

```tsx
const [isMenuOpen, setIsMenuOpen] = useState(false);
const pendingActionRef = useRef<"rename" | null>(null);

const handleMenuOpenChange = (open: boolean) => {
  setIsMenuOpen(open);
  if (!open && pendingActionRef.current === "rename") {
    pendingActionRef.current = null;
    handleStartEdit();
  }
};

// DropdownMenuItem onClick just sets the flag:
<DropdownMenuItem onClick={() => { pendingActionRef.current = "rename"; }}>

// DropdownMenu uses controlled state:
<DropdownMenu open={isMenuOpen} onOpenChange={handleMenuOpenChange}>
```

## 2. Feature: Unallocate funds from move funds sheet

The backend already supports negative allocations via `createAllocation` mutation (`CreateAllocationInput.amount` explicitly allows negative values). No backend changes needed.

### Frontend changes

**File:** `web/src/components/budget/move-funds-sheet.tsx`

- Make destination budget optional — allow submitting with only a source budget and amount
- When no destination is selected, call `createAllocation` (negative amount) instead of `moveFunds`
- Update validation: `canSubmit` requires source + amount, destination is optional
- Update cache: use existing `updateMonthlyOverviewCache()` with negative delta (it already adjusts `readyToAssign`)
- Add `CreateAllocationDocument` import
- Update UI copy: show contextual description ("Unallocate" vs "Move") and button text based on whether destination is selected
- Add a visual indicator (e.g. helper text) when in unallocate mode explaining money goes back to Ready to Assign

**Validation logic change:**
```tsx
// Before: both source and dest required
const canSubmit = sourceBudgetId !== null && destBudgetId !== null && sourceBudgetId !== destBudgetId && isValidAmount;

// After: dest is optional
const canSubmit = sourceBudgetId !== null && isValidAmount &&
  (destBudgetId === null || destBudgetId !== sourceBudgetId);
```

**Submit logic:**
```tsx
if (destBudgetId !== null) {
  // Existing moveFunds mutation (paired allocations)
  await moveFunds({ ... });
} else {
  // Unallocate: single negative allocation
  await createAllocation({
    variables: {
      input: {
        budgetId: sourceBudgetId,
        amount: -parsedAmount,  // negative to unallocate
        currency: "UAH",
        period: month,
      },
    },
    update: (cache) => {
      updateMonthlyOverviewCache(cache, month, sourceBudgetId, -parsedAmount);
    },
  });
}
```

## Files to modify

| File | Change |
|------|--------|
| `web/src/components/budget/budget-table.tsx` | Fix rename: use `onOpenChange` to defer edit start |
| `web/src/components/budget/move-funds-sheet.tsx` | Add unallocate mode (optional destination) |

## Verification

1. `just check` — typecheck + lint
2. Manual test: create budget group → dropdown → Rename → input should stay visible
3. Manual test: click "Move funds" on a budget → leave destination empty → enter amount → submit → verify Ready to Assign increases
4. Manual test: click "Move funds" → select both source and destination → submit → verify existing move behavior unchanged
5. `just test` — unit tests
6. `just test-api` — API integration tests
