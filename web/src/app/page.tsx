"use client";

import { MonthlyOverviewHeader } from "@/components/budget/monthly-overview-header";

export default function BudgetPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Budget Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your envelope budgets and allocations.
        </p>
      </div>

      <MonthlyOverviewHeader />
    </div>
  );
}
