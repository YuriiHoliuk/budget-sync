"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import {
  CreditCard,
  Building2,
  Wallet,
  MoreHorizontal,
  Pencil,
  Archive,
  Plus,
  RefreshCw,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GetAccountsDocument,
  GetAccountDocument,
  AccountRole,
  AccountType,
  AccountSource,
  type GetAccountsQuery,
} from "@/graphql/generated/graphql";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreateAccountDialog } from "./create-account-dialog";
import { EditAccountDialog } from "./edit-account-dialog";
import { ArchiveAccountDialog } from "./archive-account-dialog";

type Account = GetAccountsQuery["accounts"][number];

const ROLE_LABELS: Record<AccountRole, string> = {
  [AccountRole.Operational]: "Operational",
  [AccountRole.Savings]: "Savings",
};

const TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.Debit]: "Debit",
  [AccountType.Credit]: "Credit",
  [AccountType.Fop]: "FOP",
};

const TYPE_ICONS: Record<AccountType, typeof CreditCard> = {
  [AccountType.Debit]: Wallet,
  [AccountType.Credit]: CreditCard,
  [AccountType.Fop]: Building2,
};

function formatIban(iban: string | null | undefined): string {
  if (!iban) return "—";
  // Show first 4 and last 4 characters
  if (iban.length <= 8) return iban;
  return `${iban.slice(0, 4)}...${iban.slice(-4)}`;
}

function formatLastSyncTime(lastSyncTime: string | null | undefined): string {
  if (!lastSyncTime) return "Never";
  const date = new Date(lastSyncTime);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  }
  if (diffHours > 0) {
    return `${diffHours}h ago`;
  }
  return "Just now";
}

interface AccountsTableProps {
  showArchived?: boolean;
}

