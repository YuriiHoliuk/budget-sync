"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@apollo/client";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreateAllocationDocument,
  GetMonthlyOverviewDocument,
  type BudgetSummary,
  BudgetType,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InlineAllocationEditor } from "./inline-allocation-editor";
import { MoveFundsDialog } from "./move-funds-dialog";

interface BudgetTableProps {
  budgetSummaries: BudgetSummary[];
}

const BUDGET_TYPE_LABELS: Record<BudgetType, string> = {
  [BudgetType.Spending]: "Spending",
  [BudgetType.Savings]: "Savings",
  [BudgetType.Goal]: "Goals",
  [BudgetType.Periodic]: "Periodic",
};

const BUDGET_TYPE_ORDER: BudgetType[] = [
  BudgetType.Spending,
  BudgetType.Savings,
  BudgetType.Goal,
  BudgetType.Periodic,
];

function getAvailableColor(available: number): string {
  if (available < 0) return "text-red-600 dark:text-red-400";
  if (available === 0) return "text-muted-foreground";
  return "text-green-600 dark:text-green-400";
}

function getProgressPercentage(spent: number, targetAmount: number): number {
  if (targetAmount <= 0) return 0;
  return Math.min(Math.round((Math.abs(spent) / targetAmount) * 100), 100);
}

export function BudgetTable({ budgetSummaries }: BudgetTableProps) {
  const { month } = useMonth();
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);
  const [moveFundsOpen, setMoveFundsOpen] = useState(false);
  const [moveFundsSourceId, setMoveFundsSourceId] = useState<
    number | undefined
  >(undefined);

  const [createAllocation] = useMutation(CreateAllocationDocument, {
    refetchQueries: [
      { query: GetMonthlyOverviewDocument, variables: { month } },
    ],
  });

  const handleMoveFunds = (sourceBudgetId?: number) => {
    setMoveFundsSourceId(sourceBudgetId);
    setMoveFundsOpen(true);
  };

  const groupedBudgets = useMemo(() => {
    const groups = new Map<BudgetType, BudgetSummary[]>();
    for (const budgetType of BUDGET_TYPE_ORDER) {
      const budgets = budgetSummaries.filter(
        (summary) => summary.type === budgetType,
      );
      if (budgets.length > 0) {
        groups.set(budgetType, budgets);
      }
    }
    return groups;
  }, [budgetSummaries]);

  const handleAllocationSave = async (budgetId: number, amount: number) => {
    await createAllocation({
      variables: {
        input: {
          budgetId,
          amount,
          currency: "UAH",
          period: month,
        },
      },
    });
    setEditingBudgetId(null);
  };

  const handleAllocationCancel = () => {
    setEditingBudgetId(null);
  };

  if (budgetSummaries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No budgets yet. Create your first budget to start tracking spending.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleMoveFunds()}
        >
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          Move Funds
        </Button>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[200px]">Budget</TableHead>
              <TableHead className="w-[100px] text-right">Target</TableHead>
              <TableHead className="w-[140px] text-right">
                Allocated
              </TableHead>
              <TableHead className="w-[100px] text-right">Spent</TableHead>
              <TableHead className="w-[100px] text-right">
                Available
              </TableHead>
              <TableHead className="w-[120px]">Progress</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from(groupedBudgets.entries()).map(
              ([budgetType, summaries]) => (
                <BudgetGroup
                  key={budgetType}
                  type={budgetType}
                  summaries={summaries}
                  editingBudgetId={editingBudgetId}
                  onStartEdit={setEditingBudgetId}
                  onSave={handleAllocationSave}
                  onCancel={handleAllocationCancel}
                  onMoveFunds={handleMoveFunds}
                />
              ),
            )}
          </TableBody>
        </Table>
      </div>
      <MoveFundsDialog
        open={moveFundsOpen}
        onOpenChange={setMoveFundsOpen}
        budgetSummaries={budgetSummaries}
        initialSourceBudgetId={moveFundsSourceId}
      />
    </>
  );
}

