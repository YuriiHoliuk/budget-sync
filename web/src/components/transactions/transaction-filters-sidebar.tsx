"use client";

import { useState, useEffect } from "react";
import { Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TransactionTypeEnum,
  CategorizationStatusEnum,
} from "@/graphql/generated/graphql";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export interface TransactionFilters {
  search: string;
  accountId: number | null;
  categoryId: number | null;
  budgetId: number | null;
  type: TransactionTypeEnum | null;
  status: CategorizationStatusEnum | null;
  dateFrom: string;
  dateTo: string;
}

export const emptyFilters: TransactionFilters = {
  search: "",
  accountId: null,
  categoryId: null,
  budgetId: null,
  type: null,
  status: null,
  dateFrom: "",
  dateTo: "",
};

export function countActiveFilters(filters: TransactionFilters): number {
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

export function hasUnappliedChanges(
  draft: TransactionFilters,
  applied: TransactionFilters,
): boolean {
  return (
    draft.search !== applied.search ||
    draft.accountId !== applied.accountId ||
    draft.categoryId !== applied.categoryId ||
    draft.budgetId !== applied.budgetId ||
    draft.type !== applied.type ||
    draft.status !== applied.status ||
    draft.dateFrom !== applied.dateFrom ||
    draft.dateTo !== applied.dateTo
  );
}

interface TransactionFiltersSidebarProps {
  filters: TransactionFilters;
  appliedFilters: TransactionFilters;
  accounts: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string; fullPath: string }>;
  budgets: Array<{ id: number; name: string }>;
  activeFilterCount: number;
  onFilterChange: (key: keyof TransactionFilters, value: string | number | null) => void;
  onApply: () => void;
  onReset: () => void;
}

export function TransactionFiltersSidebar({
  filters,
  appliedFilters,
  accounts,
  categories,
  budgets,
  activeFilterCount,
  onFilterChange,
  onApply,
  onReset,
}: TransactionFiltersSidebarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [prevFilterSearch, setPrevFilterSearch] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const hasPendingChanges = hasUnappliedChanges(filters, appliedFilters);

  // Sync local search input when filters are reset externally (React-recommended pattern)
  if (filters.search !== prevFilterSearch) {
    setPrevFilterSearch(filters.search);
    setSearchInput(filters.search);
  }

  // Sync debounced search value to draft filters
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFilterChange("search", debouncedSearch);
    }
  }, [debouncedSearch, filters.search, onFilterChange]);

  return (
    <div className="flex h-full flex-col" data-qa="filters-sidebar">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Filters</h3>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="h-5 w-5 rounded-full p-0 text-xs" data-qa="badge-active-filters">
              {activeFilterCount}
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-5 flex-1 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-8 pl-8 text-sm"
              data-qa="input-search"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Account</Label>
          <Select
            value={filters.accountId?.toString() ?? "all"}
            onValueChange={(value) =>
              onFilterChange("accountId", value === "all" ? null : parseInt(value, 10))
            }
          >
            <SelectTrigger className="h-8 text-sm" data-qa="select-account-filter">
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

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select
            value={filters.categoryId?.toString() ?? "all"}
            onValueChange={(value) =>
              onFilterChange("categoryId", value === "all" ? null : parseInt(value, 10))
            }
          >
            <SelectTrigger className="h-8 text-sm" data-qa="select-category-filter">
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

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Budget</Label>
          <Select
            value={filters.budgetId?.toString() ?? "all"}
            onValueChange={(value) =>
              onFilterChange("budgetId", value === "all" ? null : parseInt(value, 10))
            }
          >
            <SelectTrigger className="h-8 text-sm" data-qa="select-budget-filter">
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

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Select
            value={filters.type ?? "all"}
            onValueChange={(value) =>
              onFilterChange("type", value === "all" ? null : (value as TransactionTypeEnum))
            }
          >
            <SelectTrigger className="h-8 text-sm" data-qa="select-type-filter">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value={TransactionTypeEnum.Debit}>Expense</SelectItem>
              <SelectItem value={TransactionTypeEnum.Credit}>Income</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select
            value={filters.status ?? "all"}
            onValueChange={(value) =>
              onFilterChange("status", value === "all" ? null : (value as CategorizationStatusEnum))
            }
          >
            <SelectTrigger className="h-8 text-sm" data-qa="select-status-filter">
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

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Date range</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => onFilterChange("dateFrom", event.target.value)}
              className="h-8 text-sm"
              placeholder="From"
            />
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(event) => onFilterChange("dateTo", event.target.value)}
              className="h-8 text-sm"
              placeholder="To"
            />
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1"
          onClick={onReset}
          disabled={countActiveFilters(filters) === 0 && !hasPendingChanges}
          data-qa="btn-reset-filters"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
        <Button
          variant={hasPendingChanges ? "default" : "secondary"}
          size="sm"
          className="flex-1"
          onClick={onApply}
          disabled={!hasPendingChanges}
          data-qa="btn-apply-filters"
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
