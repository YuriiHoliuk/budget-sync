"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import {
  UpdateAccountDocument,
  GetAccountsDocument,
  AccountType,
  AccountRole,
  AccountSource,
  type GetAccountQuery,
} from "@/graphql/generated/graphql";

type Account = NonNullable<GetAccountQuery["account"]>;

interface EditAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account;
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: AccountType.Debit, label: "Debit Card" },
  { value: AccountType.Credit, label: "Credit Card" },
  { value: AccountType.Fop, label: "FOP (Business)" },
];

const ACCOUNT_ROLE_OPTIONS = [
  { value: AccountRole.Operational, label: "Operational" },
  { value: AccountRole.Savings, label: "Savings" },
];

const CURRENCY_OPTIONS = [
  { value: "UAH", label: "UAH" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

// Inner component that resets when account.id changes via key prop
function EditAccountDialogContent({
  account,
  onOpenChange,
}: {
  account: Account;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(account.name);
  const [accountType, setAccountType] = useState<AccountType>(account.type);
  const [accountRole, setAccountRole] = useState<AccountRole>(account.role);
  const [currency, setCurrency] = useState(account.currency);
  const [balance, setBalance] = useState(account.balance.toString());
  const [iban, setIban] = useState(account.iban ?? "");
  const [creditLimit, setCreditLimit] = useState(
    account.creditLimit?.toString() ?? "",
  );
  const [error, setError] = useState("");

  const isSynced = account.source === AccountSource.BankSync;
  const isCreditAccount = accountType === AccountType.Credit;

  const [updateAccount, { loading }] = useMutation(UpdateAccountDocument, {
    refetchQueries: [{ query: GetAccountsDocument, variables: { activeOnly: true } }],
  });

  const parsedBalance = Number.parseFloat(balance);
  const isValidBalance = !Number.isNaN(parsedBalance);

  const parsedCreditLimit = creditLimit ? Number.parseFloat(creditLimit) : null;
  const isValidCreditLimit =
    !creditLimit || (!Number.isNaN(parsedCreditLimit) && (parsedCreditLimit ?? 0) >= 0);

  const canSubmit = name.trim() !== "" && isValidBalance && isValidCreditLimit && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

    try {
      await updateAccount({
        variables: {
          input: {
            id: account.id,
            name: name.trim(),
            type: accountType,
            role: accountRole,
            // Only include currency and iban for manual accounts
            ...(!isSynced ? { currency } : {}),
            balance: parsedBalance,
            ...(!isSynced && iban.trim() ? { iban: iban.trim() } : {}),
            ...(isCreditAccount && parsedCreditLimit !== null
              ? { creditLimit: parsedCreditLimit }
              : {}),
          },
        },
      });
      onOpenChange(false);
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update account";
      setError(message);
    }
  };


  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Account</DialogTitle>
        <DialogDescription>
          Update account details.
          {isSynced && " Some fields are protected for synced accounts."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        {isSynced && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This account is synced from {account.bank || "your bank"}. Currency
              and IBAN cannot be changed.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2">
          <Label htmlFor="edit-account-name">Name</Label>
          <Input
            id="edit-account-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSubmit) {
                handleSubmit();
              }
            }}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-account-type">Type</Label>
          <Select
            value={accountType}
            onValueChange={(value) => {
              setAccountType(value as AccountType);
              if (value !== AccountType.Credit) {
                setCreditLimit("");
              }
            }}
          >
            <SelectTrigger id="edit-account-type" className="w-full">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-account-role">Role</Label>
          <Select
            value={accountRole}
            onValueChange={(value) => setAccountRole(value as AccountRole)}
          >
            <SelectTrigger id="edit-account-role" className="w-full">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-account-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency} disabled={isSynced}>
            <SelectTrigger id="edit-account-currency" className="w-full">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-account-balance">Balance</Label>
          <Input
            id="edit-account-balance"
            type="number"
            step="0.01"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            className="tabular-nums"
          />
        </div>

        {isCreditAccount && (
          <div className="grid gap-2">
            <Label htmlFor="edit-account-credit-limit">Credit Limit</Label>
            <Input
              id="edit-account-credit-limit"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={creditLimit}
              onChange={(event) => setCreditLimit(event.target.value)}
              className="tabular-nums"
            />
          </div>
        )}

        {!isSynced && (
          <div className="grid gap-2">
            <Label htmlFor="edit-account-iban">IBAN</Label>
            <Input
              id="edit-account-iban"
              placeholder="UA..."
              value={iban}
              onChange={(event) => setIban(event.target.value)}
              className="font-mono"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditAccountDialog({
  open,
  onOpenChange,
  account,
}: EditAccountDialogProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <EditAccountDialogContent
          key={account.id}
          account={account}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
