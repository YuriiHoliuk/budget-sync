"use client";

import { forwardRef, useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Eye,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Archive,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
  CreateBudgetGroupDocument,
  DeleteBudgetGroupDocument,
  GetBudgetDocument,
  GetMonthlyOverviewDocument,
  ReorderBudgetDocument,
  UpdateBudgetGroupDocument,
  type BudgetGroup,
  type BudgetSummary,
  type CadenceUnit,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";
import { getDateRangeFromMonth, buildTransactionsUrl } from "@/lib/url-utils";
import {
  updateMonthlyOverviewCache,
  reorderBudgetInCache,
} from "@/lib/cache-utils";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InlineAllocationEditor } from "./inline-allocation-editor";
import { MoveFundsSheet } from "./move-funds-sheet";
import { CreateBudgetSheet } from "./create-budget-sheet";
import { EditBudgetSheet } from "./edit-budget-sheet";
import { ArchiveBudgetDialog } from "./archive-budget-dialog";

interface BudgetTableProps {
  budgetSummaries: BudgetSummary[];
  budgetGroups: BudgetGroup[];
}

interface GroupedBudgets {
  group: BudgetGroup | null;
  budgets: BudgetSummary[];
  totals: { targetAmount: number; allocated: number; spent: number; available: number };
}

function getAvailableColor(available: number): string {
  if (available < 0) return "text-red-600 dark:text-red-400";
  if (available === 0) return "text-muted-foreground";
  return "text-green-600 dark:text-green-400";
}

function getProgressPercentage(spent: number, targetAmount: number): number {
  if (targetAmount <= 0) return 0;
  return Math.min(Math.round((Math.abs(spent) / targetAmount) * 100), 100);
}

function computeGroupTotals(budgets: BudgetSummary[]) {
  return budgets.reduce(
    (totals, budget) => ({
      targetAmount: totals.targetAmount + budget.targetAmount,
      allocated: totals.allocated + budget.allocated,
      spent: totals.spent + budget.spent,
      available: totals.available + budget.available,
    }),
    { targetAmount: 0, allocated: 0, spent: 0, available: 0 },
  );
}

function groupBudgetsByGroup(
  budgetSummaries: BudgetSummary[],
  budgetGroups: BudgetGroup[],
): GroupedBudgets[] {
  const sortedGroups = [...budgetGroups].sort((groupA, groupB) =>
    (groupA.sortOrder ?? "").localeCompare(groupB.sortOrder ?? ""),
  );

  const grouped: GroupedBudgets[] = [];

  for (const group of sortedGroups) {
    const groupBudgets = budgetSummaries.filter(
      (summary) => summary.budgetGroupId === group.id,
    );
    if (groupBudgets.length > 0 || true) {
      grouped.push({
        group,
        budgets: groupBudgets,
        totals: computeGroupTotals(groupBudgets),
      });
    }
  }

  const ungroupedBudgets = budgetSummaries.filter(
    (summary) => summary.budgetGroupId === null || summary.budgetGroupId === undefined,
  );
  if (ungroupedBudgets.length > 0) {
    grouped.push({
      group: null,
      budgets: ungroupedBudgets,
      totals: computeGroupTotals(ungroupedBudgets),
    });
  }

  return grouped;
}

interface BudgetForDialog {
  id: number;
  name: string;
  currency: string;
  targetAmount: number;
  cadenceUnit: CadenceUnit | null;
  cadenceCount: number | null;
  targetDate: string | null;
  startDate: string | null;
  endDate: string | null;
  cap: number | null;
  budgetGroupId: number | null;
}

