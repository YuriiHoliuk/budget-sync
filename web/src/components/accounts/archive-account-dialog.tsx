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
  ArchiveAccountDocument,
  GetAccountsDocument,
} from "@/graphql/generated/graphql";

interface ArchiveAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: {
    id: number;
    name: string;
  };
}

export function ArchiveAccountDialog({
  open,
  onOpenChange,
  account,
}: ArchiveAccountDialogProps) {
  const [error, setError] = useState("");

  const [archiveAccount, { loading }] = useMutation(ArchiveAccountDocument, {
    refetchQueries: [{ query: GetAccountsDocument, variables: { activeOnly: true } }],
  });

  const handleArchive = async () => {
    setError("");

    try {
      await archiveAccount({
        variables: { id: account.id },
      });
      onOpenChange(false);
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to archive account";
      setError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Archive Account</DialogTitle>
          <DialogDescription>
            Are you sure you want to archive &quot;{account.name}&quot;? This account
            will be hidden from the main view but can be restored later.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Archived accounts won&apos;t appear in your account list or be included in
            balance calculations. Transactions associated with this account will be
            preserved.
          </p>

          {error && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
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
          <Button
            variant="destructive"
            onClick={handleArchive}
            disabled={loading}
          >
            {loading ? "Archiving..." : "Archive Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
