"use client";

import { useState } from "react";
import type { DocumentNode } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: { id: number; rule: string };
  deleteMutationDocument: DocumentNode;
  refetchDocument: DocumentNode;
  ruleType: string;
}

export function DeleteRuleDialog({
  open,
  onOpenChange,
  rule,
  deleteMutationDocument,
  refetchDocument,
  ruleType,
}: DeleteRuleDialogProps) {
  const [error, setError] = useState("");

  const [deleteRule, { loading }] = useMutation(deleteMutationDocument, {
    refetchQueries: [{ query: refetchDocument }],
  });

  const handleDelete = async () => {
    setError("");
    try {
      await deleteRule({ variables: { id: rule.id } });
      onOpenChange(false);
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to delete rule";
      setError(message);
    }
  };

  const truncatedText =
    rule.rule.length > 80 ? `${rule.rule.slice(0, 80)}...` : rule.rule;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[400px]"
        data-qa="dialog-delete-rule"
      >
        <DialogHeader>
          <DialogTitle>Delete {ruleType} Rule</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this rule?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="rounded-md bg-muted p-3 text-sm">{truncatedText}</p>

          <p className="mt-3 text-sm text-muted-foreground">
            This action cannot be undone. The AI will no longer follow this rule
            when processing transactions.
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
            data-qa="btn-delete-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
            data-qa="btn-delete-confirm"
          >
            {loading ? "Deleting..." : "Delete Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
