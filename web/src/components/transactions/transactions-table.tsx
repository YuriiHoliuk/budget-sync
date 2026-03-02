"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { LocalStorageKey } from "@/lib/local-storage-keys";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Check,
  Tag,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  PanelRightClose,
  PanelRightOpen,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryCombobox, NONE_FILTER } from "@/components/categories/category-combobox";
import { BudgetCombobox } from "@/components/budget/budget-combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  GetTransactionsDocument,
  GetAccountsDocument,
  GetCategoriesDocument,
  GetBudgetsDocument,
  UpdateTransactionCategoryDocument,
  UpdateTransactionBudgetDocument,
  VerifyTransactionDocument,
  MarkAsReturningDocument,
  TransactionTypeEnum,
  CategorizationStatusEnum,
  AccountSource,
  type GetTransactionsQuery,
  type TransactionFilter,
} from "@/graphql/generated/graphql";
import { removeTransactionFromCache, invalidateBudgetRelatedCache } from "@/lib/cache-utils";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { parseTransactionFiltersFromParams } from "@/lib/url-utils";
import { TransactionDetailPanel } from "./transaction-detail-panel";
import { CreateTransactionSheet } from "./create-transaction-sheet";
import { ReturningSelectionBanner } from "./returning-selection-banner";
import { ReturningConfirmationDialog } from "./returning-confirmation-dialog";
import {
  TransactionFiltersSidebar,
  type TransactionFilters,
  emptyFilters,
  countActiveFilters,
} from "./transaction-filters-sidebar";

type Transaction = GetTransactionsQuery["transactions"]["items"][number];

const PAGE_SIZE = 50;

const TYPE_CONFIG: Record<string, { icon: typeof ArrowDownCircle; color: string; label: string; badge?: { text: string; className: string } }> = {
  [TransactionTypeEnum.Credit]: {
    icon: ArrowDownCircle,
    color: "text-green-600 dark:text-green-400",
    label: "Income",
  },
  [TransactionTypeEnum.Debit]: {
    icon: ArrowUpCircle,
    color: "text-red-600 dark:text-red-400",
    label: "Expense",
  },
  TRANSFER: {
    icon: ArrowLeftRight,
    color: "text-blue-600 dark:text-blue-400",
    label: "Transfer",
    badge: {
      text: "Transfer",
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    },
  },
};

const STATUS_CONFIG: Record<
  CategorizationStatusEnum,
  { icon: typeof Clock; color: string; bgColor: string; label: string }
> = {
  [CategorizationStatusEnum.Pending]: {
    icon: Clock,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    label: "Pending",
  },
  [CategorizationStatusEnum.Categorized]: {
    icon: AlertCircle,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "Categorized",
  },
  [CategorizationStatusEnum.Verified]: {
    icon: CheckCircle2,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "Verified",
  },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const datePart = date.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

function filtersToGraphQL(filters: TransactionFilters): TransactionFilter {
  const gqlFilter: TransactionFilter = {};

  if (filters.search) {
    gqlFilter.search = filters.search;
  }
  if (filters.accountId !== null) {
    gqlFilter.accountId = filters.accountId;
  }
  if (filters.categoryId !== null) {
    if (filters.categoryId === NONE_FILTER) {
      gqlFilter.uncategorizedOnly = true;
    } else {
      gqlFilter.categoryId = filters.categoryId;
    }
  }
  if (filters.budgetId !== null) {
    if (filters.budgetId === NONE_FILTER) {
      gqlFilter.unbudgetedOnly = true;
    } else {
      gqlFilter.budgetId = filters.budgetId;
    }
  }
  if (filters.type !== null) {
    gqlFilter.type = filters.type;
  }
  if (filters.status !== null) {
    gqlFilter.categorizationStatus = filters.status;
  }
  if (filters.dateFrom) {
    gqlFilter.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    gqlFilter.dateTo = filters.dateTo;
  }

  return gqlFilter;
}

function filtersToUrlParams(filters: TransactionFilters, page: number, transactionId: number | null): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.accountId !== null) params.set("accountId", String(filters.accountId));
  if (filters.categoryId !== null) params.set("categoryId", filters.categoryId === NONE_FILTER ? "none" : String(filters.categoryId));
  if (filters.budgetId !== null) params.set("budgetId", filters.budgetId === NONE_FILTER ? "none" : String(filters.budgetId));
  if (filters.type !== null) params.set("type", filters.type);
  if (filters.status !== null) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (page > 0) params.set("page", String(page + 1));
  if (transactionId !== null) params.set("transactionId", String(transactionId));
  return params;
}