export function BudgetTable({ budgetSummaries, budgetGroups }: BudgetTableProps) {
  const { month } = useMonth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);
  const [moveFundsOpen, setMoveFundsOpen] = useState(false);
  const [moveFundsSourceId, setMoveFundsSourceId] = useState<
    number | undefined
  >(undefined);
  const [createBudgetOpen, setCreateBudgetOpen] = useState(false);
  const [editBudgetDialogOpen, setEditBudgetDialogOpen] = useState(() => {
    return searchParams.get("budgetId") !== null;
  });
  const [archiveBudgetDialogOpen, setArchiveBudgetDialogOpen] = useState(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(() => {
    const budgetIdParam = searchParams.get("budgetId");
    if (!budgetIdParam) return null;
    const parsed = Number.parseInt(budgetIdParam, 10);
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [deleteGroupId, setDeleteGroupId] = useState<number | null>(null);

  const { data: budgetData } = useQuery(GetBudgetDocument, {
    variables: { id: selectedBudgetId ?? 0 },
    skip: selectedBudgetId === null,
  });

  const [createAllocation] = useMutation(CreateAllocationDocument);
  const [reorderBudget] = useMutation(ReorderBudgetDocument);
  const [createBudgetGroup] = useMutation(CreateBudgetGroupDocument, {
    refetchQueries: [
      { query: GetMonthlyOverviewDocument, variables: { month } },
    ],
  });
  const [updateBudgetGroup] = useMutation(UpdateBudgetGroupDocument, {
    refetchQueries: [
      { query: GetMonthlyOverviewDocument, variables: { month } },
    ],
  });
  const [deleteBudgetGroup] = useMutation(DeleteBudgetGroupDocument, {
    refetchQueries: [
      { query: GetMonthlyOverviewDocument, variables: { month } },
    ],
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const groupedBudgets = useMemo(
    () => groupBudgetsByGroup(budgetSummaries, budgetGroups),
    [budgetSummaries, budgetGroups],
  );

  // Flat list of all budget IDs in display order for the sortable context
  const sortableIds = useMemo(() => {
    const ids: number[] = [];
    for (const group of groupedBudgets) {
      if (group.group && collapsedGroups.has(group.group.id)) continue;
      for (const budget of group.budgets) {
        ids.push(budget.budgetId);
      }
    }
    return ids;
  }, [groupedBudgets, collapsedGroups]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const activeId = active.id as number;
    const overId = over.id as number;

    // Build a flat ordered list of all visible budgets
    const flatBudgets: BudgetSummary[] = [];
    for (const group of groupedBudgets) {
      if (group.group && collapsedGroups.has(group.group.id)) continue;
      for (const budget of group.budgets) {
        flatBudgets.push(budget);
      }
    }

    const oldIndex = flatBudgets.findIndex(
      (summary) => summary.budgetId === activeId,
    );
    const overIndex = flatBudgets.findIndex(
      (summary) => summary.budgetId === overId,
    );

    if (oldIndex === -1 || overIndex === -1) {
      return;
    }

    const newIndex = overIndex;

    // Determine the target group based on the over item's group
    const overBudget = flatBudgets[newIndex];
    const targetGroupId = overBudget?.budgetGroupId ?? null;
    const activeBudget = flatBudgets[oldIndex];
    const sourceGroupId = activeBudget?.budgetGroupId ?? null;

    const isMovingDown = oldIndex < newIndex;

    const input = isMovingDown
      ? {
          budgetId: activeId,
          afterBudgetId: flatBudgets[newIndex]?.budgetId ?? null,
          beforeBudgetId:
            newIndex < flatBudgets.length - 1
              ? flatBudgets[newIndex + 1]?.budgetId ?? null
              : null,
          ...(targetGroupId !== sourceGroupId
            ? { budgetGroupId: targetGroupId }
            : {}),
        }
      : {
          budgetId: activeId,
          afterBudgetId:
            newIndex > 0
              ? flatBudgets[newIndex - 1]?.budgetId ?? null
              : null,
          beforeBudgetId: flatBudgets[newIndex]?.budgetId ?? null,
          ...(targetGroupId !== sourceGroupId
            ? { budgetGroupId: targetGroupId }
            : {}),
        };

    const crossGroupMove = targetGroupId !== sourceGroupId;

    reorderBudget({
      variables: { input },
      update: (cache) => {
        reorderBudgetInCache(
          cache,
          month,
          oldIndex,
          newIndex,
          crossGroupMove ? targetGroupId : undefined,
        );
      },
    });
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
  };

  const handleMoveFunds = (sourceBudgetId?: number) => {
    setMoveFundsSourceId(sourceBudgetId);
    setMoveFundsOpen(true);
  };

  const updateBudgetIdInUrl = useCallback((budgetId: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (budgetId !== null) {
      params.set("budgetId", String(budgetId));
    } else {
      params.delete("budgetId");
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname]);

  const handleEditBudget = (budgetId: number) => {
    setSelectedBudgetId(budgetId);
    setEditBudgetDialogOpen(true);
    updateBudgetIdInUrl(budgetId);
  };

  const handleArchiveBudget = (budgetId: number) => {
    setSelectedBudgetId(budgetId);
    setArchiveBudgetDialogOpen(true);
  };

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

  const handleToggleGroup = (groupId: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleCreateGroup = async () => {
    await createBudgetGroup({
      variables: { name: "New Group" },
    });
  };

  const handleRenameGroup = async (groupId: number, newName: string) => {
    if (newName.trim() === "") return;
    await updateBudgetGroup({
      variables: { id: groupId, name: newName.trim() },
    });
  };

  const handleDeleteGroup = async (groupId: number) => {
    await deleteBudgetGroup({
      variables: { id: groupId },
    });
    setDeleteGroupId(null);
  };

  const dateRange = useMemo(() => getDateRangeFromMonth(month), [month]);

  const getTransactionsUrl = useCallback(
    (budgetId: number) =>
      buildTransactionsUrl({
        budgetId,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
      }),
    [dateRange],
  );

  const selectedBudget = budgetSummaries.find(
    (budget) => budget.budgetId === selectedBudgetId,
  );

  const budgetForEdit: BudgetForDialog | null =
    selectedBudgetId && budgetData?.budget
      ? {
          id: budgetData.budget.id,
          name: budgetData.budget.name,
          currency: budgetData.budget.currency,
          targetAmount: budgetData.budget.targetAmount,
          cadenceUnit: budgetData.budget.cadenceUnit ?? null,
          cadenceCount: budgetData.budget.cadenceCount ?? null,
          targetDate: budgetData.budget.targetDate ?? null,
          startDate: budgetData.budget.startDate ?? null,
          endDate: budgetData.budget.endDate ?? null,
          cap: budgetData.budget.cap ?? null,
          budgetGroupId: budgetData.budget.budgetGroupId ?? null,
        }
      : null;

  const activeDragSummary = activeDragId
    ? budgetSummaries.find((summary) => summary.budgetId === activeDragId)
    : null;

  const deleteGroup = deleteGroupId
    ? budgetGroups.find((group) => group.id === deleteGroupId)
    : null;

  if (budgetSummaries.length === 0 && budgetGroups.length === 0) {
    return (
      <div className="min-h-0 flex-1">
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No budgets yet. Create your first budget to start tracking spending.
          </p>
          <Button onClick={() => setCreateBudgetOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Budget
          </Button>
        </div>
        <CreateBudgetSheet
          open={createBudgetOpen}
          onOpenChange={setCreateBudgetOpen}
          budgetGroups={budgetGroups}
        />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 flex flex-col">
      <div className="shrink-0 flex items-center justify-end gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleMoveFunds()}
          data-qa="btn-move-funds"
        >
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          Move Funds
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateGroup}
          data-qa="btn-new-group"
        >
          <FolderPlus className="mr-2 h-4 w-4" />
          New Group
        </Button>
        <Button size="sm" onClick={() => setCreateBudgetOpen(true)} data-qa="btn-new-budget">
          <Plus className="mr-2 h-4 w-4" />
          New Budget
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
          <Table data-qa="budget-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[32px]" />
                <TableHead className="w-[200px]">Budget</TableHead>
                <TableHead className="w-[100px] text-right">Target</TableHead>
                <TableHead className="w-[140px] text-right">Allocated</TableHead>
                <TableHead className="w-[100px] text-right">Suggested</TableHead>
                <TableHead className="w-[100px] text-right">Spent</TableHead>
                <TableHead className="w-[100px] text-right">Available</TableHead>
                <TableHead className="w-[120px]">Progress</TableHead>
                <TableHead className="w-[48px]" />
              </TableRow>
            </TableHeader>
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              <TableBody>
                {groupedBudgets.map((groupData) => {
                  const isCollapsed =
                    groupData.group !== null &&
                    collapsedGroups.has(groupData.group.id);

                  return (
                    <GroupSection
                      key={groupData.group?.id ?? "ungrouped"}
                      groupData={groupData}
                      isCollapsed={isCollapsed}
                      getTransactionsUrl={getTransactionsUrl}
                      onToggle={
                        groupData.group
                          ? () => handleToggleGroup(groupData.group!.id)
                          : undefined
                      }
                      onRename={
                        groupData.group
                          ? (newName: string) =>
                              handleRenameGroup(groupData.group!.id, newName)
                          : undefined
                      }
                      onDelete={
                        groupData.group
                          ? () => setDeleteGroupId(groupData.group!.id)
                          : undefined
                      }
                      editingBudgetId={editingBudgetId}
                      onStartEdit={setEditingBudgetId}
                      onSaveAllocation={handleAllocationSave}
                      onCancelAllocation={handleAllocationCancel}
                      onMoveFunds={handleMoveFunds}
                      onEditBudget={handleEditBudget}
                      onArchiveBudget={handleArchiveBudget}
                    />
                  );
                })}
              </TableBody>
            </SortableContext>
          </Table>
        </div>
        <DragOverlay>
          {activeDragSummary ? (
            <table className="w-full text-sm">
              <tbody>
                <BudgetRow
                  summary={activeDragSummary}
                  isEditing={false}
                  isDragOverlay
                  onStartEdit={() => {}}
                  onSave={async () => {}}
                  onCancel={() => {}}
                  onMoveFunds={() => {}}
                  onEditBudget={() => {}}
                  onArchiveBudget={() => {}}
                />
              </tbody>
            </table>
          ) : null}
        </DragOverlay>
      </DndContext>
      <MoveFundsSheet
        open={moveFundsOpen}
        onOpenChange={setMoveFundsOpen}
        budgetSummaries={budgetSummaries}
        initialSourceBudgetId={moveFundsSourceId}
      />
      <CreateBudgetSheet
        open={createBudgetOpen}
        onOpenChange={setCreateBudgetOpen}
        budgetGroups={budgetGroups}
      />
      {budgetForEdit && (
        <EditBudgetSheet
          open={editBudgetDialogOpen}
          onOpenChange={(open) => {
            setEditBudgetDialogOpen(open);
            if (!open) {
              updateBudgetIdInUrl(null);
            }
          }}
          budget={budgetForEdit}
          budgetGroups={budgetGroups}
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
      {deleteGroup && (
        <DeleteGroupDialog
          open={deleteGroupId !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteGroupId(null);
          }}
          group={deleteGroup}
          budgetCount={
            budgetSummaries.filter(
              (summary) => summary.budgetGroupId === deleteGroup.id,
            ).length
          }
          onConfirm={() => handleDeleteGroup(deleteGroup.id)}
        />
      )}
    </div>
  );
}

// --- Group Section ---

interface GroupSectionProps {
  groupData: GroupedBudgets;
  isCollapsed: boolean;
  getTransactionsUrl: (budgetId: number) => string;
  onToggle?: () => void;
  onRename?: (newName: string) => void;
  onDelete?: () => void;
  editingBudgetId: number | null;
  onStartEdit: (budgetId: number) => void;
  onSaveAllocation: (budgetId: number, amount: number) => Promise<void>;
  onCancelAllocation: () => void;
  onMoveFunds: (sourceBudgetId: number) => void;
  onEditBudget: (budgetId: number) => void;
  onArchiveBudget: (budgetId: number) => void;
}

function GroupSection({
  groupData,
  isCollapsed,
  getTransactionsUrl,
  onToggle,
  onRename,
  onDelete,
  editingBudgetId,
  onStartEdit,
  onSaveAllocation,
  onCancelAllocation,
  onMoveFunds,
  onEditBudget,
  onArchiveBudget,
}: GroupSectionProps) {
  return (
    <>
      {groupData.group && (
        <GroupHeaderRow
          group={groupData.group}
          totals={groupData.totals}
          isCollapsed={isCollapsed}
          budgetCount={groupData.budgets.length}
          onToggle={onToggle!}
          onRename={onRename!}
          onDelete={onDelete!}
        />
      )}
      {groupData.group === null && groupData.budgets.length > 0 && (
        <TableRow className="bg-muted/30 hover:bg-muted/30" data-qa="group-header-ungrouped">
          <TableCell className="w-[32px]" />
          <TableCell
            colSpan={8}
            className="py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Ungrouped
          </TableCell>
        </TableRow>
      )}
      {!isCollapsed &&
        groupData.budgets.map((summary) => (
          <SortableBudgetRow
            key={summary.budgetId}
            summary={summary}
            isEditing={editingBudgetId === summary.budgetId}
            transactionsUrl={getTransactionsUrl(summary.budgetId)}
            onStartEdit={() => onStartEdit(summary.budgetId)}
            onSave={(amount) =>
              onSaveAllocation(summary.budgetId, amount)
            }
            onCancel={onCancelAllocation}
            onMoveFunds={() => onMoveFunds(summary.budgetId)}
            onEditBudget={() => onEditBudget(summary.budgetId)}
            onArchiveBudget={() => onArchiveBudget(summary.budgetId)}
          />
        ))}
    </>
  );
}

// --- Group Header Row ---

interface GroupHeaderRowProps {
  group: BudgetGroup;
  totals: { targetAmount: number; allocated: number; spent: number; available: number };
  isCollapsed: boolean;
  budgetCount: number;
  onToggle: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}

function GroupHeaderRow({
  group,
  totals,
  isCollapsed,
  budgetCount,
  onToggle,
  onRename,
  onDelete,
}: GroupHeaderRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = () => {
    setEditName(group.name);
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  };

  const handleSave = () => {
    if (editName.trim() !== "" && editName.trim() !== group.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(group.name);
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      handleSave();
    } else if (event.key === "Escape") {
      handleCancel();
    }
  };

  const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

  return (
    <TableRow
      className="bg-muted/30 hover:bg-muted/40"
      data-qa={`group-header-${group.id}`}
    >
      <TableCell className="w-[32px] px-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          data-qa={`group-toggle-${group.id}`}
        >
          <ChevronIcon className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell className="py-2">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <Input
                ref={inputRef}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                onKeyDown={handleKeyDown}
                className="h-7 w-40 text-sm font-semibold"
                data-qa={`group-name-input-${group.id}`}
                autoFocus
              />
              <button
                type="button"
                onClick={handleSave}
                className="flex h-6 w-6 items-center justify-center rounded text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleCancel}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              className="text-sm font-semibold hover:underline cursor-pointer"
              data-qa={`group-name-${group.id}`}
            >
              {group.name}
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            ({budgetCount})
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
        {totals.targetAmount > 0 ? formatCurrency(totals.targetAmount) : "\u2014"}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
        {formatCurrency(totals.allocated)}
      </TableCell>
      <TableCell />
      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
        {totals.spent !== 0 ? formatCurrency(totals.spent) : "\u2014"}
      </TableCell>
      <TableCell
        className={cn(
          "text-right text-xs font-medium tabular-nums",
          getAvailableColor(totals.available),
        )}
      >
        {formatCurrency(totals.available)}
      </TableCell>
      <TableCell />
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              data-qa={`group-menu-${group.id}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
            <DropdownMenuItem onClick={handleStartEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// --- Delete Group Confirmation Dialog ---

interface DeleteGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: BudgetGroup;
  budgetCount: number;
  onConfirm: () => void;
}

function DeleteGroupDialog({
  open,
  onOpenChange,
  group,
  budgetCount,
  onConfirm,
}: DeleteGroupDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-qa="dialog-delete-group">
        <DialogHeader>
          <DialogTitle>Delete Group</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{group.name}&quot;?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {budgetCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              {budgetCount} budget{budgetCount !== 1 ? "s" : ""} in this group
              will become ungrouped. No budgets will be deleted.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              This group is empty and will be removed.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            data-qa="btn-delete-group-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
            data-qa="btn-delete-group-confirm"
          >
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Sortable Budget Row ---

interface BudgetRowProps {
  summary: BudgetSummary;
  isEditing: boolean;
  isDragOverlay?: boolean;
  transactionsUrl?: string;
  onStartEdit: () => void;
  onSave: (amount: number) => Promise<void>;
  onCancel: () => void;
  onMoveFunds: () => void;
  onEditBudget: () => void;
  onArchiveBudget: () => void;
}

function SortableBudgetRow(props: BudgetRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.summary.budgetId });

  const style = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, x: 0 } : null,
    ),
    transition,
  };

  return (
    <BudgetRow
      ref={setNodeRef}
      style={style}
      isDragging={isDragging}
      dragHandleProps={{ ...attributes, ...listeners }}
      {...props}
    />
  );
}

interface DragHandleProps {
  [key: string]: unknown;
}

const BudgetRow = forwardRef<
  HTMLTableRowElement,
  BudgetRowProps & {
    style?: CSSProperties;
    isDragging?: boolean;
    dragHandleProps?: DragHandleProps;
  }
>(function BudgetRow(
  {
    summary,
    isEditing,
    isDragOverlay,
    transactionsUrl,
    onStartEdit,
    onSave,
    onCancel,
    onMoveFunds,
    onEditBudget,
    onArchiveBudget,
    style,
    isDragging,
    dragHandleProps,
  },
  ref,
) {
  const progressPercentage = getProgressPercentage(
    summary.spent,
    summary.targetAmount,
  );

  const budgetId = summary.budgetId;

  return (
    <TableRow
      ref={ref}
      style={style}
      data-qa={`budget-row-${budgetId}`}
      className={cn(
        summary.isExpired && "opacity-60",
        isDragging && "opacity-50",
        isDragOverlay && "bg-background shadow-lg border rounded-md",
      )}
    >
      <TableCell className="w-[32px] px-1">
        <button
          type="button"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded text-muted-foreground/40",
            "hover:text-muted-foreground cursor-grab",
            isDragOverlay && "cursor-grabbing",
          )}
          data-qa={`budget-drag-${budgetId}`}
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          {transactionsUrl ? (
            <Link
              href={transactionsUrl}
              className="hover:underline"
              data-qa={`budget-name-link-${budgetId}`}
            >
              {summary.name}
            </Link>
          ) : (
            summary.name
          )}
          {summary.isExpired && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-600/30 dark:text-amber-400 dark:border-amber-400/30">
              Expired
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {summary.targetAmount > 0
          ? formatCurrency(summary.targetAmount)
          : "\u2014"}
      </TableCell>
      <TableCell className="text-right" data-qa={`budget-allocated-${budgetId}`}>
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
      <TableCell className="text-right tabular-nums" data-qa={`budget-suggested-${budgetId}`}>
        {summary.suggestedAllocation > 0 ? (
          <button
            type="button"
            onClick={onStartEdit}
            className="inline-flex h-8 items-center rounded-md px-2 text-right tabular-nums text-amber-600 dark:text-amber-400 hover:bg-muted cursor-pointer transition-colors"
            title="Click to allocate suggested amount"
          >
            {formatCurrency(summary.suggestedAllocation)}
          </button>
        ) : (
          <span className="text-muted-foreground">{"\u2014"}</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums" data-qa={`budget-spent-${budgetId}`}>
        {summary.spent !== 0 ? formatCurrency(summary.spent) : "\u2014"}
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-medium tabular-nums",
          getAvailableColor(summary.available),
        )}
        data-qa={`budget-available-${budgetId}`}
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
          <BudgetProgressBar percentage={progressPercentage} available={summary.available} />
        ) : null}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-qa={`budget-menu-${budgetId}`}>
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {transactionsUrl && (
              <DropdownMenuItem asChild data-qa={`budget-view-transactions-${budgetId}`}>
                <Link href={transactionsUrl}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Transactions
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onEditBudget} data-qa={`budget-edit-${budgetId}`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMoveFunds}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Move Funds
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onArchiveBudget} variant="destructive" data-qa={`budget-archive-${budgetId}`}>
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
});

function getProgressBarColor(percentage: number, available: number): string {
  if (available < 0) return "bg-red-500";
  if (percentage >= 80) return "bg-yellow-500";
  return "bg-green-500";
}

function BudgetProgressBar({ percentage, available }: { percentage: number; available: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all",
            getProgressBarColor(percentage, available),
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
