"use client";

import { useQuery } from "@apollo/client/react";
import { useMonth } from "@/hooks/use-month";
import { GetMonthlyOverviewDocument } from "@/graphql/generated/graphql";
import { MonthlyOverviewHeader } from "@/components/budget/monthly-overview-header";
import { BudgetTable } from "@/components/budget/budget-table";
import { UnbudgetedTransactionsWarning } from "@/components/budget/unbudgeted-transactions-warning";
import { Skeleton } from "@/components/ui/skeleton";

export default function BudgetPage() {
  const { month } = useMonth();
  const { data, loading, error } = useQuery(GetMonthlyOverviewDocument, {
    variables: { month },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Budget Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your envelope budgets and allocations.
        </p>
      </div>

      <MonthlyOverviewHeader
        overview={data?.monthlyOverview}
        loading={loading}
        error={error}
      />

      {loading ? (
        <BudgetTableSkeleton />
      ) : data ? (
        <BudgetTable budgetSummaries={data.monthlyOverview.budgetSummaries} />
      ) : null}

      <UnbudgetedTransactionsWarning />
    </div>
  );
}

function BudgetTableSkeleton() {
  return (
    <div className="rounded-xl border">
      <div className="space-y-0">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-0"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-1.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
