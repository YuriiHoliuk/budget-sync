"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { Plus, X, Loader2, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import { BudgetCombobox } from "@/components/budget/budget-combobox";
import {
  SplitTransactionDocument,
  GetCategoriesDocument,
  GetBudgetsDocument,
} from "@/graphql/generated/graphql";
import { addTransactionsToCache, evictSiblingTransactions } from "@/lib/cache-utils";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SplitPart {
  amount: string;
  description: string;
  categoryId: number | null;
  budgetId: number | null;
  notes: string;
}

function createEmptyPart(): SplitPart {
  return {
    amount: "",
    description: "",
    categoryId: null,
    budgetId: null,
    notes: "",
  };
}

interface SplitTransactionFormProps {
  transactionId: number;
  transactionAmount: number;
  currency: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function SplitTransactionForm({
  transactionId,
  transactionAmount,
  currency,
  onComplete,
  onCancel,
}: SplitTransactionFormProps) {
  const [parts, setParts] = useState<SplitPart[]>([createEmptyPart()]);
  const [error, setError] = useState("");

  const { data: categoriesData } = useQuery(GetCategoriesDocument, {
    variables: { activeOnly: true },
  });

  const { data: budgetsData } = useQuery(GetBudgetsDocument, {
    variables: { activeOnly: false },
  });

  const categories = useMemo(
    () => categoriesData?.categories ?? [],
    [categoriesData],
  );

  const budgets = useMemo(
    () => (budgetsData?.budgets ?? []).filter((budget) => !budget.isArchived),
    [budgetsData],
  );

  const [splitTransaction, { loading }] = useMutation(
    SplitTransactionDocument,
    {
      update(cache, { data }) {
        if (!data?.splitTransaction) return;

        const { sourceTransaction, splitTransactions } = data.splitTransaction;

        // Add new split transactions to the transactions list
        addTransactionsToCache(cache, splitTransactions);

        // Evict stale siblingTransactions from pre-existing siblings
        const newSplitIds = new Set(splitTransactions.map((t) => t.id));
        const preExistingSiblingIds = sourceTransaction.siblingTransactions
          .map((s) => s.id)
          .filter((id) => !newSplitIds.has(id));

        if (preExistingSiblingIds.length > 0) {
          evictSiblingTransactions(cache, preExistingSiblingIds);
        }
      },
    },
  );

  const partsTotal = useMemo(() => {
    return parts.reduce((sum, part) => {
      const parsed = Number.parseFloat(part.amount);
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
  }, [parts]);

  const remaining = transactionAmount - partsTotal;
  const roundedRemaining = Math.round(remaining * 100) / 100;
  const isRemainingNegative = roundedRemaining < 0;
  const isRemainingZero = Math.abs(roundedRemaining) < 0.005;

  const allPartsValid = parts.every((part) => {
    const parsed = Number.parseFloat(part.amount);
    return !Number.isNaN(parsed) && parsed > 0;
  });

  const canSubmit =
    parts.length >= 1 && allPartsValid && !isRemainingNegative && !isRemainingZero && !loading;

  const handleAddPart = () => {
    setParts((prev) => [...prev, createEmptyPart()]);
  };

  const handleRemovePart = (index: number) => {
    setParts((prev) => prev.filter((_, partIndex) => partIndex !== index));
  };

  const handlePartChange = (
    index: number,
    field: keyof SplitPart,
    value: string | number | null,
  ) => {
    setParts((prev) =>
      prev.map((part, partIndex) =>
        partIndex === index ? { ...part, [field]: value } : part,
      ),
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

    const splitParts = parts.map((part) => ({
      amount: Number.parseFloat(part.amount),
      description: part.description.trim() || undefined,
      categoryId: part.categoryId ?? undefined,
      budgetId: part.budgetId ?? undefined,
      notes: part.notes.trim() || undefined,
    }));

    try {
      await splitTransaction({
        variables: {
          input: {
            transactionId,
            parts: splitParts,
          },
        },
      });
      onComplete();
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to split transaction";
      setError(message);
    }
  };

  return (
    <div className="space-y-4" data-qa="split-transaction-form">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Split Transaction
        </h3>
        <div className="text-sm tabular-nums" data-qa="split-remaining">
          <span className="text-muted-foreground">Remaining: </span>
          <span
            className={cn(
              "font-medium",
              isRemainingNegative
                ? "text-red-600 dark:text-red-400"
                : "text-foreground",
            )}
          >
            {formatCurrency(roundedRemaining)} {currency}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {parts.map((part, index) => (
          <SplitPartRow
            key={index}
            part={part}
            index={index}
            canRemove={parts.length > 1}
            categories={categories}
            budgets={budgets}
            currency={currency}
            disabled={loading}
            onRemove={() => handleRemovePart(index)}
            onChange={(field, value) => handlePartChange(index, field, value)}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={handleAddPart}
        disabled={loading}
        data-qa="btn-add-split-part"
      >
        <Plus className="h-4 w-4" />
        Add another split
      </Button>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" data-qa="split-error">{error}</p>
      )}

      <Separator />

      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 gap-2"
          data-qa="btn-split-submit"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Scissors className="h-4 w-4" />
          )}
          Split
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={loading} data-qa="btn-split-cancel">
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface SplitPartRowProps {
  part: SplitPart;
  index: number;
  canRemove: boolean;
  categories: Array<{
    id: number;
    name: string;
    fullPath: string;
    parentName?: string | null;
    transactionCount?: number;
  }>;
  budgets: Array<{
    id: number;
    name: string;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  currency: string;
  disabled: boolean;
  onRemove: () => void;
  onChange: (field: keyof SplitPart, value: string | number | null) => void;
}

function SplitPartRow({
  part,
  index,
  canRemove,
  categories,
  budgets,
  currency,
  disabled,
  onRemove,
  onChange,
}: SplitPartRowProps) {
  return (
    <div className="rounded-lg border p-3 space-y-3" data-qa={`split-part-${index}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Part {index + 1}
        </span>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onRemove}
            disabled={disabled}
            data-qa={`btn-remove-split-part-${index}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`split-amount-${index}`} className="text-xs">
            Amount ({currency})
          </Label>
          <Input
            id={`split-amount-${index}`}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={part.amount}
            onChange={(event) => onChange("amount", event.target.value)}
            className="tabular-nums"
            disabled={disabled}
            data-qa={`input-split-amount-${index}`}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`split-description-${index}`} className="text-xs">
            Description
          </Label>
          <Input
            id={`split-description-${index}`}
            placeholder="What is this part for?"
            value={part.description}
            onChange={(event) => onChange("description", event.target.value)}
            disabled={disabled}
            data-qa={`input-split-description-${index}`}
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs">Category</Label>
          <CategoryCombobox
            categories={categories}
            value={part.categoryId}
            onValueChange={(categoryId) => onChange("categoryId", categoryId)}
            allowNone
            disabled={disabled}
            triggerClassName="w-full"
            data-qa={`select-split-category-${index}`}
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs">Budget</Label>
          <BudgetCombobox
            budgets={budgets}
            value={part.budgetId}
            onValueChange={(budgetId) => onChange("budgetId", budgetId)}
            allowNone
            disabled={disabled}
            triggerClassName="w-full"
            data-qa={`select-split-budget-${index}`}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`split-notes-${index}`} className="text-xs">
            Notes
          </Label>
          <Input
            id={`split-notes-${index}`}
            placeholder="Optional notes"
            value={part.notes}
            onChange={(event) => onChange("notes", event.target.value)}
            disabled={disabled}
            data-qa={`input-split-notes-${index}`}
          />
        </div>
      </div>
    </div>
  );
}
