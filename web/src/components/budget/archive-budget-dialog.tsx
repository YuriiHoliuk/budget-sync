"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArchiveBudgetDocument,
  GetMonthlyOverviewDocument,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";

interface ArchiveBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: {
    id: number;
    name: string;
  };
}

export function ArchiveBudgetDialog({
  open,
  onOpenChange,
  budget,
}: ArchiveBudgetDialogProps) {
  const { month } = useMonth();
  const [error, setError] = useState("");

  const [archiveBudget, { loading }] = useMutation(ArchiveBudgetDocument, {
    refetchQueries: [
      { query: GetMonthlyOverviewDocument, variables: { month } },
    ],
  });

  const handleArchive = async () => {
    setError("");

    try {
      await archiveBudget({
        variables: {
          id: budget.id,
        },
      });
      onOpenChange(false);
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to archive budget";
      setError(message);
    }
  };

  const handleClose = () => {
    setError("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Archive Budget
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to archive &quot;{budget.name}&quot;?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Archived budgets will be hidden from the budget list but their
            historical data will be preserved. You can unarchive them later if
            needed.
          </p>

          {error && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleArchive}
            disabled={loading}
          >
            {loading ? "Archiving..." : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
