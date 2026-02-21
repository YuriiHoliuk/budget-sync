"use client"

import { useMemo } from "react"
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select"

interface CategoryComboboxProps {
  categories: Array<{ id: number; name: string; fullPath: string; parentName?: string | null; transactionCount?: number }>
  value: number | null
  onValueChange: (categoryId: number | null) => void
  allowNone?: boolean
  allowAll?: boolean
  rootOnly?: boolean
  excludeIds?: number[]
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  defaultOpen?: boolean
  "data-qa"?: string
}

export function CategoryCombobox({
  categories,
  value,
  onValueChange,
  allowNone = false,
  allowAll = false,
  rootOnly = false,
  excludeIds,
  placeholder = "Select category...",
  disabled = false,
  className,
  triggerClassName,
  defaultOpen,
  "data-qa": dataQa,
}: CategoryComboboxProps) {
  const options = useMemo(() => {
    let filtered = categories
    if (excludeIds && excludeIds.length > 0) {
      filtered = filtered.filter((category) => !excludeIds.includes(category.id))
    }
    if (rootOnly) {
      filtered = filtered.filter((category) => !category.parentName)
    }

    const sorted = [...filtered].sort((a, b) =>
      (b.transactionCount ?? 0) - (a.transactionCount ?? 0) || a.name.localeCompare(b.name)
    )

    return sorted.map((category): SearchableSelectOption => ({
      value: category.id.toString(),
      label: rootOnly ? category.name : category.fullPath,
      group: !rootOnly && category.parentName ? category.parentName : undefined,
      searchTerms: [category.name, category.fullPath],
    }))
  }, [categories, excludeIds, rootOnly])

  const handleValueChange = (stringValue: string | null) => {
    if (stringValue === null || stringValue === "all") {
      onValueChange(allowAll && stringValue === "all" ? null : null)
      return
    }
    onValueChange(parseInt(stringValue, 10))
  }

  const effectiveValue = allowAll && value === null ? null : value?.toString() ?? null

  return (
    <SearchableSelect
      options={options}
      value={effectiveValue}
      onValueChange={handleValueChange}
      placeholder={allowAll ? "All categories" : placeholder}
      searchPlaceholder="Search categories..."
      emptyMessage="No categories found."
      allowClear={allowNone}
      clearLabel="No category"
      disabled={disabled}
      className={className}
      triggerClassName={triggerClassName}
      defaultOpen={defaultOpen}
      data-qa={dataQa}
    />
  )
}
