"use client";

import { useMemo, useState, useCallback } from "react";
import { useMutation, useQuery } from "@apollo/client";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  X,
  Check,
  Tag,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
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
import { TransactionDetailPanel } from "./transaction-detail-panel";

type Transaction = GetTransactionsQuery["transactions"]["items"][number];

const PAGE_SIZE = 25;

const TYPE_CONFIG: Record<TransactionTypeEnum, { icon: typeof ArrowDownCircle; color: string; label: string }> = {
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

interface TransactionFilters {
  search: string;
  accountId: number | null;
  categoryId: number | null;
  budgetId: number | null;
  type: TransactionTypeEnum | null;
  status: CategorizationStatusEnum | null;
  dateFrom: string;
  dateTo: string;
}

const emptyFilters: TransactionFilters = {
  search: "",
  accountId: null,
  categoryId: null,
  budgetId: null,
  type: null,
  status: null,
  dateFrom: "",
  dateTo: "",
};

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

function countActiveFilters(filters: TransactionFilters): number {
  let count = 0;
  if (filters.search) count++;
  if (filters.accountId !== null) count++;
  if (filters.categoryId !== null) count++;
  if (filters.budgetId !== null) count++;
  if (filters.type !== null) count++;
  if (filters.status !== null) count++;
  if (filters.dateFrom || filters.dateTo) count++;
  return count;
}

export function TransactionsTable() {
  const [filters, setFilters] = useState<TransactionFilters>(emptyFilters);
  const [page, setPage] = useState(0);
  const [editingTransaction, setEditingTransaction] = useState<number | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<number | null>(null);

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
    variables: { activeOnly: true },
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
    () => (budgetsData?.budgets ?? []).filter((b) => !b.isArchived),
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
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/50 dark:bg-red-950/50">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load transactions: {error.message}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <TransactionFiltersBar
          filters={filters}
          accounts={accounts}
          categories={categories}
          budgets={budgets}
          activeFilterCount={activeFilterCount}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />

        {transactions.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {activeFilterCount > 0
                ? "No transactions match your filters."
                : "No transactions yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border">
              <Table>
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

      <TransactionDetailPanel
        transactionId={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </>
  );
}

interface TransactionFiltersBarProps {
  filters: TransactionFilters;
  accounts: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string; fullPath: string }>;
  budgets: Array<{ id: number; name: string }>;
  activeFilterCount: number;
  onFilterChange: (key: keyof TransactionFilters, value: string | number | null) => void;
  onClearFilters: () => void;
}

function TransactionFiltersBar({
  filters,
  accounts,
  categories,
  budgets,
  activeFilterCount,
  onFilterChange,
  onClearFilters,
}: TransactionFiltersBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search transactions..."
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Account</Label>
                <Select
                  value={filters.accountId?.toString() ?? "all"}
                  onValueChange={(value) =>
                    onFilterChange("accountId", value === "all" ? null : parseInt(value, 10))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={filters.categoryId?.toString() ?? "all"}
                  onValueChange={(value) =>
                    onFilterChange("categoryId", value === "all" ? null : parseInt(value, 10))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {category.fullPath}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Budget</Label>
                <Select
                  value={filters.budgetId?.toString() ?? "all"}
                  onValueChange={(value) =>
                    onFilterChange("budgetId", value === "all" ? null : parseInt(value, 10))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All budgets" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All budgets</SelectItem>
                    {budgets.map((budget) => (
                      <SelectItem key={budget.id} value={budget.id.toString()}>
                        {budget.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={filters.type ?? "all"}
                  onValueChange={(value) =>
                    onFilterChange("type", value === "all" ? null : (value as TransactionTypeEnum))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value={TransactionTypeEnum.Debit}>Expense</SelectItem>
                    <SelectItem value={TransactionTypeEnum.Credit}>Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={filters.status ?? "all"}
                  onValueChange={(value) =>
                    onFilterChange("status", value === "all" ? null : (value as CategorizationStatusEnum))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value={CategorizationStatusEnum.Pending}>Pending</SelectItem>
                    <SelectItem value={CategorizationStatusEnum.Categorized}>Categorized</SelectItem>
                    <SelectItem value={CategorizationStatusEnum.Verified}>Verified</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => onFilterChange("dateFrom", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => onFilterChange("dateTo", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="gap-1">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
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
  const typeConfig = TYPE_CONFIG[transaction.type];
  const statusConfig = STATUS_CONFIG[transaction.categorizationStatus];
  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;

  const description = transaction.counterpartyName || transaction.description || "Unknown";
  const isVerified = transaction.categorizationStatus === CategorizationStatusEnum.Verified;

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
      <TableCell onClick={(event) => isEditing && event.stopPropagation()}>
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
      <TableCell onClick={(event) => isEditing && event.stopPropagation()}>
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
            : "text-green-600 dark:text-green-400"
        )}
      >
        {transaction.type === TransactionTypeEnum.Debit ? "-" : "+"}
        {formatCurrency(transaction.amount)}
      </TableCell>
      <TableCell onClick={(event) => event.stopPropagation()}>
        {isEditing ? (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancelEdit}>
            <X className="h-4 w-4" />
            <span className="sr-only">Cancel</span>
          </Button>
        ) : !isVerified ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleVerify}
            disabled={isUpdating}
            title="Verify transaction"
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

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <div>
        Showing {startItem} - {endItem} of {totalCount} transactions
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="px-2">
          Page {page + 1} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasMore}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TransactionsTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="rounded-xl border">
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
