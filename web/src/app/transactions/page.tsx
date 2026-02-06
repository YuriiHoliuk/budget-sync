"use client";

import { TransactionsTable } from "@/components/transactions/transactions-table";

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse and manage your financial transactions.
        </p>
      </div>
      <TransactionsTable />
    </div>
  );
}
