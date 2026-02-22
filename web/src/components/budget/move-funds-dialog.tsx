"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BudgetCombobox } from "@/components/budget/budget-combobox";
import {
  MoveFundsDocument,
  type BudgetSummary,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";
import { updateMonthlyOverviewCacheForMoveFunds } from "@/lib/cache-utils";
import { formatCurrency } from "@/lib/format";

interface MoveFundsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetSummaries: BudgetSummary[];
  initialSourceBudgetId?: number;
}

export function MoveFundsDialog({
  open,
  onOpenChange,
  budgetSummaries,
  initialSourceBudgetId,
}: MoveFundsDialogProps) {
  const { month } = useMonth();
  const [sourceBudgetId, setSourceBudgetId] = useState<number | null>(
    initialSourceBudgetId ?? null,
  );
  const [destBudgetId, setDestBudgetId] = useState<number | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [moveFunds, { loading }] = useMutation(MoveFundsDocument);

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
    destBudgetId !== null &&
    sourceBudgetId !== destBudgetId &&
    isValidAmount &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit || sourceBudgetId === null || destBudgetId === null) return;

    setError("");

    try {
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
      handleClose();
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to move funds";
      setError(message);
    }
  };

  const handleClose = () => {
    setSourceBudgetId(initialSourceBudgetId ?? null);
    setDestBudgetId(null);
    setAmount("");
    setError("");
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleClose();
    } else {
      onOpenChange(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-qa="dialog-move-funds">
        <DialogHeader>
          <DialogTitle>Move Funds</DialogTitle>
          <DialogDescription>
            Transfer money between budget envelopes. Ready to Assign stays
            unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
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
            {destBudget && (
              <p className="text-xs text-muted-foreground">
                Available: {formatCurrency(destBudget.available)}
              </p>
            )}
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

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading} data-qa="btn-move-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-qa="btn-move-submit">
            {loading ? "Moving..." : "Move Funds"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
