"use client";

import { Suspense } from "react";
import { TransactionsTable } from "@/components/transactions/transactions-table";

export default function TransactionsPage() {
  return (
    <div className="flex h-full flex-col">
      <Suspense>
        <TransactionsTable />
      </Suspense>
    </div>
  );
}