interface BudgetGroupProps {
  type: BudgetType;
  summaries: BudgetSummary[];
  editingBudgetId: number | null;
  onStartEdit: (budgetId: number) => void;
  onSave: (budgetId: number, amount: number) => Promise<void>;
  onCancel: () => void;
  onMoveFunds: (sourceBudgetId: number) => void;
}

function BudgetGroup({
  type,
  summaries,
  editingBudgetId,
  onStartEdit,
  onSave,
  onCancel,
  onMoveFunds,
}: BudgetGroupProps) {
  const groupAllocated = summaries.reduce(
    (sum, summary) => sum + summary.allocated,
    0,
  );
  const groupSpent = summaries.reduce(
    (sum, summary) => sum + summary.spent,
    0,
  );
  const groupAvailable = summaries.reduce(
    (sum, summary) => sum + summary.available,
    0,
  );

  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
          {BUDGET_TYPE_LABELS[type]}
        </TableCell>
        <TableCell />
        <TableCell className="text-right text-xs font-medium text-muted-foreground">
          {formatCurrency(groupAllocated)}
        </TableCell>
        <TableCell className="text-right text-xs font-medium text-muted-foreground">
          {formatCurrency(groupSpent)}
        </TableCell>
        <TableCell
          className={cn(
            "text-right text-xs font-medium",
            getAvailableColor(groupAvailable),
          )}
        >
          {formatCurrency(groupAvailable)}
        </TableCell>
        <TableCell />
      </TableRow>
      {summaries.map((summary) => (
        <BudgetRow
          key={summary.budgetId}
          summary={summary}
          isEditing={editingBudgetId === summary.budgetId}
          onStartEdit={() => onStartEdit(summary.budgetId)}
          onSave={(amount) => onSave(summary.budgetId, amount)}
          onCancel={onCancel}
          onMoveFunds={() => onMoveFunds(summary.budgetId)}
        />
      ))}
    </>
  );
}

interface BudgetRowProps {
  summary: BudgetSummary;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (amount: number) => Promise<void>;
  onCancel: () => void;
  onMoveFunds: () => void;
}

function BudgetRow({
  summary,
  isEditing,
  onStartEdit,
  onSave,
  onCancel,
  onMoveFunds,
}: BudgetRowProps) {
  const progressPercentage = getProgressPercentage(
    summary.spent,
    summary.targetAmount,
  );

  return (
    <TableRow>
      <TableCell className="font-medium">{summary.name}</TableCell>
      <TableCell className="text-right text-muted-foreground">
        {summary.targetAmount > 0
          ? formatCurrency(summary.targetAmount)
          : "—"}
      </TableCell>
      <TableCell className="text-right">
        {isEditing ? (
          <InlineAllocationEditor
            currentAmount={summary.allocated}
            onSave={onSave}
            onCancel={onCancel}
          />
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-2 text-right tabular-nums",
              "hover:bg-muted cursor-pointer transition-colors",
              summary.allocated === 0
                ? "text-muted-foreground"
                : "font-medium",
            )}
          >
            {formatCurrency(summary.allocated)}
          </button>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {summary.spent !== 0 ? formatCurrency(summary.spent) : "—"}
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-medium tabular-nums",
          getAvailableColor(summary.available),
        )}
      >
        <span className="group/available inline-flex items-center gap-1">
          {formatCurrency(summary.available)}
          <button
            type="button"
            onClick={onMoveFunds}
            className="inline-flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover/available:opacity-100"
            title="Move funds from this budget"
          >
            <ArrowLeftRight className="h-3 w-3" />
          </button>
        </span>
      </TableCell>
      <TableCell>
        {summary.targetAmount > 0 ? (
          <BudgetProgressBar percentage={progressPercentage} />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function getProgressBarColor(percentage: number): string {
  if (percentage >= 100) return "bg-red-500";
  if (percentage >= 80) return "bg-yellow-500";
  return "bg-green-500";
}

function BudgetProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all",
            getProgressBarColor(percentage),
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-muted-foreground">
        {percentage}%
      </span>
    </div>
  );
}
