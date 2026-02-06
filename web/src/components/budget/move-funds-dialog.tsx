"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MoveFundsDocument,
  type BudgetSummary,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";
import { updateMonthlyOverviewCacheForMoveFunds } from "@/lib/cache-utils";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  const [sourceBudgetId, setSourceBudgetId] = useState<string>(
    initialSourceBudgetId?.toString() ?? "",
  );
  const [destBudgetId, setDestBudgetId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [moveFunds, { loading }] = useMutation(MoveFundsDocument);

  const sourceBudget = budgetSummaries.find(
    (budget) => budget.budgetId.toString() === sourceBudgetId,
  );
  const destBudget = budgetSummaries.find(
    (budget) => budget.budgetId.toString() === destBudgetId,
  );

  const parsedAmount = Number.parseFloat(amount);
  const isValidAmount = !Number.isNaN(parsedAmount) && parsedAmount > 0;
  const canSubmit =
    sourceBudgetId !== "" &&
    destBudgetId !== "" &&
    sourceBudgetId !== destBudgetId &&
    isValidAmount &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

    const srcId = Number.parseInt(sourceBudgetId, 10);
    const dstId = Number.parseInt(destBudgetId, 10);

    try {
      await moveFunds({
        variables: {
          input: {
            sourceBudgetId: srcId,
            destBudgetId: dstId,
            amount: parsedAmount,
            currency: "UAH",
            period: month,
          },
        },
        update: (cache) => {
          updateMonthlyOverviewCacheForMoveFunds(
            cache,
            month,
            srcId,
            dstId,
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
    setSourceBudgetId(initialSourceBudgetId?.toString() ?? "");
    setDestBudgetId("");
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
      <DialogContent className="sm:max-w-[425px]">
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
            <Select value={sourceBudgetId} onValueChange={setSourceBudgetId}>
              <SelectTrigger id="source-budget">
                <SelectValue placeholder="Select source budget" />
              </SelectTrigger>
              <SelectContent>
                {budgetSummaries.map((budget) => (
                  <SelectItem
                    key={budget.budgetId}
                    value={budget.budgetId.toString()}
                    disabled={budget.budgetId.toString() === destBudgetId}
                  >
                    <span className="flex items-center justify-between gap-4">
                      <span>{budget.name}</span>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          budget.available < 0
                            ? "text-red-500"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatCurrency(budget.available)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sourceBudget && (
              <p className="text-xs text-muted-foreground">
                Available: {formatCurrency(sourceBudget.available)}
              </p>
            )}
          </div>

          <div className="flex justify-center">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="dest-budget">To</Label>
            <Select value={destBudgetId} onValueChange={setDestBudgetId}>
              <SelectTrigger id="dest-budget">
                <SelectValue placeholder="Select destination budget" />
              </SelectTrigger>
              <SelectContent>
                {budgetSummaries.map((budget) => (
                  <SelectItem
                    key={budget.budgetId}
                    value={budget.budgetId.toString()}
                    disabled={budget.budgetId.toString() === sourceBudgetId}
                  >
                    <span className="flex items-center justify-between gap-4">
                      <span>{budget.name}</span>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          budget.available < 0
                            ? "text-red-500"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatCurrency(budget.available)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSubmit) {
                  handleSubmit();
                }
              }}
              className="tabular-nums"
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
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {loading ? "Moving..." : "Move Funds"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
