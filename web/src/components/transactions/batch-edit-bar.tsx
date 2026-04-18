"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryCombobox, NONE_FILTER } from "@/components/categories/category-combobox";
import { BudgetCombobox } from "@/components/budget/budget-combobox";
import { cn } from "@/lib/utils";

export interface CategoryOption {
  id: number;
  name: string;
  fullPath: string;
  parentName?: string | null;
  transactionCount?: number;
}

export interface BudgetOption {
  id: number;
  name: string;
  transactionCount?: number;
  startDate?: string | null;
  endDate?: string | null;
}

interface BatchEditBarProps {
  selectedCount: number;
  categories: CategoryOption[];
  budgets: BudgetOption[];
  onApplyCategory: (categoryId: number | null) => void | Promise<void>;
  onApplyBudget: (budgetId: number | null) => void | Promise<void>;
  onVerify: () => void | Promise<void>;
  onClear: () => void;
  loading?: boolean;
}

export function BatchEditBar({
  selectedCount,
  categories,
  budgets,
  onApplyCategory,
  onApplyBudget,
  onVerify,
  onClear,
  loading = false,
}: BatchEditBarProps) {
  // Local "nonce" keys to reset the comboboxes after an apply so they stay
  // unbound — the bar never reflects the selection's current category/budget,
  // each pick is an atomic action.
  const [categoryNonce, setCategoryNonce] = useState(0);
  const [budgetNonce, setBudgetNonce] = useState(0);

  const handleCategorySelect = async (categoryId: number | null) => {
    // NONE_FILTER -> treat as "clear category".
    const normalized = categoryId === NONE_FILTER ? null : categoryId;
    try {
      await onApplyCategory(normalized);
    } finally {
      setCategoryNonce((value) => value + 1);
    }
  };

  const handleBudgetSelect = async (budgetId: number | null) => {
    const normalized = budgetId === NONE_FILTER ? null : budgetId;
    try {
      await onApplyBudget(normalized);
    } finally {
      setBudgetNonce((value) => value + 1);
    }
  };

  return (
    <div
      data-qa="batch-edit-bar"
      className={cn(
        // Mobile: fixed bottom bar with safe-area padding.
        "fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-2 border-t bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg",
        // Desktop (md+): inline sticky-ish banner above the table.
        "md:static md:rounded-lg md:border md:px-4 md:py-2 md:shadow-none md:pb-2",
      )}
    >
      <div className="flex flex-1 items-center gap-2">
        <span
          className="text-sm font-medium"
          data-qa="text-batch-selected-count"
        >
          {selectedCount} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={loading}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          data-qa="btn-batch-clear"
        >
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[160px]" data-qa="batch-category-picker">
          <CategoryCombobox
            key={`category-${categoryNonce}`}
            categories={categories}
            value={null}
            onValueChange={handleCategorySelect}
            allowNone
            disabled={loading}
            placeholder="Category..."
            triggerClassName="h-8 w-full"
            data-qa="select-batch-category"
          />
        </div>
        <div className="w-[160px]" data-qa="batch-budget-picker">
          <BudgetCombobox
            key={`budget-${budgetNonce}`}
            budgets={budgets}
            value={null}
            onValueChange={handleBudgetSelect}
            allowNone
            disabled={loading}
            placeholder="Budget..."
            triggerClassName="h-8 w-full"
            data-qa="select-batch-budget"
          />
        </div>
        <Button
          size="sm"
          onClick={() => {
            void onVerify();
          }}
          disabled={loading}
          className="h-8 gap-1"
          data-qa="btn-batch-verify"
        >
          <Check className="h-4 w-4" />
          Verify
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={loading}
          className="h-8 w-8 p-0"
          data-qa="btn-batch-close"
          title="Close"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
    </div>
  );
}
