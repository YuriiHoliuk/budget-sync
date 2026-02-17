"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
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
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertCircle,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  TransactionTypeEnum,
  CategorizationStatusEnum,
  type GetTransactionsQuery,
  type TransactionFilter,
} from "@/graphql/generated/graphql";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { parseTransactionFiltersFromParams } from "@/lib/url-utils";
import { TransactionDetailPanel } from "./transaction-detail-panel";
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
  RETURNING: {
    icon: RotateCcw,
    color: "text-amber-600 dark:text-amber-400",
    label: "Returning",
    badge: {
      text: "Returning",
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
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
  return date.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
    gqlFilter.categoryId = filters.categoryId;
  }
  if (filters.budgetId !== null) {
    gqlFilter.budgetId = filters.budgetId;
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

function filtersToUrlParams(filters: TransactionFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.accountId !== null) params.set("accountId", String(filters.accountId));
  if (filters.categoryId !== null) params.set("categoryId", String(filters.categoryId));
  if (filters.budgetId !== null) params.set("budgetId", String(filters.budgetId));
  if (filters.type !== null) params.set("type", filters.type);
  if (filters.status !== null) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (page > 0) params.set("page", String(page + 1));
  return params;
}

export function TransactionsTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isInitialMount = useRef(true);

  const [filters, setFilters] = useState<TransactionFilters>(() => {
    const parsed = parseTransactionFiltersFromParams(searchParams);
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
  });
  const [page, setPage] = useState(() => {
    const pageParam = searchParams.get("page");
    if (!pageParam) return 0;
    const parsed = Number.parseInt(pageParam, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed - 1 : 0;
  });
  const [editingTransaction, setEditingTransaction] = useState<number | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<number | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Sync state changes back to URL
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = filtersToUrlParams(filters, page);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [filters, page, router, pathname]);

  const gqlFilter = useMemo(() => filtersToGraphQL(filters), [filters]);

  const { data, loading, error, refetch } = useQuery(GetTransactionsDocument, {
    variables: {
      filter: gqlFilter,
      pagination: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    },
  });

  const { data: accountsData } = useQuery(GetAccountsDocument, {
    variables: { activeOnly: true },
  });

  const { data: categoriesData } = useQuery(GetCategoriesDocument, {
    variables: { activeOnly: true },
  });

  const { data: budgetsData } = useQuery(GetBudgetsDocument, {
    variables: { activeOnly: false },
  });

  const [updateCategory] = useMutation(UpdateTransactionCategoryDocument, {
    onCompleted: () => refetch(),
  });

  const [updateBudget] = useMutation(UpdateTransactionBudgetDocument, {
    onCompleted: () => refetch(),
  });

  const [verifyTransaction] = useMutation(VerifyTransactionDocument, {
    onCompleted: () => refetch(),
  });

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

  const handleFilterChange = useCallback(
    (key: keyof TransactionFilters, value: string | number | null) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(0);
    },
    []
  );

  const handleClearFilters = useCallback(() => {
    setFilters(emptyFilters);
    setPage(0);
  }, []);

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

  const activeFilterCount = countActiveFilters(filters);

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
    filters,
    accounts,
    categories,
    budgets,
    activeFilterCount,
    onFilterChange: handleFilterChange,
    onClearFilters: handleClearFilters,
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
                        onStartEdit={() => setEditingTransaction(transaction.id)}
                        onCancelEdit={() => setEditingTransaction(null)}
                        onCategoryChange={handleCategoryChange}
                        onBudgetChange={handleBudgetChange}
                        onVerify={handleVerify}
                        onViewDetails={() => setSelectedTransaction(transaction.id)}
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
      />
    </>
  );
}

interface TransactionRowProps {
  transaction: Transaction;
  categories: Array<{ id: number; name: string; fullPath: string }>;
  budgets: Array<{ id: number; name: string }>;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onCategoryChange: (transactionId: number, categoryId: number | null) => Promise<void>;
  onBudgetChange: (transactionId: number, budgetId: number | null) => Promise<void>;
  onVerify: (transactionId: number) => Promise<void>;
  onViewDetails: () => void;
}

function TransactionRow({
  transaction,
  categories,
  budgets,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onCategoryChange,
  onBudgetChange,
  onVerify,
  onViewDetails,
}: TransactionRowProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const typeConfig = TYPE_CONFIG[transaction.type] ?? TYPE_CONFIG[TransactionTypeEnum.Debit];
  const statusConfig = STATUS_CONFIG[transaction.categorizationStatus];
  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;

  const description = transaction.counterpartyName || transaction.description || "Unknown";
  const isVerified = transaction.categorizationStatus === CategorizationStatusEnum.Verified;
  const isCategorized = transaction.categorizationStatus === CategorizationStatusEnum.Categorized;

  const handleCategorySelect = async (value: string) => {
    setIsUpdating(true);
    try {
      await onCategoryChange(transaction.id, value === "none" ? null : parseInt(value, 10));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBudgetSelect = async (value: string) => {
    setIsUpdating(true);
    try {
      await onBudgetChange(transaction.id, value === "none" ? null : parseInt(value, 10));
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
      className={cn(isEditing && "bg-muted/50", "cursor-pointer")}
      onClick={onViewDetails}
      data-qa={`transaction-row-${transaction.id}`}
    >
      <TableCell className="font-medium text-muted-foreground">
        {formatDate(transaction.date)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <TypeIcon className={cn("h-4 w-4 shrink-0", typeConfig.color)} />
          <div className="min-w-0">
            <div className="truncate font-medium">{description}</div>
            {transaction.notes && (
              <div className="truncate text-xs text-muted-foreground">{transaction.notes}</div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {transaction.account?.name ?? "Unknown"}
      </TableCell>
      <TableCell onClick={(event) => isEditing && event.stopPropagation()} data-qa={`transaction-category-${transaction.id}`}>
        {isEditing ? (
          <Select
            value={transaction.category?.id.toString() ?? "none"}
            onValueChange={handleCategorySelect}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id.toString()}>
                  {category.fullPath}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : transaction.category ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartEdit();
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
              onStartEdit();
            }}
            className="text-sm text-muted-foreground hover:underline"
          >
            Add category
          </button>
        )}
      </TableCell>
      <TableCell onClick={(event) => isEditing && event.stopPropagation()} data-qa={`transaction-budget-${transaction.id}`}>
        {isEditing ? (
          <Select
            value={transaction.budget?.id.toString() ?? "none"}
            onValueChange={handleBudgetSelect}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {budgets.map((budget) => (
                <SelectItem key={budget.id} value={budget.id.toString()}>
                  {budget.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : transaction.budget ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartEdit();
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
              onStartEdit();
            }}
            className="text-sm text-muted-foreground hover:underline"
          >
            Add budget
          </button>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("gap-1 text-xs", statusConfig.bgColor, statusConfig.color)}
          data-qa={`transaction-status-${transaction.id}`}
        >
          <StatusIcon className="h-3 w-3" />
          {statusConfig.label}
        </Badge>
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
        ) : !isVerified ? (
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
