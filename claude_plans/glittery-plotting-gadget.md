# Add Category & Budget Dropdowns to Create Transaction Form

## Context

The "Add Transaction" sheet currently lacks Category and Budget selectors. Users must create the transaction first, then open its detail panel to assign category/budget — an unnecessary extra step for manual transactions.

## Approach

**Frontend-only change** — chain existing `UpdateTransactionCategory` and `UpdateTransactionBudget` mutations after creation. No backend changes needed since the mutations already exist and the combobox components are reusable.

## File to Modify

`web/src/components/transactions/create-transaction-sheet.tsx`

## Changes

### 1. Add imports

- `useMemo` from React
- `CategoryCombobox` from `@/components/categories/category-combobox`
- `BudgetCombobox` from `@/components/budget/budget-combobox`
- `GetCategoriesDocument`, `GetBudgetsDocument`, `UpdateTransactionCategoryDocument`, `UpdateTransactionBudgetDocument` from generated GraphQL

### 2. Add state variables

```tsx
const [categoryId, setCategoryId] = useState<number | null>(null);
const [budgetId, setBudgetId] = useState<number | null>(null);
```

### 3. Add data fetching (same pattern as detail panel and split form)

```tsx
const { data: categoriesData } = useQuery(GetCategoriesDocument, {
  variables: { activeOnly: true },
});
const { data: budgetsData } = useQuery(GetBudgetsDocument, {
  variables: { activeOnly: false },
});
const categories = useMemo(() => categoriesData?.categories ?? [], [categoriesData]);
const budgets = useMemo(
  () => (budgetsData?.budgets ?? []).filter((budget) => !budget.isArchived),
  [budgetsData],
);
```

### 4. Add update mutation hooks

```tsx
const [updateCategory] = useMutation(UpdateTransactionCategoryDocument);
const [updateBudget] = useMutation(UpdateTransactionBudgetDocument);
```

### 5. Update `handleSubmit` — chain category/budget updates after creation

After `createTransaction` succeeds, get the created ID and fire both update mutations in parallel via `Promise.all` (only for non-null selections).

### 6. Update `handleClose` — reset categoryId and budgetId to null

### 7. Add form fields — after the Type selector, before Description

Two `<div className="grid gap-2">` blocks with `<Label>` + `CategoryCombobox`/`BudgetCombobox`, both optional with `allowNone` prop and `data-qa` attributes.

## Verification

1. `just dev` — open the app, navigate to transactions, click "Add Transaction"
2. Verify Category and Budget dropdowns appear between Type and Description
3. Create a transaction with category + budget selected → both should be saved
4. Create a transaction without selecting either → should work as before
5. `just check` — typecheck + lint pass
