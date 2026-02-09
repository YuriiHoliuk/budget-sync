"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

interface MonthContextValue {
  month: string;
  setMonth: (month: string) => void;
}

const MonthContext = createContext<MonthContextValue | null>(null);

export function MonthProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ month?: string }>();
  const router = useRouter();

  const month = useMemo(() => {
    if (params.month && MONTH_PATTERN.test(params.month)) {
      return params.month;
    }
    return getCurrentMonth();
  }, [params.month]);

  const setMonth = useCallback(
    (newMonth: string) => {
      if (!MONTH_PATTERN.test(newMonth)) return;

      router.push(`/budgets/${newMonth}`);
    },
    [router],
  );

  const value = useMemo(() => ({ month, setMonth }), [month, setMonth]);

  return (
    <MonthContext.Provider value={value}>{children}</MonthContext.Provider>
  );
}

export function useMonth(): MonthContextValue {
  const context = useContext(MonthContext);
  if (!context) {
    throw new Error("useMonth must be used within a MonthProvider");
  }
  return context;
}
