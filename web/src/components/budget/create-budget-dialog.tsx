"use client";

import { useState } from "react";
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
  CreateBudgetDocument,
  GetMonthlyOverviewDocument,
  BudgetType,
  TargetCadence,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";

interface CreateBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BUDGET_TYPE_OPTIONS = [
  {
    value: BudgetType.Spending,
    label: "Spending",
    description: "Monthly budget. Positive balance resets, negative carries forward.",
  },
  {
    value: BudgetType.Savings,
    label: "Savings",
    description: "Monthly contribution. Everything accumulates over time.",
  },
  {
    value: BudgetType.Goal,
    label: "Goal",
    description: "Save toward a total amount by a target date.",
  },
  {
    value: BudgetType.Periodic,
    label: "Periodic",
    description: "Save toward a recurring bill on a cadence.",
  },
];

const CADENCE_OPTIONS = [
  { value: TargetCadence.Monthly, label: "Monthly" },
  { value: TargetCadence.Yearly, label: "Yearly" },
  { value: TargetCadence.Custom, label: "Custom" },
];

export function CreateBudgetDialog({
  open,
  onOpenChange,
}: CreateBudgetDialogProps) {
  const { month } = useMonth();

  const [name, setName] = useState("");
  const [budgetType, setBudgetType] = useState<BudgetType>(BudgetType.Spending);
  const [targetAmount, setTargetAmount] = useState("");
  const [targetCadence, setTargetCadence] = useState<TargetCadence | "">("");
  const [targetCadenceMonths, setTargetCadenceMonths] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");

  const [createBudget, { loading }] = useMutation(CreateBudgetDocument, {
    refetchQueries: [
      { query: GetMonthlyOverviewDocument, variables: { month } },
    ],
  });

  const parsedTargetAmount = Number.parseFloat(targetAmount);
  const isValidTargetAmount =
    !Number.isNaN(parsedTargetAmount) && parsedTargetAmount >= 0;

  const needsCadence =
    budgetType === BudgetType.Periodic || budgetType === BudgetType.Savings;
  const needsTargetDate = budgetType === BudgetType.Goal;
  const needsCustomMonths =
    targetCadence === TargetCadence.Custom && needsCadence;

  const canSubmit =
    name.trim() !== "" &&
    isValidTargetAmount &&
    (!needsCadence || targetCadence !== "") &&
    (!needsTargetDate || targetDate !== "") &&
    (!needsCustomMonths || Number.parseInt(targetCadenceMonths, 10) > 0) &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

    try {
      await createBudget({
        variables: {
          input: {
            name: name.trim(),
            type: budgetType,
            currency: "UAH",
            targetAmount: parsedTargetAmount,
            ...(needsCadence && targetCadence !== ""
              ? { targetCadence }
              : {}),
            ...(needsCustomMonths
              ? { targetCadenceMonths: Number.parseInt(targetCadenceMonths, 10) }
              : {}),
            ...(needsTargetDate && targetDate !== ""
              ? { targetDate }
              : {}),
          },
        },
      });
      handleClose();
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to create budget";
      setError(message);
    }
  };

  const handleClose = () => {
    setName("");
    setBudgetType(BudgetType.Spending);
    setTargetAmount("");
    setTargetCadence("");
    setTargetCadenceMonths("");
    setTargetDate("");
    setError("");
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleClose();
    } else {
      onOpenChange(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-qa="dialog-create-budget">
        <DialogHeader>
          <DialogTitle>Create Budget</DialogTitle>
          <DialogDescription>
            Add a new budget envelope to track your spending or savings.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
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
              data-qa="input-budget-name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="budget-type">Type</Label>
            <Select
              value={budgetType}
              onValueChange={(value) => {
                setBudgetType(value as BudgetType);
                if (
                  value !== BudgetType.Periodic &&
                  value !== BudgetType.Savings
                ) {
                  setTargetCadence("");
                  setTargetCadenceMonths("");
                }
                if (value !== BudgetType.Goal) {
                  setTargetDate("");
                }
              }}
            >
              <SelectTrigger id="budget-type" className="w-full" data-qa="select-budget-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {BUDGET_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {BUDGET_TYPE_OPTIONS.find((opt) => opt.value === budgetType)
                ?.description}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="target-amount">Target Amount (UAH)</Label>
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
            <p className="text-xs text-muted-foreground">
              {budgetType === BudgetType.Spending
                ? "Maximum amount to spend per period"
                : budgetType === BudgetType.Savings
                  ? "Amount to save per period"
                  : budgetType === BudgetType.Goal
                    ? "Total amount to save"
                    : "Amount needed per cadence"}
            </p>
          </div>

          {needsCadence && (
            <div className="grid gap-2">
              <Label htmlFor="cadence">Cadence</Label>
              <Select
                value={targetCadence}
                onValueChange={(value) => {
                  setTargetCadence(value as TargetCadence);
                  if (value !== TargetCadence.Custom) {
                    setTargetCadenceMonths("");
                  }
                }}
              >
                <SelectTrigger id="cadence" className="w-full">
                  <SelectValue placeholder="Select cadence" />
                </SelectTrigger>
                <SelectContent>
                  {CADENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needsCustomMonths && (
            <div className="grid gap-2">
              <Label htmlFor="cadence-months">Every X Months</Label>
              <Input
                id="cadence-months"
                type="number"
                min="1"
                step="1"
                placeholder="e.g., 3 for quarterly"
                value={targetCadenceMonths}
                onChange={(event) => setTargetCadenceMonths(event.target.value)}
                className="tabular-nums"
              />
            </div>
          )}

          {needsTargetDate && (
            <div className="grid gap-2">
              <Label htmlFor="target-date">Target Date</Label>
              <Input
                id="target-date"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                When you want to reach your goal
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading} data-qa="btn-create-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-qa="btn-create-submit">
            {loading ? "Creating..." : "Create Budget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
