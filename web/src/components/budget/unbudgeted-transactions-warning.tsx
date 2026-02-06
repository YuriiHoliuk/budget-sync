"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import {
  GetUnbudgetedTransactionsDocument,
  GetMonthlyOverviewDocument,
  UpdateTransactionBudgetDocument,
  GetBudgetsDocument,
  type GetUnbudgetedTransactionsQuery,
} from "@/graphql/generated/graphql";
import { useMonth } from "@/hooks/use-month";
import { formatCurrency } from "@/lib/format";
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
import { Skeleton } from "@/components/ui/skeleton";

type UnbudgetedTransaction =
  GetUnbudgetedTransactionsQuery["transactions"]["items"][number];

function getDateRangeFromMonth(month: string): { dateFrom: string; dateTo: string } {
  const [year, monthNum] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);

  return {
    dateFrom: firstDay.toISOString().split("T")[0],
    dateTo: lastDay.toISOString().split("T")[0],
  };
}

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

  const handleBudgetAssign = async (transactionId: number, budgetId: number) => {
    await updateBudget({
      variables: { input: { id: transactionId, budgetId } },
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
                  onBudgetAssign={handleBudgetAssign}
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
  onBudgetAssign: (transactionId: number, budgetId: number) => Promise<void>;
}

function UnbudgetedTransactionRow({
  transaction,
  budgets,
  onBudgetAssign,
}: UnbudgetedTransactionRowProps) {
  const [isAssigning, setIsAssigning] = useState(false);

  const handleSelect = async (value: string) => {
    const budgetId = parseInt(value, 10);
    if (Number.isNaN(budgetId)) return;

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
        <div className="flex flex-col">
          <span className="font-medium">{description}</span>
          {transaction.category && (
            <span className="text-xs text-muted-foreground">
              {transaction.category.name}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {transaction.account?.name ?? "Unknown"}
      </TableCell>
      <TableCell className="text-right font-medium text-red-600 dark:text-red-400">
        -{formatCurrency(transaction.amount)}
      </TableCell>
      <TableCell>
        <Select onValueChange={handleSelect} disabled={isAssigning}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Select budget..." />
          </SelectTrigger>
          <SelectContent>
            {budgets.map((budget) => (
              <SelectItem key={budget.id} value={String(budget.id)}>
                {budget.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
