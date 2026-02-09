"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(month: string): { year: number; monthIndex: number } {
  const [year, monthNum] = month.split("-").map(Number);
  return { year, monthIndex: monthNum - 1 };
}

function formatMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

interface MonthPickerProps {
  selectedMonth: string;
  onSelect: (month: string) => void;
  children: ReactNode;
}

export function MonthPicker({
  selectedMonth,
  onSelect,
  children,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const { year: selectedYear } = parseMonth(selectedMonth);
  const [displayYear, setDisplayYear] = useState(selectedYear);
  const currentMonth = getCurrentMonth();

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDisplayYear(parseMonth(selectedMonth).year);
    }
    setOpen(nextOpen);
  };

  const handleSelect = (monthIndex: number) => {
    onSelect(formatMonth(displayYear, monthIndex));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="center">
        <div className="flex items-center justify-between mb-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setDisplayYear((year) => year - 1)}
            aria-label="Previous year"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="text-sm font-medium">{displayYear}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setDisplayYear((year) => year + 1)}
            aria-label="Next year"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {MONTH_LABELS.map((label, monthIndex) => {
            const monthValue = formatMonth(displayYear, monthIndex);
            const isSelected = monthValue === selectedMonth;
            const isCurrent = monthValue === currentMonth;

            return (
              <Button
                key={label}
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 text-xs",
                  isCurrent && !isSelected && "border border-primary",
                )}
                onClick={() => handleSelect(monthIndex)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
