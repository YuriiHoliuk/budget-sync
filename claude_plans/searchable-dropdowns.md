# Searchable Dropdowns for Budget and Category Selection

## Problem

All budget and category selection throughout the frontend uses the ShadCN `Select` component (Radix UI primitive). This works for small lists but becomes painful as the number of budgets and categories grows:

- No search/filter capability -- users must scroll through the full list
- Categories are hierarchical (parent > child) and displayed as `fullPath` (e.g., "Food > Groceries"), making the list long
- Budgets are numerous and not grouped in select dropdowns
- The issue is worst on the transactions page where users frequently assign categories and budgets

## Current Implementation Analysis

Every select currently uses `@/components/ui/select` which wraps `radix-ui`'s Select primitive. There is **no** `cmdk` dependency or ShadCN Command component installed.

### All Locations Using Budget/Category Selects

#### 1. Transaction Filters Bar (`web/src/components/transactions/transactions-table.tsx`)
- **Category filter** (lines 427-445): `Select` with `fullPath` display, "All categories" default
- **Budget filter** (lines 448-466): `Select` with budget names, "All budgets" default
- **Account filter** (lines 405-422): `Select` -- not a target for this change (small list)
- Data attributes: `select-category-filter`, `select-budget-filter`

#### 2. Transaction Row Inline Edit (`web/src/components/transactions/transactions-table.tsx`)
- **Category inline select** (lines 627-643): `Select` in table cell, "None" option, `fullPath` display
- **Budget inline select** (lines 671-686): `Select` in table cell, "None" option

#### 3. Transaction Detail Panel (`web/src/components/transactions/transaction-detail-panel.tsx`)
- **Category select** (lines 304-323): `Select` with "No category" option, `fullPath` display
- **Budget select** (lines 334-350): `Select` with "No budget" option

#### 4. Unbudgeted Transactions Warning (`web/src/components/budget/unbudgeted-transactions-warning.tsx`)
- **Budget assignment select** (lines 216-227): `Select` per transaction row, placeholder "Select budget..."

#### 5. Move Funds Dialog (`web/src/components/budget/move-funds-dialog.tsx`)
- **Source budget** (lines 141-168): `Select` showing budget name + available balance
- **Destination budget** (lines 183-209): `Select` showing budget name + available balance

#### 6. Move Funds Sheet (`web/src/components/budget/move-funds-sheet.tsx`)
- **Source budget** (lines 142-169): Same as dialog variant
- **Destination budget** (lines 183-209): Same as dialog variant

#### 7. Create Budget Sheet (`web/src/components/budget/create-budget-sheet.tsx`)
- **Budget group select** (lines 156-172): `Select` for budget groups -- small list, low priority

#### 8. Edit Budget Sheet (`web/src/components/budget/edit-budget-sheet.tsx`)
- **Budget group select** (lines 227-243): `Select` for budget groups -- small list, low priority

#### 9. Create Category Dialog (`web/src/components/categories/create-category-dialog.tsx`)
- **Parent category select** (lines 146-163): `Select` with root categories only

#### 10. Create Category Sheet (`web/src/components/categories/create-category-sheet.tsx`)
- **Parent category select** (lines 147-164): Same as dialog variant

#### 11. Edit Category Dialog (`web/src/components/categories/edit-category-dialog.tsx`)
- **Parent category select** (lines 137-155): `Select` with root categories (excluding self)

#### 12. Edit Category Sheet (`web/src/components/categories/edit-category-sheet.tsx`)
- **Parent category select** (lines 138-156): Same as dialog variant

### Summary of Select Usage Patterns

| Pattern | Component Needed | Priority |
|---------|-----------------|----------|
| Category selection (fullPath, allow "None"/"All") | `CategoryCombobox` | High |
| Budget selection (name, allow "None"/"All") | `BudgetCombobox` | High |
| Budget selection with balance display | `BudgetCombobox` (variant) | High |
| Parent category selection (root only) | `CategoryCombobox` (variant) | Medium |
| Budget group selection | Keep as `Select` | Low (small list) |
| Cadence unit, status, type selects | Keep as `Select` | N/A (enum lists) |

## Recommended Approach

### ShadCN Combobox Pattern (Command + Popover)

The standard ShadCN approach for searchable selects is the **Combobox** pattern, which combines:
- `Popover` (already installed) for the dropdown container
- `Command` (from `cmdk` library) for the search input and filterable list

