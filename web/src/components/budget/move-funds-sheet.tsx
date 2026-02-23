"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BudgetCombobox } from "@/components/budget/budget-combobox";
import {
  CreateAllocationDocument,
  MoveFundsDocument,
  type BudgetSummary,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";
import {
  updateMonthlyOverviewCache,
  updateMonthlyOverviewCacheForMoveFunds,
} from "@/lib/cache-utils";
import { formatCurrency } from "@/lib/format";

interface MoveFundsSheetProps {
  onClose: () => void;
  budgetSummaries: BudgetSummary[];
  initialSourceBudgetId?: number;
}

export function MoveFundsSheet({
  onClose,
  budgetSummaries,
  initialSourceBudgetId,
}: MoveFundsSheetProps) {
  const { month } = useMonth();
  const [sourceBudgetId, setSourceBudgetId] = useState<number | null>(
    initialSourceBudgetId ?? null,
  );
  const [destBudgetId, setDestBudgetId] = useState<number | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [moveFunds, { loading: moveFundsLoading }] = useMutation(MoveFundsDocument);
  const [createAllocation, { loading: createAllocationLoading }] = useMutation(CreateAllocationDocument);
  const loading = moveFundsLoading || createAllocationLoading;

  const isUnallocateMode = destBudgetId === null;

  const budgets = useMemo(
    () => budgetSummaries.map((summary) => ({ id: summary.budgetId, name: summary.name })),
    [budgetSummaries],
  );

  const balanceMap = useMemo(
    () => new Map(budgetSummaries.map((summary) => [summary.budgetId, summary.available])),
    [budgetSummaries],
  );

  const sourceBudget = budgetSummaries.find(
    (budget) => budget.budgetId === sourceBudgetId,
  );
  const destBudget = budgetSummaries.find(
    (budget) => budget.budgetId === destBudgetId,
  );

  const parsedAmount = Number.parseFloat(amount);
  const isValidAmount = !Number.isNaN(parsedAmount) && parsedAmount > 0;
  const canSubmit =
    sourceBudgetId !== null &&
    isValidAmount &&
    !loading &&
    (destBudgetId === null || destBudgetId !== sourceBudgetId);

  const handleSubmit = async () => {
    if (!canSubmit || sourceBudgetId === null) return;

    setError("");

    try {
      if (destBudgetId !== null) {
        await moveFunds({
          variables: {
            input: {
              sourceBudgetId,
              destBudgetId,
              amount: parsedAmount,
              currency: "UAH",
              period: month,
            },
          },
          update: (cache) => {
            updateMonthlyOverviewCacheForMoveFunds(
              cache,
              month,
              sourceBudgetId,
              destBudgetId,
              parsedAmount,
            );
          },
        });
      } else {
        await createAllocation({
          variables: {
            input: {
              budgetId: sourceBudgetId,
              amount: -parsedAmount,
              currency: "UAH",
              period: month,
            },
          },
          update: (cache) => {
            updateMonthlyOverviewCache(cache, month, sourceBudgetId, -parsedAmount);
          },
        });
      }
      onClose();
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : isUnallocateMode ? "Failed to unallocate funds" : "Failed to move funds";
      setError(message);
    }
  };

  return (
    <Sheet open onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-md" data-qa="sheet-move-funds">
        <SheetHeader>
          <SheetTitle>{isUnallocateMode ? "Unallocate Funds" : "Move Funds"}</SheetTitle>
          <SheetDescription>
            {isUnallocateMode
              ? "Return money from a budget envelope back to Ready to Assign."
              : "Transfer money between budget envelopes. Ready to Assign stays unchanged."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="source-budget">From</Label>
              <BudgetCombobox
                budgets={budgets}
                value={sourceBudgetId}
                onValueChange={setSourceBudgetId}
                disabledIds={destBudgetId !== null ? [destBudgetId] : undefined}
                placeholder="Select source budget"
                showBalance
                balanceMap={balanceMap}
                data-qa="select-source-budget"
              />
              {sourceBudget && (
                <p className="text-xs text-muted-foreground" data-qa="text-available-balance">
                  Available: {formatCurrency(sourceBudget.available)}
                </p>
              )}
            </div>

            <div className="flex justify-center">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="dest-budget">To</Label>
              <BudgetCombobox
                budgets={budgets}
                value={destBudgetId}
                onValueChange={setDestBudgetId}
                disabledIds={sourceBudgetId !== null ? [sourceBudgetId] : undefined}
                placeholder="Select destination budget"
                showBalance
                balanceMap={balanceMap}
                data-qa="select-dest-budget"
              />
              {destBudget ? (
                <p className="text-xs text-muted-foreground">
                  Available: {formatCurrency(destBudget.available)}
                </p>
              ) : sourceBudgetId !== null ? (
                <p className="text-xs text-muted-foreground">
                  Leave empty to return funds to Ready to Assign
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="amount">Amount (UAH)</Label>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSubmit) {
                    handleSubmit();
                  }
                }}
                className="tabular-nums"
                data-qa="input-transfer-amount"
              />
              {sourceBudget && isValidAmount && parsedAmount > sourceBudget.available && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  This exceeds the source budget&apos;s available balance.
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={loading} data-qa="btn-move-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-qa="btn-move-submit">
            {loading
              ? (isUnallocateMode ? "Unallocating..." : "Moving...")
              : (isUnallocateMode ? "Unallocate" : "Move Funds")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
