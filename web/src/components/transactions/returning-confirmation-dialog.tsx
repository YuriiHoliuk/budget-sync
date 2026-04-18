"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";

export type ReturningOutcome =
  | "full_cancel"
  | "debit_reduced"
  | "credit_reduced";

interface ReturningConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditAmount: number;
  debitAmount: number;
  currency: string;
  loading: boolean;
  onConfirm: () => void;
}

export function classifyReturningOutcome(
  creditAmount: number,
  debitAmount: number,
): ReturningOutcome {
  if (creditAmount === debitAmount) return "full_cancel";
  if (creditAmount < debitAmount) return "debit_reduced";
  return "credit_reduced";
}

export function ReturningConfirmationDialog({
  open,
  onOpenChange,
  creditAmount,
  debitAmount,
  currency,
  loading,
  onConfirm,
}: ReturningConfirmationDialogProps) {
  const outcome = classifyReturningOutcome(creditAmount, debitAmount);

  const title =
    outcome === "full_cancel"
      ? "Confirm Full Return"
      : "Confirm Partial Return";
  const description =
    outcome === "full_cancel"
      ? "Both transactions will be removed."
      : outcome === "debit_reduced"
        ? "The income will be removed; the expense will be reduced."
        : "The expense will be removed; the income will be reduced.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[420px]"
        data-qa="dialog-returning-confirmation"
        data-qa-outcome={outcome}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-4 text-sm text-muted-foreground">
          {outcome === "full_cancel" && (
            <p>
              The refund ({formatCurrency(creditAmount)} {currency}) and the
              expense ({formatCurrency(debitAmount)} {currency}) will both be
              removed from budget calculations.
            </p>
          )}
          {outcome === "debit_reduced" && (
            <p>
              The expense will be reduced from{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(debitAmount)} {currency}
              </span>{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(debitAmount - creditAmount)} {currency}
              </span>
              . The income of {formatCurrency(creditAmount)} {currency} will be
              removed.
            </p>
          )}
          {outcome === "credit_reduced" && (
            <p>
              The income will be reduced from{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(creditAmount)} {currency}
              </span>{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(creditAmount - debitAmount)} {currency}
              </span>
              . The expense of {formatCurrency(debitAmount)} {currency} will be
              removed.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            data-qa="btn-returning-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            data-qa="btn-returning-confirm"
          >
            {loading ? "Processing..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
