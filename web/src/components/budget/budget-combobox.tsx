"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/format"
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select"
import { NONE_FILTER } from "@/components/categories/category-combobox"

interface BudgetComboboxProps {
  budgets: Array<{ id: number; name: string; transactionCount?: number }>
  value: number | null
  onValueChange: (budgetId: number | null) => void
  allowNone?: boolean
  allowAll?: boolean
  disabledIds?: number[]
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  defaultOpen?: boolean
  "data-qa"?: string
  showBalance?: boolean
  balanceMap?: Map<number, number>
}

export function BudgetCombobox({
  budgets,
  value,
  onValueChange,
  allowNone = false,
  allowAll = false,
  disabledIds,
  placeholder = "Select budget...",
  disabled = false,
  className,
  triggerClassName,
  defaultOpen,
  "data-qa": dataQa,
  showBalance = false,
  balanceMap,
}: BudgetComboboxProps) {
  const options = useMemo(() => {
    const sorted = [...budgets].sort((a, b) =>
      (b.transactionCount ?? 0) - (a.transactionCount ?? 0) || a.name.localeCompare(b.name)
    )
    return sorted.map((budget): SearchableSelectOption => {
      const balance = balanceMap?.get(budget.id)
      const isDisabled = disabledIds?.includes(budget.id) ?? false

      return {
        value: budget.id.toString(),
        label: budget.name,
        disabled: isDisabled,
        render: showBalance && balance !== undefined ? (
          <span className="flex w-full items-center justify-between gap-2">
            <span className="truncate">{budget.name}</span>
            <span className={cn(
              "shrink-0 text-xs tabular-nums",
              balance < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
            )}>
              {formatCurrency(balance)}
            </span>
          </span>
        ) : undefined,
      }
    })
  }, [budgets, disabledIds, showBalance, balanceMap])

  const handleValueChange = (stringValue: string | null) => {
    if (stringValue === "__none__") {
      onValueChange(NONE_FILTER)
      return
    }
    if (stringValue === null) {
      onValueChange(null)
      return
    }
    onValueChange(parseInt(stringValue, 10))
  }

  const effectiveValue = value === NONE_FILTER ? "__none__"
    : allowAll && value === null ? null
    : value?.toString() ?? null

  return (
    <SearchableSelect
      options={options}
      value={effectiveValue}
      onValueChange={handleValueChange}
      placeholder={allowAll ? "All budgets" : placeholder}
      searchPlaceholder="Search budgets..."
      emptyMessage="No budgets found."
      allowClear={allowNone || allowAll}
      clearLabel={allowAll ? "All budgets" : "No budget"}
      noneLabel={allowAll ? "No budget" : undefined}
      disabled={disabled}
      className={className}
      triggerClassName={triggerClassName}
      defaultOpen={defaultOpen}
      data-qa={dataQa}
    />
  )
}
