"use client";

import type { ErrorLike } from "@apollo/client";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PiggyBankIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import type { GetMonthlyOverviewQuery } from "@/graphql/generated/graphql";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type MonthlyOverview = GetMonthlyOverviewQuery["monthlyOverview"];

interface MonthlyOverviewHeaderProps {
  overview: MonthlyOverview | undefined;
  loading: boolean;
  error: ErrorLike | undefined;
}

function getReadyToAssignStatus(amount: number) {
  if (amount === 0) return { label: "All assigned", color: "text-green-600 dark:text-green-400" };
  if (amount > 0) return { label: "To assign", color: "text-yellow-600 dark:text-yellow-400" };
  return { label: "Over-assigned", color: "text-red-600 dark:text-red-400" };
}

function getReadyToAssignBg(amount: number) {
  if (amount === 0) return "bg-green-500/10 border-green-500/20";
  if (amount > 0) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function MetricCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4">
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-lg" />
            <div>
              <Skeleton className="mb-1 h-3 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonthlyOverviewHeader({
  overview,
  loading,
  error,
}: MonthlyOverviewHeaderProps) {
  if (loading) return <HeaderSkeleton />;

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load monthly overview: {error.message}
        </p>
      </div>
    );
  }

  if (!overview) return null;

  const readyStatus = getReadyToAssignStatus(overview.readyToAssign);

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-xl border p-4",
          getReadyToAssignBg(overview.readyToAssign),
        )}
      >
        <p className={cn("text-xs font-medium", readyStatus.color)}>
          {readyStatus.label}
        </p>
        <p className={cn("text-2xl font-bold tracking-tight", readyStatus.color)}>
          {formatCurrency(overview.readyToAssign)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Available Funds"
          value={formatCurrency(overview.availableFunds)}
          icon={WalletIcon}
        />
        <MetricCard
          label="Capital"
          value={formatCurrency(overview.capitalBalance)}
          icon={PiggyBankIcon}
        />
        <MetricCard
          label="Total Allocated"
          value={formatCurrency(overview.totalAllocated)}
          icon={ArrowUpIcon}
        />
        <MetricCard
          label="Total Spent"
          value={formatCurrency(overview.totalSpent)}
          icon={ArrowDownIcon}
        />
        <MetricCard
          label="Savings Rate"
          value={formatPercent(overview.savingsRate)}
          icon={TrendingUpIcon}
        />
      </div>
    </div>
  );
}