This is the officially recommended ShadCN pattern for searchable selection. It provides:
- Built-in fuzzy search/filtering via `cmdk`
- Keyboard navigation (arrow keys, Enter, Escape)
- Accessible (ARIA combobox pattern)
- Consistent with ShadCN design system

### Dependencies to Add

- `cmdk` (version ^1.0.0) -- lightweight command menu library used by ShadCN Command component

### New UI Component

Add `web/src/components/ui/command.tsx` -- the standard ShadCN Command component wrapper around `cmdk`. This is a well-known ShadCN component that provides:
- `Command` -- root container
- `CommandInput` -- search input
- `CommandList` -- scrollable list
- `CommandEmpty` -- empty state
- `CommandGroup` -- grouped items (perfect for category parent/child)
- `CommandItem` -- individual selectable item
- `CommandSeparator` -- visual separator between groups

## Component Design

### Generic `SearchableSelect` Wrapper

Create a reusable wrapper that encapsulates the Popover + Command pattern:

**File**: `web/src/components/ui/searchable-select.tsx`

```tsx
interface SearchableSelectOption {
  value: string;
  label: string;
  group?: string;           // For grouping (e.g., parent category name)
  searchTerms?: string[];   // Additional terms to match during search
  disabled?: boolean;
  render?: React.ReactNode; // Custom rendering (e.g., budget with balance)
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;       // Trigger placeholder text
  searchPlaceholder?: string; // Search input placeholder
  emptyMessage?: string;      // Message when no results
  allowClear?: boolean;       // Show "None" / clear option
  clearLabel?: string;        // Label for clear option (e.g., "No category")
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  "data-qa"?: string;
}
```

This generic component handles:
- Open/close popover state
- Search input with filtering
- Keyboard navigation
- Selected item display in trigger
- Optional "None" / clear option
- Grouped items via `CommandGroup`

### Domain-Specific Comboboxes

Build on top of `SearchableSelect`:

#### `CategoryCombobox` (`web/src/components/categories/category-combobox.tsx`)

```tsx
interface CategoryComboboxProps {
  categories: Array<{ id: number; name: string; fullPath: string; parentName?: string | null }>;
  value: number | null;
  onValueChange: (categoryId: number | null) => void;
  allowNone?: boolean;        // "No category" option
  allowAll?: boolean;         // "All categories" option (for filters)
  rootOnly?: boolean;         // Only show root categories (for parent selection)
  excludeIds?: number[];      // Exclude specific categories (for edit forms)
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-qa"?: string;
}
```

**Handling hierarchical categories in search:**
- Group items by parent category name using `CommandGroup`
- Root categories without children appear as ungrouped items
- Root categories with children appear as group headers
- Child categories appear indented under their parent group
- Search matches against both `name` and `fullPath` (so searching "groc" matches "Food > Groceries")
- When `rootOnly` is true, only show root categories (flat list, no groups)

Example rendering:
```
[Search categories...]
---
No category
---
Food                    (group header, also selectable)
  Groceries
  Restaurants
  Coffee
Transport               (group header, also selectable)
  Fuel
  Public Transit
Entertainment           (root category, no children)
Utilities               (root category, no children)
```

#### `BudgetCombobox` (`web/src/components/budget/budget-combobox.tsx`)

```tsx
interface BudgetComboboxProps {
  budgets: Array<{ id: number; name: string }>;
  value: number | null;
  onValueChange: (budgetId: number | null) => void;
  allowNone?: boolean;        // "No budget" option
  allowAll?: boolean;         // "All budgets" option (for filters)
  disabledIds?: number[];     // Disable specific budgets (for move funds)
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-qa"?: string;
  // For move funds variant:
  showBalance?: boolean;
  balanceMap?: Map<number, number>; // budgetId -> available balance
}
```

For the **move funds** variant, each item shows the budget name and available balance side by side, with red color for negative balances.

## Files to Create

1. `web/src/components/ui/command.tsx` -- ShadCN Command component (standard boilerplate)
2. `web/src/components/ui/searchable-select.tsx` -- Generic searchable select wrapper
3. `web/src/components/categories/category-combobox.tsx` -- Category-specific combobox
4. `web/src/components/budget/budget-combobox.tsx` -- Budget-specific combobox

## Files to Modify

