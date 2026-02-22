"use client"

import { useState, useMemo } from "react"
import { CheckIcon, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

export interface SearchableSelectOption {
  value: string
  label: string
  group?: string
  searchTerms?: string[]
  disabled?: boolean
  render?: React.ReactNode
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string | null
  onValueChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  allowClear?: boolean
  clearLabel?: string
  noneLabel?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  defaultOpen?: boolean
  "data-qa"?: string
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  allowClear = false,
  clearLabel = "None",
  noneLabel,
  disabled = false,
  className,
  triggerClassName,
  defaultOpen = false,
  "data-qa": dataQa,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(defaultOpen)

  // When inside a Radix Sheet/Dialog, react-remove-scroll blocks wheel events
  // on portaled content outside the scroll-lock container. Portal the Popover
  // into the Sheet content so it's recognized as "inside" the locked area.
  const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null)
  const portalContainer = useMemo(
    () => triggerEl?.closest<HTMLElement>("[data-slot='sheet-content']") ?? undefined,
    [triggerEl],
  )

  const selectedOption = options.find((option) => option.value === value)
  const displayLabel = selectedOption?.label
    ?? (value === "__none__" && noneLabel ? noneLabel : null)
    ?? (value === null && allowClear ? clearLabel : null)

  // Group options by their group property
  const grouped = new Map<string, SearchableSelectOption[]>()
  const ungrouped: SearchableSelectOption[] = []

  for (const option of options) {
    if (option.group) {
      const existing = grouped.get(option.group)
      if (existing) {
        existing.push(option)
      } else {
        grouped.set(option.group, [option])
      }
    } else {
      ungrouped.push(option)
    }
  }

  const hasGroups = grouped.size > 0

  const handleSelect = (selectedValue: string) => {
    if (selectedValue === "__clear__") {
      onValueChange(null)
    } else if (selectedValue === "__none__") {
      onValueChange(value === "__none__" ? null : "__none__")
    } else {
      onValueChange(selectedValue === value ? null : selectedValue)
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={setTriggerEl}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 h-9 font-normal",
            triggerClassName
          )}
          data-qa={dataQa}
        >
          <span className={cn("truncate", !displayLabel && "text-muted-foreground")}>
            {displayLabel ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[--radix-popover-trigger-width] p-0", className)} align="start" container={portalContainer}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {(allowClear || noneLabel) && (
              <CommandGroup>
                {allowClear && (
                  <CommandItem
                    value="__clear__"
                    keywords={[clearLabel]}
                    onSelect={handleSelect}
                  >
                    <CheckIcon
                      className={cn("size-4 shrink-0", value === null ? "opacity-100" : "opacity-0")}
                    />
                    <span className="text-muted-foreground">{clearLabel}</span>
                  </CommandItem>
                )}
                {noneLabel && (
                  <CommandItem
                    value="__none__"
                    keywords={[noneLabel]}
                    onSelect={handleSelect}
                  >
                    <CheckIcon
                      className={cn("size-4 shrink-0", value === "__none__" ? "opacity-100" : "opacity-0")}
                    />
                    <span className="text-muted-foreground">{noneLabel}</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}
            {(allowClear || noneLabel) && (ungrouped.length > 0 || hasGroups) && <CommandSeparator />}
            {hasGroups ? (
              <>
                {Array.from(grouped.entries()).map(([groupName, groupOptions]) => (
                  <CommandGroup key={groupName} heading={groupName}>
                    {groupOptions.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        keywords={option.searchTerms ? [option.label, ...option.searchTerms] : [option.label]}
                        disabled={option.disabled}
                        onSelect={handleSelect}
                      >
                        <CheckIcon
                          className={cn("size-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")}
                        />
                        {option.render ?? option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
                {ungrouped.length > 0 && (
                  <CommandGroup>
                    {ungrouped.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        keywords={option.searchTerms ? [option.label, ...option.searchTerms] : [option.label]}
                        disabled={option.disabled}
                        onSelect={handleSelect}
                      >
                        <CheckIcon
                          className={cn("size-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")}
                        />
                        {option.render ?? option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            ) : (
              <CommandGroup>
                {ungrouped.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={option.searchTerms ? [option.label, ...option.searchTerms] : [option.label]}
                    disabled={option.disabled}
                    onSelect={handleSelect}
                  >
                    <CheckIcon
                      className={cn("size-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")}
                    />
                    {option.render ?? option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
