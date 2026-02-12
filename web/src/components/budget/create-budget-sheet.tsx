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
  CreateBudgetDocument,
  GetMonthlyOverviewDocument,
  CadenceUnit,
  type BudgetGroup,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";

interface CreateBudgetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetGroups: BudgetGroup[];
}

const CADENCE_UNIT_OPTIONS = [
  { value: CadenceUnit.Day, label: "Day" },
  { value: CadenceUnit.Week, label: "Week" },
  { value: CadenceUnit.Month, label: "Month" },
  { value: CadenceUnit.Year, label: "Year" },
];

const NONE_GROUP_VALUE = "__none__";

export function CreateBudgetSheet({
  open,
  onOpenChange,
  budgetGroups,
}: CreateBudgetSheetProps) {
  const { month } = useMonth();

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [cadenceUnit, setCadenceUnit] = useState<CadenceUnit | "">("");
  const [cadenceCount, setCadenceCount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [cap, setCap] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [budgetGroupId, setBudgetGroupId] = useState<string>(NONE_GROUP_VALUE);
  const [error, setError] = useState("");

  const [createBudget, { loading }] = useMutation(CreateBudgetDocument, {
    refetchQueries: [
      { query: GetMonthlyOverviewDocument, variables: { month } },
    ],
  });

  const parsedTargetAmount = Number.parseFloat(targetAmount);
  const isValidTargetAmount =
    !Number.isNaN(parsedTargetAmount) && parsedTargetAmount >= 0;

  const parsedCadenceCount = Number.parseInt(cadenceCount, 10);
  const isValidCadenceCount = !Number.isNaN(parsedCadenceCount) && parsedCadenceCount > 0;

  const hasCadence = cadenceUnit !== "" && isValidCadenceCount;

  const canSubmit =
    name.trim() !== "" &&
    isValidTargetAmount &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

    try {
      await createBudget({
        variables: {
          input: {
            name: name.trim(),
            currency: "UAH",
            targetAmount: parsedTargetAmount,
            ...(hasCadence
              ? { cadenceUnit, cadenceCount: parsedCadenceCount }
              : {}),
            ...(targetDate !== "" ? { targetDate } : {}),
            ...(cap !== "" ? { cap: Number.parseFloat(cap) } : {}),
            ...(startDate !== "" ? { startDate } : {}),
            ...(endDate !== "" ? { endDate } : {}),
            ...(budgetGroupId !== NONE_GROUP_VALUE
              ? { budgetGroupId: Number.parseInt(budgetGroupId, 10) }
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
    setTargetAmount("");
    setCadenceUnit("");
    setCadenceCount("");
    setTargetDate("");
    setCap("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    setBudgetGroupId(NONE_GROUP_VALUE);
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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-md" data-qa="sheet-create-budget">
        <SheetHeader>
          <SheetTitle>Create Budget</SheetTitle>
          <SheetDescription>
            Add a new budget envelope to track your spending or savings.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="grid gap-4">
            {budgetGroups.length > 0 && (
              <div className="grid gap-2">
                <Label>Group (optional)</Label>
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
                data-qa="input-budget-name"
              />
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
                How much per period or total goal amount
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Cadence (optional)</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Every"
                    value={cadenceCount}
                    onChange={(event) => setCadenceCount(event.target.value)}
                    className="tabular-nums"
                    data-qa="input-cadence-count"
                  />
                </div>
                <div className="flex-1">
                  <Select
                    value={cadenceUnit}
                    onValueChange={(value) => setCadenceUnit(value as CadenceUnit)}
                  >
                    <SelectTrigger className="w-full" data-qa="select-cadence-unit">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {CADENCE_UNIT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                How often the target amount recurs
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="target-date">Target Date (optional)</Label>
              <Input
                id="target-date"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                data-qa="input-target-date"
              />
              <p className="text-xs text-muted-foreground">
                When you want to reach your goal
              </p>
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
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                data-qa="input-start-date"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="end-date">End Date (optional)</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                data-qa="input-end-date"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for recurring budgets
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading} data-qa="btn-create-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-qa="btn-create-submit">
            {loading ? "Creating..." : "Create Budget"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
