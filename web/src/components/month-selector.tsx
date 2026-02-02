"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMonth } from "@/hooks/use-month";

function formatMonthDisplay(month: string): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(Number(year), Number(monthNum) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function MonthSelector() {
  const { month, setMonth } = useMonth();

  const navigateMonth = (direction: -1 | 1) => {
    const [year, monthNum] = month.split("-").map(Number);
    const date = new Date(year, monthNum - 1 + direction);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    setMonth(newMonth);
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => navigateMonth(-1)}
        aria-label="Previous month"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      <span className="min-w-[140px] text-center text-sm font-medium">
        {formatMonthDisplay(month)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => navigateMonth(1)}
        aria-label="Next month"
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}
