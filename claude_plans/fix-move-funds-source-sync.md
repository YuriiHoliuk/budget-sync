---
description: Fix move funds sheet not syncing initialSourceBudgetId
---

# Fix: Move funds sheet source budget not syncing

## Problem

`useState(initialSourceBudgetId)` only captures the value on first mount. When the parent updates `initialSourceBudgetId` and sets `open=true`, the sheet's internal state is stale.

## Option A: Key prop (recommended)

Force remount by passing a key that changes each time the sheet opens. The parent increments a counter in `handleMoveFunds`, and the sheet component needs zero sync logic.

**Parent (`budget-table.tsx`):**
```tsx
const [moveFundsKey, setMoveFundsKey] = useState(0);

const handleMoveFunds = (sourceBudgetId?: number) => {
  setMoveFundsSourceId(sourceBudgetId);
  setMoveFundsOpen(true);
  setMoveFundsKey(prev => prev + 1);
};

<MoveFundsSheet key={moveFundsKey} ... />
```

**Sheet (`move-funds-sheet.tsx`):**
- Remove `prevOpen` state and the sync block
- Remove `handleOpenChange` entirely — just pass `onOpenChange` to Sheet directly
- Remove `handleClose` — just call `onOpenChange(false)`
- `useState(initialSourceBudgetId)` works correctly because the component remounts fresh each time

## Option B: useEffect with lint suppression

Add back the `useEffect` that syncs state when `open` becomes true. Suppress the `react-hooks/set-state-in-effect` lint rule on that line. Simple but hides the real issue behind a suppression comment.
