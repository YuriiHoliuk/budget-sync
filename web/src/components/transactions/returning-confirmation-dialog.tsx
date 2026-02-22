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

interface ReturningConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returningAmount: number;
  originalAmount: number;
  currency: string;
  loading: boolean;
  onConfirm: () => void;
}

export function ReturningConfirmationDialog({
  open,
  onOpenChange,
  returningAmount,
  originalAmount,
  currency,
  loading,
  onConfirm,
}: ReturningConfirmationDialogProps) {
  const isFullReturn = returningAmount === originalAmount;
  const reducedAmount = originalAmount - returningAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[400px]"
        data-qa="dialog-returning-confirmation"
      >
        <DialogHeader>
          <DialogTitle>Confirm Return</DialogTitle>
          <DialogDescription>
            {isFullReturn
              ? "This is a full return of the original transaction."
              : "This is a partial return of the original transaction."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isFullReturn ? (
            <p className="text-sm text-muted-foreground">
              Both the return ({formatCurrency(returningAmount)} {currency}) and
              the original expense ({formatCurrency(originalAmount)} {currency})
              will be removed from budget calculations.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              The original expense will be reduced from{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(originalAmount)} {currency}
              </span>{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(reducedAmount)} {currency}
              </span>
              .
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
            {loading ? "Processing..." : "Confirm Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