export function TransactionsTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isInitialMount = useRef(true);

  const initialFilters = useState<TransactionFilters>(() => {
    const parsed = parseTransactionFiltersFromParams(searchParams);
    const hasUrlFilters =
      parsed.search !== undefined ||
      parsed.accountId !== undefined ||
      parsed.categoryId !== undefined ||
      parsed.budgetId !== undefined ||
      parsed.type !== undefined ||
      parsed.status !== undefined ||
      parsed.dateFrom !== undefined ||
      parsed.dateTo !== undefined;

    if (hasUrlFilters) {
      return {
        search: parsed.search ?? "",
        accountId: parsed.accountId ?? null,
        categoryId: parsed.categoryId ?? null,
        budgetId: parsed.budgetId ?? null,
        type: parsed.type ?? null,
        status: parsed.status ?? null,
        dateFrom: parsed.dateFrom ?? "",
        dateTo: parsed.dateTo ?? "",
      };
    }

    // Restore last-used filters from localStorage when no URL filter params
    try {
      const stored = localStorage.getItem(LocalStorageKey.TRANSACTION_FILTERS);
      if (stored) {
        return JSON.parse(stored) as TransactionFilters;
      }
    } catch {
      // Ignore parse errors
    }

    return emptyFilters;
  })[0];

  const [appliedFilters, setAppliedFilters] = useState<TransactionFilters>(initialFilters);
  const [draftFilters, setDraftFilters] = useState<TransactionFilters>(initialFilters);
  const [page, setPage] = useState(() => {
    const pageParam = searchParams.get("page");
    if (!pageParam) return 0;
    const parsed = Number.parseInt(pageParam, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed - 1 : 0;
  });
  const [editingTransaction, setEditingTransaction] = useState<number | null>(null);
  const [autoOpenField, setAutoOpenField] = useState<"category" | "budget" | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<number | null>(() => {
    const transactionId = searchParams.get("transactionId");
    if (!transactionId) return null;
    const parsed = Number.parseInt(transactionId, 10);
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useLocalStorage(LocalStorageKey.FILTER_SIDEBAR_OPEN, true);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  // Returning selection mode
  const [returningSelection, setReturningSelection] = useState<{
    returningTransactionId: number;
    returningAmount: number;
    currency: string;
  } | null>(null);
  const [returningConfirmation, setReturningConfirmation] = useState<{
    originalTransactionId: number;
    originalAmount: number;
  } | null>(null);

  const handleStartReturningSelection = useCallback(
    (transactionId: number, amount: number, currency: string) => {
      setSelectedTransaction(null);
      setReturningSelection({ returningTransactionId: transactionId, returningAmount: amount, currency });
    },
    [],
  );

  const handleCancelReturningSelection = useCallback(() => {
    setReturningSelection(null);
    setReturningConfirmation(null);
  }, []);

  const handleSelectOriginalTransaction = useCallback(
    (originalId: number, originalAmount: number) => {
      setReturningConfirmation({ originalTransactionId: originalId, originalAmount });
    },
    [],
  );

  // Sync applied filters and selected transaction back to URL + persist filters to localStorage
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = filtersToUrlParams(appliedFilters, page, selectedTransaction);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [appliedFilters, page, selectedTransaction, router, pathname]);

  // Persist applied filters to localStorage for restoration on next visit
  useEffect(() => {
    try {
      localStorage.setItem(LocalStorageKey.TRANSACTION_FILTERS, JSON.stringify(appliedFilters));
    } catch {
      // Silently fail
    }
  }, [appliedFilters]);

  const gqlFilter = useMemo(() => filtersToGraphQL(appliedFilters), [appliedFilters]);

  const { data, loading, error } = useQuery(GetTransactionsDocument, {
    variables: {
      filter: gqlFilter,
      pagination: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    },
  });

  const { data: accountsData } = useQuery(GetAccountsDocument, {
    variables: { activeOnly: true },
  });

  const hasManualAccounts = accountsData?.accounts.some(
    (account) => account.source === AccountSource.Manual,
  ) ?? false;

  const { data: categoriesData } = useQuery(GetCategoriesDocument, {
    variables: { activeOnly: true },
  });

  const { data: budgetsData } = useQuery(GetBudgetsDocument, {
    variables: { activeOnly: false },
  });

  const [updateCategory] = useMutation(UpdateTransactionCategoryDocument);

  const [updateBudget] = useMutation(UpdateTransactionBudgetDocument, {
    update(cache) {
      invalidateBudgetRelatedCache(cache);
    },
  });

  const [verifyTransaction] = useMutation(VerifyTransactionDocument);

  const [markAsReturning, { loading: markAsReturningLoading }] = useMutation(MarkAsReturningDocument, {
    update(cache, { data }, { variables }) {
      if (!data?.markAsReturning || !variables?.input) return;
      const { returningTransactionId, originalTransactionId } = variables.input;

      // Returning tx is always deleted
      removeTransactionFromCache(cache, returningTransactionId);

      // For full returns, original tx is also deleted
      if (data.markAsReturning.type === 'FULL') {
        removeTransactionFromCache(cache, originalTransactionId);
      }
      // For partial returns, original tx amount + bankTransactionCount
      // are auto-updated via normalized cache from originalTransaction in response
    },
  });

  const handleConfirmReturning = useCallback(async () => {
    if (!returningSelection || !returningConfirmation) return;
    try {
      await markAsReturning({
        variables: {
          input: {
            returningTransactionId: returningSelection.returningTransactionId,
            originalTransactionId: returningConfirmation.originalTransactionId,
          },
        },
      });
      setReturningSelection(null);
      setReturningConfirmation(null);
    } catch {
      // Error is handled by Apollo Client
    }
  }, [returningSelection, returningConfirmation, markAsReturning]);

  const transactions = data?.transactions.items ?? [];
  const totalCount = data?.transactions.totalCount ?? 0;
  const hasMore = data?.transactions.hasMore ?? false;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const accounts = useMemo(() => accountsData?.accounts ?? [], [accountsData]);
  const categories = useMemo(() => categoriesData?.categories ?? [], [categoriesData]);
  const budgets = useMemo(
    () => (budgetsData?.budgets ?? []).filter((budget) => !budget.isArchived),
    [budgetsData]
  );

  const handleDraftFilterChange = useCallback(
    (key: keyof TransactionFilters, value: string | number | null) => {
      setDraftFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters(draftFilters);
    setPage(0);
    setMobileFiltersOpen(false);
  }, [draftFilters]);

  const handleResetFilters = useCallback(() => {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(0);
  }, []);

  const handleClearFilters = handleResetFilters;

  const handleCategoryChange = async (transactionId: number, categoryId: number | null) => {
    await updateCategory({
      variables: { input: { id: transactionId, categoryId } },
    });
    setEditingTransaction(null);
  };

  const handleBudgetChange = async (transactionId: number, budgetId: number | null) => {
    await updateBudget({
      variables: { input: { id: transactionId, budgetId } },
    });
    setEditingTransaction(null);
  };

  const handleVerify = async (transactionId: number) => {
    await verifyTransaction({
      variables: { id: transactionId },
    });
  };

  const activeFilterCount = countActiveFilters(appliedFilters);

  if (loading && transactions.length === 0) {
    return <TransactionsTableSkeleton />;
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/50">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load transactions: {error.message}
        </p>
      </div>
    );
  }

  const sidebarProps = {
    filters: draftFilters,
    appliedFilters,
    accounts,
    categories,
    budgets,
    activeFilterCount,
    onFilterChange: handleDraftFilterChange,
    onApply: handleApplyFilters,
    onReset: handleResetFilters,
  };

  return (
    <>
      {/* Page header */}
      <div className="flex shrink-0 items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse and manage your financial transactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasManualAccounts && (
            <Button
              size="sm"
              className="gap-1"
              onClick={() => setCreateSheetOpen(true)}
              data-qa="btn-add-transaction"
            >
              <Plus className="h-4 w-4" />
              Add Transaction
            </Button>
          )}

          {/* Mobile: opens sheet */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 lg:hidden"
            onClick={() => setMobileFiltersOpen(true)}
            data-qa="btn-filters"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="gap-1 lg:hidden" data-qa="btn-clear-filters-mobile">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}

          {/* Desktop: toggles sidebar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={() => setFiltersOpen((prev) => !prev)}
                data-qa="btn-toggle-filters"
              >
                {filtersOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                <span className="sr-only">{filtersOpen ? "Hide filters" : "Show filters"}</span>
                {!filtersOpen && activeFilterCount > 0 && (
                  <Badge variant="secondary" className="absolute -top-1 -right-1 h-4 w-4 rounded-full p-0 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {filtersOpen ? "Hide filters" : "Show filters"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content: table + sidebar */}
      <div className="flex min-h-0 flex-1">
        {/* Table column */}
        <div className={cn("flex min-w-0 flex-1 flex-col pt-4 pb-4 md:pb-6", filtersOpen && "lg:pr-6")}>
          {returningSelection && (
            <div className="mb-4">
              <ReturningSelectionBanner
                returningAmount={returningSelection.returningAmount}
                currency={returningSelection.currency}
                onCancel={handleCancelReturningSelection}
              />
            </div>
          )}
          {transactions.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
              <p className="text-sm text-muted-foreground" data-qa="text-no-transactions">
                {activeFilterCount > 0
                  ? "No transactions match your filters."
                  : "No transactions yet."}
              </p>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
                <Table data-qa="transactions-table">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead>Counterparty</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-32">Account</TableHead>
                      <TableHead className="w-40">Category</TableHead>
                      <TableHead className="w-40">Budget</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-28 text-right">Amount</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TransactionRow
                        key={transaction.id}
                        transaction={transaction}
                        categories={categories}
                        budgets={budgets}
                        isEditing={editingTransaction === transaction.id}
                        autoOpenField={editingTransaction === transaction.id ? autoOpenField : null}
                        onStartEdit={(field) => { setEditingTransaction(transaction.id); setAutoOpenField(field); }}
                        onCancelEdit={() => { setEditingTransaction(null); setAutoOpenField(null); }}
                        onCategoryChange={handleCategoryChange}
                        onBudgetChange={handleBudgetChange}
                        onVerify={handleVerify}
                        onViewDetails={() => {
                          if (returningSelection && transaction.type === TransactionTypeEnum.Debit && transaction.amount >= returningSelection.returningAmount) {
                            handleSelectOriginalTransaction(transaction.id, transaction.amount);
                          } else if (!returningSelection) {
                            setSelectedTransaction(transaction.id);
                          }
                        }}
                        returningSelectionActive={returningSelection !== null}
                        returningAmount={returningSelection?.returningAmount}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              <TransactionPagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                hasMore={hasMore}
                onPageChange={setPage}
              />
            </>
          )}
        </div>

        {/* Filter sidebar — border-l spans full height from header border to bottom */}
        {filtersOpen && (
          <aside className="hidden w-[280px] shrink-0 self-stretch overflow-y-auto border-l pl-6 pt-4 pb-4 md:pb-6 lg:block">
            <TransactionFiltersSidebar {...sidebarProps} />
          </aside>
        )}
      </div>

      {/* Filter sheet — mobile only */}
      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="right" className="w-[300px] overflow-y-auto sm:max-w-[300px]">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <TransactionFiltersSidebar {...sidebarProps} />
          </div>
        </SheetContent>
      </Sheet>

      <TransactionDetailPanel
        transactionId={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        onStartReturningSelection={handleStartReturningSelection}
      />

      <ReturningConfirmationDialog
        open={returningConfirmation !== null}
        onOpenChange={(open) => { if (!open) setReturningConfirmation(null); }}
        returningAmount={returningSelection?.returningAmount ?? 0}
        originalAmount={returningConfirmation?.originalAmount ?? 0}
        currency={returningSelection?.currency ?? "UAH"}
        loading={markAsReturningLoading}
        onConfirm={handleConfirmReturning}
      />

      <CreateTransactionSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
      />
    </>
  );
}

