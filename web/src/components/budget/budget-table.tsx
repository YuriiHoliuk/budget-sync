"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  ArrowLeftRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  GetBudgetDocument,
  type BudgetSummary,
  BudgetType,
  type TargetCadence,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";
import { updateMonthlyOverviewCache } from "@/lib/cache-utils";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InlineAllocationEditor } from "./inline-allocation-editor";
import { MoveFundsDialog } from "./move-funds-dialog";
import { CreateBudgetDialog } from "./create-budget-dialog";
import { EditBudgetDialog } from "./edit-budget-dialog";
import { ArchiveBudgetDialog } from "./archive-budget-dialog";

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

interface BudgetForDialog {
  id: number;
  name: string;
  type: BudgetType;
  targetAmount: number;
  targetCadence: TargetCadence | null;
  targetCadenceMonths: number | null;
  targetDate: string | null;
}

export function BudgetTable({ budgetSummaries }: BudgetTableProps) {
  const { month } = useMonth();
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);
  const [moveFundsOpen, setMoveFundsOpen] = useState(false);
  const [moveFundsSourceId, setMoveFundsSourceId] = useState<
    number | undefined
  >(undefined);
  const [createBudgetOpen, setCreateBudgetOpen] = useState(false);
  const [editBudgetDialogOpen, setEditBudgetDialogOpen] = useState(false);
  const [archiveBudgetDialogOpen, setArchiveBudgetDialogOpen] = useState(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);

  const { data: budgetData } = useQuery(GetBudgetDocument, {
    variables: { id: selectedBudgetId ?? 0 },
    skip: selectedBudgetId === null,
  });

  const [createAllocation] = useMutation(CreateAllocationDocument);

  const handleMoveFunds = (sourceBudgetId?: number) => {
    setMoveFundsSourceId(sourceBudgetId);
    setMoveFundsOpen(true);
  };

  const handleEditBudget = (budgetId: number) => {
    setSelectedBudgetId(budgetId);
    setEditBudgetDialogOpen(true);
  };

  const handleArchiveBudget = (budgetId: number) => {
    setSelectedBudgetId(budgetId);
    setArchiveBudgetDialogOpen(true);
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
      update: (cache) => {
        updateMonthlyOverviewCache(cache, month, budgetId, amount);
      },
    });
    setEditingBudgetId(null);
  };

  const handleAllocationCancel = () => {
    setEditingBudgetId(null);
  };

  const selectedBudget = budgetSummaries.find(
    (budget) => budget.budgetId === selectedBudgetId,
  );

  const budgetForEdit: BudgetForDialog | null =
    selectedBudgetId && budgetData?.budget
      ? {
          id: budgetData.budget.id,
          name: budgetData.budget.name,
          type: budgetData.budget.type,
          targetAmount: budgetData.budget.targetAmount,
          targetCadence: budgetData.budget.targetCadence ?? null,
          targetCadenceMonths: budgetData.budget.targetCadenceMonths ?? null,
          targetDate: budgetData.budget.targetDate ?? null,
        }
      : null;

  if (budgetSummaries.length === 0) {
    return (
      <>
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No budgets yet. Create your first budget to start tracking spending.
          </p>
          <Button onClick={() => setCreateBudgetOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Budget
          </Button>
        </div>
        <CreateBudgetDialog
          open={createBudgetOpen}
          onOpenChange={setCreateBudgetOpen}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleMoveFunds()}
        >
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          Move Funds
        </Button>
        <Button size="sm" onClick={() => setCreateBudgetOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Budget
        </Button>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[200px]">Budget</TableHead>
              <TableHead className="w-[100px] text-right">Target</TableHead>
              <TableHead className="w-[140px] text-right">Allocated</TableHead>
              <TableHead className="w-[100px] text-right">Spent</TableHead>
              <TableHead className="w-[100px] text-right">Available</TableHead>
              <TableHead className="w-[120px]">Progress</TableHead>
              <TableHead className="w-[48px]" />
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
                  onEditBudget={handleEditBudget}
                  onArchiveBudget={handleArchiveBudget}
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
      <CreateBudgetDialog
        open={createBudgetOpen}
        onOpenChange={setCreateBudgetOpen}
      />
      {budgetForEdit && (
        <EditBudgetDialog
          open={editBudgetDialogOpen}
          onOpenChange={setEditBudgetDialogOpen}
          budget={budgetForEdit}
        />
      )}
      {selectedBudget && (
        <ArchiveBudgetDialog
          open={archiveBudgetDialogOpen}
          onOpenChange={setArchiveBudgetDialogOpen}
          budget={{
            id: selectedBudget.budgetId,
            name: selectedBudget.name,
          }}
        />
      )}
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
  onEditBudget: (budgetId: number) => void;
  onArchiveBudget: (budgetId: number) => void;
}

function BudgetGroup({
  type,
  summaries,
  editingBudgetId,
  onStartEdit,
  onSave,
  onCancel,
  onMoveFunds,
  onEditBudget,
  onArchiveBudget,
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
          onEditBudget={() => onEditBudget(summary.budgetId)}
          onArchiveBudget={() => onArchiveBudget(summary.budgetId)}
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
  onEditBudget: () => void;
  onArchiveBudget: () => void;
}

function BudgetRow({
  summary,
  isEditing,
  onStartEdit,
  onSave,
  onCancel,
  onMoveFunds,
  onEditBudget,
  onArchiveBudget,
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
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEditBudget}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMoveFunds}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Move Funds
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onArchiveBudget} variant="destructive">
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
