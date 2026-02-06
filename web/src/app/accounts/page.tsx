"use client";

import { AccountsTable } from "@/components/accounts/accounts-table";

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your bank accounts and track balances.
        </p>
      </div>
      <AccountsTable />
    </div>
  );
}