interface TransactionRowProps {
  transaction: Transaction;
  categories: Array<{ id: number; name: string; fullPath: string }>;
  budgets: Array<{ id: number; name: string; startDate?: string | null; endDate?: string | null }>;
  isEditing: boolean;
  autoOpenField: "category" | "budget" | null;
  onStartEdit: (field: "category" | "budget") => void;
  onCancelEdit: () => void;
  onCategoryChange: (transactionId: number, categoryId: number | null) => Promise<void>;
  onBudgetChange: (transactionId: number, budgetId: number | null) => Promise<void>;
  onVerify: (transactionId: number) => Promise<void>;
  onViewDetails: () => void;
  returningSelectionActive?: boolean;
  returningAmount?: number;
}

function TransactionRow({
  transaction,
  categories,
  budgets,
  isEditing,
  autoOpenField,
  onStartEdit,
  onCancelEdit,
  onCategoryChange,
  onBudgetChange,
  onVerify,
  onViewDetails,
  returningSelectionActive,
  returningAmount,
}: TransactionRowProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const typeConfig = TYPE_CONFIG[transaction.type] ?? TYPE_CONFIG[TransactionTypeEnum.Debit];
  const statusConfig = STATUS_CONFIG[transaction.categorizationStatus];
  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;

  const counterparty = transaction.counterpartyName || "—";
  const isTransfer = transaction.type === TransactionTypeEnum.Transfer;
  const isDebitRow = transaction.type === TransactionTypeEnum.Debit;
  const isVerified = transaction.categorizationStatus === CategorizationStatusEnum.Verified;
  const isCategorized = transaction.categorizationStatus === CategorizationStatusEnum.Categorized;
  const isSelectableForReturning = returningSelectionActive && isDebitRow && (returningAmount === undefined || transaction.amount >= returningAmount);

  const currentBudgetId = transaction.budget?.id ?? null;
  const filteredBudgets = useMemo(() => {
    const txDate = transaction.date;
    return budgets.filter((budget) => {
      if (budget.id === currentBudgetId) return true;
      const afterStart = !budget.startDate || txDate >= budget.startDate;
      const beforeEnd = !budget.endDate || txDate <= budget.endDate;
      return afterStart && beforeEnd;
    });
  }, [budgets, transaction.date, currentBudgetId]);

  const handleCategorySelect = async (categoryId: number | null) => {
    setIsUpdating(true);
    try {
      await onCategoryChange(transaction.id, categoryId);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBudgetSelect = async (budgetId: number | null) => {
    setIsUpdating(true);
    try {
      await onBudgetChange(transaction.id, budgetId);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleVerify = async () => {
    setIsUpdating(true);
    try {
      await onVerify(transaction.id);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <TableRow
      className={cn(
        isEditing && "bg-muted/50",
        returningSelectionActive
          ? isSelectableForReturning
            ? "cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20"
            : "cursor-not-allowed opacity-50"
          : "cursor-pointer",
      )}
      onClick={onViewDetails}
      data-qa={`transaction-row-${transaction.id}`}
    >
      <TableCell className="font-medium text-muted-foreground">
        {formatDate(transaction.date)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <TypeIcon className={cn("h-4 w-4 shrink-0", typeConfig.color)} />
          <span className="truncate font-medium">{counterparty}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="min-w-0">
          <div className="truncate text-sm">{transaction.description || "—"}</div>
          {transaction.notes && (
            <div className="truncate text-xs text-muted-foreground">{transaction.notes}</div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {transaction.account?.name ?? "Unknown"}
      </TableCell>
      <TableCell onClick={(event) => isEditing && event.stopPropagation()} data-qa={`transaction-category-${transaction.id}`}>
        {isTransfer ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : isEditing ? (
          <CategoryCombobox
            categories={categories}
            value={transaction.category?.id ?? null}
            onValueChange={handleCategorySelect}
            allowNone
            disabled={isUpdating}
            triggerClassName="h-8 w-full"
            defaultOpen={autoOpenField === "category"}
          />
        ) : transaction.category ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartEdit("category");
            }}
            className="flex items-center gap-1 text-left text-sm hover:underline"
          >
            <Tag className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{transaction.category.name}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartEdit("category");
            }}
            className="text-sm text-muted-foreground hover:underline"
          >
            Add category
          </button>
        )}
      </TableCell>
      <TableCell onClick={(event) => isEditing && event.stopPropagation()} data-qa={`transaction-budget-${transaction.id}`}>
        {isTransfer ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : isEditing ? (
          <BudgetCombobox
            budgets={filteredBudgets}
            value={transaction.budget?.id ?? null}
            onValueChange={handleBudgetSelect}
            allowNone
            disabled={isUpdating}
            triggerClassName="h-8 w-full"
            defaultOpen={autoOpenField === "budget"}
          />
        ) : transaction.budget ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartEdit("budget");
            }}
            className="flex items-center gap-1 text-left text-sm hover:underline"
          >
            <Wallet className="h-3 w-3 text-muted-foreground" />
            <span className="truncate">{transaction.budget.name}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartEdit("budget");
            }}
            className="text-sm text-muted-foreground hover:underline"
          >
            Add budget
          </button>
        )}
      </TableCell>
      <TableCell>
        {isTransfer ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <Badge
            variant="outline"
            className={cn("gap-1 text-xs", statusConfig.bgColor, statusConfig.color)}
            data-qa={`transaction-status-${transaction.id}`}
          >
            <StatusIcon className="h-3 w-3" />
            {statusConfig.label}
          </Badge>
        )}
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-medium tabular-nums",
          transaction.type === TransactionTypeEnum.Debit
            ? "text-red-600 dark:text-red-400"
            : transaction.type === TransactionTypeEnum.Credit
              ? "text-green-600 dark:text-green-400"
              : typeConfig.color
        )}
        data-qa={`transaction-amount-${transaction.id}`}
      >
        <div className="flex items-center justify-end gap-1.5">
          {typeConfig.badge && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", typeConfig.badge.className)}>
              {typeConfig.badge.text}
            </Badge>
          )}
          {transaction.type === "DEBIT" && transaction.bankTransactionCount > 1 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              Partial return
            </Badge>
          )}
          <span>
            {transaction.type === TransactionTypeEnum.Debit ? "-" : "+"}
            {formatCurrency(transaction.amount)}
          </span>
        </div>
      </TableCell>
      <TableCell onClick={(event) => event.stopPropagation()}>
        {isEditing ? (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancelEdit}>
            <X className="h-4 w-4" />
            <span className="sr-only">Cancel</span>
          </Button>
        ) : !isTransfer && !isVerified ? (
          <Button
            variant={isCategorized ? "outline" : "ghost"}
            size="sm"
            className={cn(
              "h-8 w-8 p-0",
              isCategorized && "border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
            )}
            onClick={handleVerify}
            disabled={isUpdating}
            title={isCategorized ? "Approve AI categorization" : "Verify transaction"}
            data-qa={`btn-verify-${transaction.id}`}
          >
            <Check className="h-4 w-4" />
            <span className="sr-only">Verify</span>
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

interface TransactionPaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
}