export function AccountsTable({ showArchived = false }: AccountsTableProps) {
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [editAccountDialogOpen, setEditAccountDialogOpen] = useState(false);
  const [archiveAccountDialogOpen, setArchiveAccountDialogOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  const { data, loading, error } = useQuery(GetAccountsDocument, {
    variables: { activeOnly: !showArchived },
  });

  const { data: accountData } = useQuery(GetAccountDocument, {
    variables: { id: selectedAccountId ?? 0 },
    skip: selectedAccountId === null,
  });

  const accounts = data?.accounts;
  const groupedAccounts = useMemo(() => {
    if (!accounts) return new Map<AccountRole, Account[]>();

    const groups = new Map<AccountRole, Account[]>();
    const roleOrder: AccountRole[] = [AccountRole.Operational, AccountRole.Savings];

    for (const role of roleOrder) {
      const roleAccounts = accounts.filter((account) => account.role === role);
      if (roleAccounts.length > 0) {
        groups.set(role, roleAccounts);
      }
    }

    return groups;
  }, [accounts]);

  const totalsByRole = useMemo(() => {
    const totals = new Map<AccountRole, number>();
    for (const [role, accounts] of groupedAccounts) {
      totals.set(role, accounts.reduce((sum, acc) => sum + acc.balance, 0));
    }
    return totals;
  }, [groupedAccounts]);

  const handleEditAccount = (accountId: number) => {
    setSelectedAccountId(accountId);
    setEditAccountDialogOpen(true);
  };

  const handleArchiveAccount = (accountId: number) => {
    setSelectedAccountId(accountId);
    setArchiveAccountDialogOpen(true);
  };

  if (loading) {
    return <AccountsTableSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/50 dark:bg-red-950/50">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load accounts: {error.message}
        </p>
      </div>
    );
  }

  const allAccounts = accounts ?? [];
  const selectedAccount = allAccounts.find((acc) => acc.id === selectedAccountId);

  if (allAccounts.length === 0) {
    return (
      <>
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No accounts yet. Add your first account to start tracking your finances.
          </p>
          <Button onClick={() => setCreateAccountOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </div>
        <CreateAccountDialog
          open={createAccountOpen}
          onOpenChange={setCreateAccountOpen}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-2">
        <Button size="sm" onClick={() => setCreateAccountOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[250px]">Account</TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[100px]">Currency</TableHead>
              <TableHead className="w-[150px] text-right">Balance</TableHead>
              <TableHead className="w-[120px]">IBAN</TableHead>
              <TableHead className="w-[100px]">Source</TableHead>
              <TableHead className="w-[80px]">Synced</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from(groupedAccounts.entries()).map(([role, roleAccounts]) => (
              <AccountGroup
                key={role}
                role={role}
                accounts={roleAccounts}
                totalBalance={totalsByRole.get(role) ?? 0}
                onEditAccount={handleEditAccount}
                onArchiveAccount={handleArchiveAccount}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <CreateAccountDialog
        open={createAccountOpen}
        onOpenChange={setCreateAccountOpen}
      />
      {accountData?.account && (
        <EditAccountDialog
          open={editAccountDialogOpen}
          onOpenChange={setEditAccountDialogOpen}
          account={accountData.account}
        />
      )}
      {selectedAccount && (
        <ArchiveAccountDialog
          open={archiveAccountDialogOpen}
          onOpenChange={setArchiveAccountDialogOpen}
          account={{
            id: selectedAccount.id,
            name: selectedAccount.name,
          }}
        />
      )}
    </>
  );
}

interface AccountGroupProps {
  role: AccountRole;
  accounts: Account[];
  totalBalance: number;
  onEditAccount: (accountId: number) => void;
  onArchiveAccount: (accountId: number) => void;
}

function AccountGroup({
  role,
  accounts,
  totalBalance,
  onEditAccount,
  onArchiveAccount,
}: AccountGroupProps) {
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
          {ROLE_LABELS[role]}
        </TableCell>
        <TableCell />
        <TableCell />
        <TableCell className="text-right text-xs font-medium text-muted-foreground">
          {formatCurrency(totalBalance)}
        </TableCell>
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell />
      </TableRow>
      {accounts.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          onEdit={() => onEditAccount(account.id)}
          onArchive={() => onArchiveAccount(account.id)}
        />
      ))}
    </>
  );
}

interface AccountRowProps {
  account: Account;
  onEdit: () => void;
  onArchive: () => void;
}

function AccountRow({ account, onEdit, onArchive }: AccountRowProps) {
  const TypeIcon = TYPE_ICONS[account.type];
  const isSynced = account.source === AccountSource.BankSync;
  const isManual = account.source === AccountSource.Manual;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <TypeIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="font-medium">{account.name}</div>
            {account.bank && (
              <div className="text-xs text-muted-foreground">{account.bank}</div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {TYPE_LABELS[account.type]}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{account.currency}</TableCell>
      <TableCell
        className={cn(
          "text-right font-medium tabular-nums",
          account.balance < 0
            ? "text-red-600 dark:text-red-400"
            : "text-foreground",
        )}
      >
        {formatCurrency(account.balance)}
        {account.isCreditAccount && account.creditLimit && (
          <div className="text-xs text-muted-foreground">
            / {formatCurrency(account.creditLimit)}
          </div>
        )}
      </TableCell>
      <TableCell>
        {account.iban ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground font-mono cursor-help">
                {formatIban(account.iban)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-mono">{account.iban}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {isSynced ? (
          <Badge variant="secondary" className="text-xs gap-1">
            <Link2 className="h-3 w-3" />
            Synced
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            Manual
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {isSynced && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                {formatLastSyncTime(account.lastSyncTime)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Last synced:{" "}
                {account.lastSyncTime
                  ? new Date(account.lastSyncTime).toLocaleString()
                  : "Never"}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            {isManual && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onArchive} variant="destructive">
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function AccountsTableSkeleton() {
  return (
    <div className="rounded-xl border">
      <div className="space-y-0">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-0"
          >
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
