"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams, usePathname, useRouter } from "next/navigation";

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
  const pathname = usePathname();
  const [overrideMonth, setOverrideMonth] = useState<string | null>(null);

  const month = useMemo(() => {
    if (params.month && MONTH_PATTERN.test(params.month)) {
      return params.month;
    }
    return overrideMonth ?? getCurrentMonth();
  }, [params.month, overrideMonth]);

  const setMonth = useCallback(
    (newMonth: string) => {
      if (!MONTH_PATTERN.test(newMonth)) return;

      if (pathname.startsWith("/budgets")) {
        setOverrideMonth(null);
        router.push(`/budgets/${newMonth}`);
      } else {
        setOverrideMonth(newMonth);
      }
    },
    [router, pathname],
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
