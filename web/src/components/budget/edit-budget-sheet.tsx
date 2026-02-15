"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  UpdateBudgetDocument,
  GetMonthlyOverviewDocument,
  CadenceUnit,
  type Budget,
  type BudgetGroup,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";

type BudgetData = Pick<
  Budget,
  | "id"
  | "name"
  | "currency"
  | "targetAmount"
  | "cadenceUnit"
  | "cadenceCount"
  | "targetDate"
  | "startDate"
  | "endDate"
  | "cap"
  | "budgetGroupId"
>;

interface EditBudgetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: BudgetData;
  budgetGroups: BudgetGroup[];
}

function formatCadence(
  cadenceUnit: CadenceUnit | null | undefined,
  cadenceCount: number | null | undefined,
): string {
  if (!cadenceUnit || !cadenceCount) {
    return "None (simple target)";
  }

  const unitLabels: Record<CadenceUnit, string> = {
    [CadenceUnit.Day]: "day",
    [CadenceUnit.Week]: "week",
    [CadenceUnit.Month]: "month",
    [CadenceUnit.Year]: "year",
  };

  const unitLabel = unitLabels[cadenceUnit];
  const plural = cadenceCount > 1 ? "s" : "";

  return `Every ${cadenceCount} ${unitLabel}${plural}`;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return "None";
  }
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMonthDisplay(month: string): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(Number(year), Number(monthNum) - 1);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

function getFirstDayOfPreviousMonth(month: string): string {
  const date = new Date(`${month}-01`);
  date.setMonth(date.getMonth() - 1);
  const year = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${m}-01`;
}

function getPreviousMonthDisplay(month: string): string {
  const date = new Date(`${month}-01`);
  date.setMonth(date.getMonth() - 1);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

const NONE_GROUP_VALUE = "__none__";

function EditBudgetSheetContent({
  budget,
  onOpenChange,
  budgetGroups,
}: {
  budget: BudgetData;
  onOpenChange: (open: boolean) => void;
  budgetGroups: BudgetGroup[];
}) {
  const { month } = useMonth();

  const [name, setName] = useState(budget.name);
  const [targetAmount, setTargetAmount] = useState(
    budget.targetAmount.toString(),
  );
  const [endDate, setEndDate] = useState(budget.endDate ?? "");
  const [cap, setCap] = useState(budget.cap?.toString() ?? "");
  const [budgetGroupId, setBudgetGroupId] = useState<string>(
    budget.budgetGroupId ? budget.budgetGroupId.toString() : NONE_GROUP_VALUE,
  );
  const [error, setError] = useState("");

  const [updateBudget, { loading }] = useMutation(UpdateBudgetDocument, {
    refetchQueries: [
      { query: GetMonthlyOverviewDocument, variables: { month } },
    ],
  });

  const parsedTargetAmount = Number.parseFloat(targetAmount);
  const isValidTargetAmount =
    !Number.isNaN(parsedTargetAmount) && parsedTargetAmount >= 0;

  const targetAmountChanged =
    isValidTargetAmount && parsedTargetAmount !== budget.targetAmount;

  const canSubmit = name.trim() !== "" && isValidTargetAmount && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

    try {
      await updateBudget({
        variables: {
          input: {
            id: budget.id,
            month,
            name: name.trim(),
            targetAmount: parsedTargetAmount,
            ...(cap !== "" ? { cap: Number.parseFloat(cap) } : { cap: null }),
            endDate: endDate !== "" ? endDate : null,
            budgetGroupId:
              budgetGroupId !== NONE_GROUP_VALUE
                ? Number.parseInt(budgetGroupId, 10)
                : null,
          },
        },
      });
      onOpenChange(false);
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update budget";
      setError(message);
    }
  };

  const minEndDate = getFirstDayOfPreviousMonth(month);

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit Budget</SheetTitle>
        <SheetDescription>
          Update the budget settings. Some fields are read-only after creation.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4">
        <div className="grid gap-4">
          {/* Read-only fields section */}
          <div className="rounded-md border bg-muted/30 p-3" data-qa="readonly-settings">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Read-only settings
            </p>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currency:</span>
                <span className="font-medium">{budget.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cadence:</span>
                <span className="font-medium">
                  {formatCadence(budget.cadenceUnit, budget.cadenceCount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start Date:</span>
                <span className="font-medium">
                  {formatDate(budget.startDate)}
                </span>
              </div>
              {budget.targetDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Date:</span>
                  <span className="font-medium">
                    {formatDate(budget.targetDate)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Editable fields */}
          {budgetGroups.length > 0 && (
            <div className="grid gap-2">
              <Label>Group</Label>
              <Select
                value={budgetGroupId}
                onValueChange={setBudgetGroupId}
              >
                <SelectTrigger className="w-full" data-qa="select-budget-group">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_GROUP_VALUE}>None</SelectItem>
                  {budgetGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="budget-name">Name</Label>
            <Input
              id="budget-name"
              placeholder="e.g., Groceries, Rent, Vacation Fund"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSubmit) {
                  handleSubmit();
                }
              }}
              data-qa="input-name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="target-amount">Target Amount ({budget.currency})</Label>
            <Input
              id="target-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={targetAmount}
              onChange={(event) => setTargetAmount(event.target.value)}
              className="tabular-nums"
              data-qa="input-target-amount"
            />
            {targetAmountChanged && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                New target takes effect from {formatMonthDisplay(month)}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cap">Maximum Balance / Cap (optional)</Label>
            <Input
              id="cap"
              type="number"
              min="0"
              step="0.01"
              placeholder="Optional"
              value={cap}
              onChange={(event) => setCap(event.target.value)}
              className="tabular-nums"
              data-qa="input-cap"
            />
            <p className="text-xs text-muted-foreground">
              Stop suggesting allocations when balance reaches this amount
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="end-date">End Date (optional)</Label>
            <Input
              id="end-date"
              type="date"
              min={minEndDate}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              data-qa="input-end-date"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for recurring budgets. Cannot be set earlier than{" "}
              {getPreviousMonthDisplay(month)}.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </div>

      <SheetFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit} data-qa="btn-save">
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </SheetFooter>
    </>
  );
}

export function EditBudgetSheet({
  open,
  onOpenChange,
  budget,
  budgetGroups,
}: EditBudgetSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md" data-qa="sheet-edit-budget">
        <EditBudgetSheetContent
          key={budget.id}
          budget={budget}
          onOpenChange={onOpenChange}
          budgetGroups={budgetGroups}
        />
      </SheetContent>
    </Sheet>
  );
}