### High Priority (budget and category selection)

5. `web/src/components/transactions/transactions-table.tsx`
   - Replace category filter `Select` with `CategoryCombobox` (allowAll mode)
   - Replace budget filter `Select` with `BudgetCombobox` (allowAll mode)
   - Replace inline category edit `Select` with `CategoryCombobox` (allowNone mode)
   - Replace inline budget edit `Select` with `BudgetCombobox` (allowNone mode)

6. `web/src/components/transactions/transaction-detail-panel.tsx`
   - Replace category `Select` with `CategoryCombobox` (allowNone mode)
   - Replace budget `Select` with `BudgetCombobox` (allowNone mode)

7. `web/src/components/budget/unbudgeted-transactions-warning.tsx`
   - Replace budget assignment `Select` with `BudgetCombobox`

8. `web/src/components/budget/move-funds-dialog.tsx`
   - Replace source/dest budget `Select` with `BudgetCombobox` (showBalance mode)

9. `web/src/components/budget/move-funds-sheet.tsx`
   - Replace source/dest budget `Select` with `BudgetCombobox` (showBalance mode)

### Medium Priority (parent category selection)

10. `web/src/components/categories/create-category-dialog.tsx`
    - Replace parent category `Select` with `CategoryCombobox` (rootOnly mode)

11. `web/src/components/categories/create-category-sheet.tsx`
    - Replace parent category `Select` with `CategoryCombobox` (rootOnly mode)

12. `web/src/components/categories/edit-category-dialog.tsx`
    - Replace parent category `Select` with `CategoryCombobox` (rootOnly, excludeIds mode)

13. `web/src/components/categories/edit-category-sheet.tsx`
    - Replace parent category `Select` with `CategoryCombobox` (rootOnly, excludeIds mode)

### Low Priority (keep as-is)

- Budget group selects in create/edit budget sheets -- small list, `Select` is fine
- Cadence unit, status, type selects -- enum lists with 2-4 options, `Select` is fine

## E2E Test Updates

The `selectOption` method in `e2e/components/Dialog.ts` clicks a `data-qa` trigger then picks a Radix `role="option"`. The Combobox pattern uses `cmdk` items which render as `role="option"` as well, but inside a Command list rather than a Radix Select portal.

### Files to Update

14. `e2e/components/Dialog.ts`
    - Add a `searchAndSelectOption(qaAttribute, searchText, optionText)` method for combobox interactions
    - Keep existing `selectOption` for non-searchable selects (cadence, status, type, etc.)

15. `e2e/pages/TransactionsPage.ts`
    - Update `filterByCategory` and `filterByBudget` to use the new combobox interaction pattern

16. `e2e/pages/CategoriesPage.ts`
    - Update `selectParent` to use the new combobox interaction pattern

17. `e2e/pages/BudgetPage.ts`
    - Update `selectSourceBudget` and `selectDestinationBudget` to use combobox pattern

18. `e2e/tests/budget/move-funds.spec.ts`
    - Update direct `data-qa` clicks to use the new combobox flow (type to search, then select)

## Implementation Order

1. **SRCH-001**: Install `cmdk`, add `command.tsx` UI component
2. **SRCH-002**: Create `SearchableSelect` generic wrapper component
3. **SRCH-003**: Create `CategoryCombobox` with hierarchical group support
4. **SRCH-004**: Create `BudgetCombobox` with optional balance display
5. **SRCH-005**: Replace selects in transaction detail panel (simplest consumer)
6. **SRCH-006**: Replace selects in transaction filters and inline edits
7. **SRCH-007**: Replace selects in unbudgeted transactions warning
8. **SRCH-008**: Replace selects in move funds dialog and sheet
9. **SRCH-009**: Replace selects in category create/edit dialogs and sheets
10. **SRCH-010**: Update E2E test helpers and page objects

## Technical Notes

- The `cmdk` library handles fuzzy search filtering natively -- no custom filter logic needed
- `CommandGroup` renders a label/heading and groups items visually -- maps well to parent categories
- The combobox trigger should look identical to the current `SelectTrigger` for visual consistency
- For inline table edits (transaction row), the combobox needs to work at a small height (`h-8`)
- All existing `data-qa` attributes must be preserved for E2E compatibility
- The `SearchableSelect` should support the same `value`/`onValueChange` pattern as Radix Select for easy migration
