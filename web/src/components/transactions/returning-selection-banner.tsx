"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

interface ReturningSelectionBannerProps {
  returningAmount: number;
  currency: string;
  onCancel: () => void;
}

export function ReturningSelectionBanner({
  returningAmount,
  currency,
  onCancel,
}: ReturningSelectionBannerProps) {
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950"
      data-qa="returning-selection-banner"
    >
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        Select the original expense transaction that this return of{" "}
        {formatCurrency(returningAmount)} {currency} is for
      </p>
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
  );
}
