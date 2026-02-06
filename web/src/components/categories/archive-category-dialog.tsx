"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client";
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
  ArchiveCategoryDocument,
  GetCategoriesDocument,
} from "@/graphql/generated/graphql";

interface ArchiveCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: {
    id: number;
    name: string;
    fullPath: string;
  };
}

export function ArchiveCategoryDialog({
  open,
  onOpenChange,
  category,
}: ArchiveCategoryDialogProps) {
  const [error, setError] = useState("");

  const [archiveCategory, { loading }] = useMutation(ArchiveCategoryDocument, {
    refetchQueries: [
      { query: GetCategoriesDocument, variables: { activeOnly: true } },
      { query: GetCategoriesDocument, variables: { activeOnly: false } },
    ],
  });

  const handleArchive = async () => {
    setError("");

    try {
      await archiveCategory({
        variables: { id: category.id },
      });
      onOpenChange(false);
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to archive category";
      setError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Archive Category</DialogTitle>
          <DialogDescription>
            Are you sure you want to archive &quot;{category.fullPath}&quot;?
            This category will be hidden from active lists.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Archived categories won&apos;t appear in category selectors or be
            available for new transactions. Existing transactions with this
            category will retain their classification.
          </p>

          {error && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleArchive} disabled={loading}>
            {loading ? "Archiving..." : "Archive Category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
