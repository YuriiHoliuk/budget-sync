"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import {
  GetUnbudgetedTransactionsDocument,
  GetMonthlyOverviewDocument,
  UpdateTransactionBudgetDocument,
  GetBudgetsDocument,
  GetCategoriesDocument,
  UpdateTransactionCategoryDocument,
  type GetUnbudgetedTransactionsQuery,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";
import { formatCurrency } from "@/lib/format";
import { getDateRangeFromMonth } from "@/lib/url-utils";
import { BudgetCombobox } from "@/components/budget/budget-combobox";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

type UnbudgetedTransaction =
  GetUnbudgetedTransactionsQuery["transactions"]["items"][number];

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
  });
}

export function UnbudgetedTransactionsWarning() {
  const { month } = useMonth();
  const [isExpanded, setIsExpanded] = useState(false);
  const { dateFrom, dateTo } = useMemo(
    () => getDateRangeFromMonth(month),
    [month]
  );

  const { data, loading } = useQuery(GetUnbudgetedTransactionsDocument, {
    variables: { dateFrom, dateTo, pagination: { limit: 50 } },
  });

  const { data: budgetsData } = useQuery(GetBudgetsDocument, {
    variables: { activeOnly: true },
  });

  const { data: categoriesData } = useQuery(GetCategoriesDocument, {
    variables: { activeOnly: true },
  });

  const categories = useMemo(
    () => categoriesData?.categories ?? [],
    [categoriesData?.categories]
  );

  const [updateBudget] = useMutation(UpdateTransactionBudgetDocument, {
    refetchQueries: [
      { query: GetMonthlyOverviewDocument, variables: { month } },
      { query: GetUnbudgetedTransactionsDocument, variables: { dateFrom, dateTo, pagination: { limit: 50 } } },
    ],
  });

  const transactionItems = data?.transactions.items;
  const transactions = useMemo(
    () => transactionItems ?? [],
    [transactionItems]
  );
  const totalCount = data?.transactions.totalCount ?? 0;
  const totalAmount = useMemo(
    () => transactions.reduce((sum, txn) => sum + txn.amount, 0),
    [transactions]
  );

  const budgets = budgetsData?.budgets;
  const activeBudgets = useMemo(() => {
    if (!budgets) return [];
    return budgets
      .filter((budget) => !budget.isArchived)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [budgets]);

  const [updateCategory] = useMutation(UpdateTransactionCategoryDocument, {
    refetchQueries: [
      { query: GetUnbudgetedTransactionsDocument, variables: { dateFrom, dateTo, pagination: { limit: 50 } } },
    ],
  });

  const handleBudgetAssign = async (transactionId: number, budgetId: number) => {
    await updateBudget({
      variables: { input: { id: transactionId, budgetId } },
    });
  };

  const handleCategoryAssign = async (transactionId: number, categoryId: number | null) => {
    await updateCategory({
      variables: { input: { id: transactionId, categoryId } },
    });
  };

  if (loading) {
    return <UnbudgetedTransactionsSkeleton />;
  }

  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <span className="font-medium text-amber-800 dark:text-amber-200">
            {totalCount} unbudgeted expense{totalCount !== 1 ? "s" : ""} (
            {formatCurrency(totalAmount)})
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-amber-200 dark:border-amber-900">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-20">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-32">Account</TableHead>
                <TableHead className="w-48">Category</TableHead>
                <TableHead className="w-24 text-right">Amount</TableHead>
                <TableHead className="w-48">Assign Budget</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <UnbudgetedTransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  budgets={activeBudgets}
                  categories={categories}
                  onBudgetAssign={handleBudgetAssign}
                  onCategoryAssign={handleCategoryAssign}
                />
              ))}
            </TableBody>
          </Table>
          {data?.transactions.hasMore && (
            <div className="border-t border-amber-200 px-4 py-2 text-center text-sm text-amber-700 dark:border-amber-900 dark:text-amber-300">
              Showing {transactions.length} of {totalCount} unbudgeted
              transactions
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface UnbudgetedTransactionRowProps {
  transaction: UnbudgetedTransaction;
  budgets: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string; fullPath: string }>;
  onBudgetAssign: (transactionId: number, budgetId: number) => Promise<void>;
  onCategoryAssign: (transactionId: number, categoryId: number | null) => Promise<void>;
}

function UnbudgetedTransactionRow({
  transaction,
  budgets,
  categories,
  onBudgetAssign,
  onCategoryAssign,
}: UnbudgetedTransactionRowProps) {
  const [isAssigning, setIsAssigning] = useState(false);

  const handleSelect = async (budgetId: number | null) => {
    if (budgetId === null) return;

    setIsAssigning(true);
    try {
      await onBudgetAssign(transaction.id, budgetId);
    } finally {
      setIsAssigning(false);
    }
  };

  const description =
    transaction.counterpartyName || transaction.description || "Unknown";

  return (
    <TableRow className="hover:bg-amber-100/50 dark:hover:bg-amber-950/50">
      <TableCell className="font-medium text-muted-foreground">
        {formatDate(transaction.date)}
      </TableCell>
      <TableCell>
        <span className="font-medium">{description}</span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {transaction.account?.name ?? "Unknown"}
      </TableCell>
      <TableCell>
        <CategoryCombobox
          categories={categories}
          value={transaction.category?.id ?? null}
          onValueChange={(categoryId) => onCategoryAssign(transaction.id, categoryId)}
          allowNone
          placeholder="Select category..."
          triggerClassName="h-8 w-full"
        />
      </TableCell>
      <TableCell className="text-right font-medium text-red-600 dark:text-red-400">
        -{formatCurrency(transaction.amount)}
      </TableCell>
      <TableCell>
        <BudgetCombobox
          budgets={budgets}
          value={null}
          onValueChange={handleSelect}
          disabled={isAssigning}
          placeholder="Select budget..."
          triggerClassName="h-8 w-full"
        />
      </TableCell>
    </TableRow>
  );
}

function UnbudgetedTransactionsSkeleton() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}