function getPageNumbers(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const pages: Array<number | "ellipsis"> = [];

  // Always show first page
  pages.push(0);

  if (currentPage > 2) {
    pages.push("ellipsis");
  }

  // Pages around current
  const start = Math.max(1, currentPage - 1);
  const end = Math.min(totalPages - 2, currentPage + 1);

  for (let pageIndex = start; pageIndex <= end; pageIndex++) {
    pages.push(pageIndex);
  }

  if (currentPage < totalPages - 3) {
    pages.push("ellipsis");
  }

  // Always show last page
  pages.push(totalPages - 1);

  return pages;
}

function TransactionPagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  hasMore,
  onPageChange,
}: TransactionPaginationProps) {
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);
  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="flex shrink-0 items-center justify-between bg-background py-3 text-sm text-muted-foreground">
      <div data-qa="text-pagination-info">
        Showing {startItem} - {endItem} of {totalCount} transactions
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          data-qa="btn-pagination-previous"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous</span>
        </Button>
        {pageNumbers.map((pageNum, index) =>
          pageNum === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1 text-muted-foreground">
              ...
            </span>
          ) : (
            <Button
              key={pageNum}
              variant={pageNum === page ? "default" : "outline"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onPageChange(pageNum)}
              data-qa={pageNum === page ? "text-pagination-page" : undefined}
            >
              {pageNum + 1}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasMore}
          data-qa="btn-pagination-next"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next</span>
        </Button>
      </div>
    </div>
  );
}

function TransactionsTableSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border">
        <div className="space-y-0">
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 border-b px-4 py-3 last:border-0"
            >
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="ml-auto h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
