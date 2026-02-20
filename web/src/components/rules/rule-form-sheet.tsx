"use client";

import { useState } from "react";
import type { DocumentNode } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

interface RuleFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  ruleType: string;
  mutationDocument: DocumentNode;
  refetchDocument: DocumentNode;
  initialValues?: {
    id: number;
    rule: string;
    priority: number;
  };
}

export function RuleFormSheet({
  open,
  onOpenChange,
  mode,
  ruleType,
  mutationDocument,
  refetchDocument,
  initialValues,
}: RuleFormSheetProps) {
  const [ruleText, setRuleText] = useState(
    () => initialValues?.rule ?? "",
  );
  const [priority, setPriority] = useState(
    () => initialValues?.priority ?? 0,
  );
  const [error, setError] = useState("");

  const [mutate, { loading }] = useMutation(mutationDocument, {
    refetchQueries: [{ query: refetchDocument }],
  });

  const canSubmit = ruleText.trim().length > 0;

  const handleClose = (openState: boolean) => {
    if (!openState) {
      setRuleText(initialValues?.rule ?? "");
      setPriority(initialValues?.priority ?? 0);
      setError("");
    }
    onOpenChange(openState);
  };

  const handleSubmit = async () => {
    setError("");
    try {
      if (mode === "create") {
        await mutate({
          variables: {
            input: { rule: ruleText.trim(), priority },
          },
        });
      } else if (initialValues) {
        await mutate({
          variables: {
            input: {
              id: initialValues.id,
              rule: ruleText.trim(),
              priority,
            },
          },
        });
      }
      onOpenChange(false);
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : `Failed to ${mode} rule`;
      setError(message);
    }
  };

  const title =
    mode === "create"
      ? `Add ${ruleType} Rule`
      : `Edit ${ruleType} Rule`;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent data-qa={`sheet-${mode}-rule`}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {mode === "create"
              ? `Add a new instruction for the AI when assigning ${ruleType.toLowerCase()}s to transactions.`
              : "Update the rule instruction and priority."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 py-6">
          <div className="space-y-2">
            <Label htmlFor="rule-text">Rule instruction</Label>
            <Textarea
              id="rule-text"
              placeholder={`e.g., Assign all "Bolt" transactions to ${ruleType === "Categorization" ? "Transport > Taxi" : "Transport budget"}`}
              value={ruleText}
              onChange={(event) => setRuleText(event.target.value)}
              rows={4}
              data-qa="input-rule-text"
            />
            <p className="text-xs text-muted-foreground">
              Free-form text instruction the AI follows when processing
              transactions.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-priority">Priority</Label>
            <Input
              id="rule-priority"
              type="number"
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
              data-qa="input-rule-priority"
            />
            <p className="text-xs text-muted-foreground">
              Higher priority rules are applied first. Default is 0.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={loading}
            data-qa="btn-rule-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            data-qa="btn-rule-submit"
          >
            {loading
              ? mode === "create"
                ? "Creating..."
                : "Saving..."
              : mode === "create"
                ? "Create Rule"
                : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
