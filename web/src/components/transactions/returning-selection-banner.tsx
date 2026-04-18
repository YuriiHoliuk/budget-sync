"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

export type ReturningSelectionDirection = "pick-debit" | "pick-credit";

interface ReturningSelectionBannerProps {
  direction: ReturningSelectionDirection;
  anchorAmount: number;
  currency: string;
  selectedCount: number;
  selectedTotal: number;
  onDone: () => void;
  onCancel: () => void;
}

export function ReturningSelectionBanner({
  direction,
  anchorAmount,
  currency,
  selectedCount,
  selectedTotal,
  onDone,
  onCancel,
}: ReturningSelectionBannerProps) {
  const baseMessage =
    direction === "pick-debit"
      ? `Select expenses covered by this refund of ${formatCurrency(anchorAmount)} ${currency}`
      : `Select income entries that compensated this expense of ${formatCurrency(anchorAmount)} ${currency}`;

  const canFinish = selectedCount > 0;

  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950"
      data-qa="returning-selection-banner"
      data-qa-direction={direction}
    >
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          {baseMessage}
        </p>
        {selectedCount > 0 && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {selectedCount} selected · total {formatCurrency(selectedTotal)}{" "}
            {currency}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onDone}
          disabled={!canFinish}
          data-qa="btn-returning-done"
        >
          <Check className="mr-1 h-4 w-4" />
          Done
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          data-qa="btn-cancel-returning-selection"
        >
          <X className="mr-1 h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
