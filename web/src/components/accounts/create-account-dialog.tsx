"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
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
import {
  CreateAccountDocument,
  GetAccountsDocument,
  AccountType,
  AccountRole,
} from "@/graphql/generated/graphql";

interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCOUNT_TYPE_OPTIONS = [
  {
    value: AccountType.Debit,
    label: "Debit Card",
    description: "Standard debit account for everyday spending.",
  },
  {
    value: AccountType.Credit,
    label: "Credit Card",
    description: "Credit account with a credit limit.",
  },
  {
    value: AccountType.Fop,
    label: "FOP (Business)",
    description: "Individual entrepreneur business account.",
  },
];

const ACCOUNT_ROLE_OPTIONS = [
  {
    value: AccountRole.Operational,
    label: "Operational",
    description: "Day-to-day spending and income. Feeds into Ready to Assign.",
  },
  {
    value: AccountRole.Savings,
    label: "Savings",
    description: "Long-term savings. Tracked separately from operational funds.",
  },
];

const CURRENCY_OPTIONS = [
  { value: "UAH", label: "UAH (Ukrainian Hryvnia)" },
  { value: "USD", label: "USD (US Dollar)" },
  { value: "EUR", label: "EUR (Euro)" },
];

export function CreateAccountDialog({
  open,
  onOpenChange,
}: CreateAccountDialogProps) {
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>(AccountType.Debit);
  const [accountRole, setAccountRole] = useState<AccountRole>(AccountRole.Operational);
  const [currency, setCurrency] = useState("UAH");
  const [balance, setBalance] = useState("");
  const [iban, setIban] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [error, setError] = useState("");

  const [createAccount, { loading }] = useMutation(CreateAccountDocument, {
    refetchQueries: [{ query: GetAccountsDocument, variables: { activeOnly: true } }],
  });

  const parsedBalance = Number.parseFloat(balance);
  const isValidBalance = !Number.isNaN(parsedBalance);

  const parsedCreditLimit = creditLimit ? Number.parseFloat(creditLimit) : null;
  const isValidCreditLimit =
    !creditLimit || (!Number.isNaN(parsedCreditLimit) && (parsedCreditLimit ?? 0) >= 0);

  const isCreditAccount = accountType === AccountType.Credit;

  const canSubmit =
    name.trim() !== "" &&
    isValidBalance &&
    isValidCreditLimit &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

    try {
      await createAccount({
        variables: {
          input: {
            name: name.trim(),
            type: accountType,
            role: accountRole,
            currency,
            balance: parsedBalance,
            ...(iban.trim() ? { iban: iban.trim() } : {}),
            ...(isCreditAccount && parsedCreditLimit !== null
              ? { creditLimit: parsedCreditLimit }
              : {}),
          },
        },
      });
      handleClose();
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to create account";
      setError(message);
    }
  };

  const handleClose = () => {
    setName("");
    setAccountType(AccountType.Debit);
    setAccountRole(AccountRole.Operational);
    setCurrency("UAH");
    setBalance("");
    setIban("");
    setCreditLimit("");
    setError("");
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleClose();
    } else {
      onOpenChange(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Account</DialogTitle>
          <DialogDescription>
            Add a manual account to track cash, other banks, or external accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              placeholder="e.g., Cash, Savings Account, PrivatBank"
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
            <Label htmlFor="account-type">Type</Label>
            <Select
              value={accountType}
              onValueChange={(value) => {
                setAccountType(value as AccountType);
                if (value !== AccountType.Credit) {
                  setCreditLimit("");
                }
              }}
            >
              <SelectTrigger id="account-type" className="w-full">
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
            <p className="text-xs text-muted-foreground">
              {ACCOUNT_TYPE_OPTIONS.find((opt) => opt.value === accountType)
                ?.description}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="account-role">Role</Label>
            <Select
              value={accountRole}
              onValueChange={(value) => setAccountRole(value as AccountRole)}
            >
              <SelectTrigger id="account-role" className="w-full">
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
            <p className="text-xs text-muted-foreground">
              {ACCOUNT_ROLE_OPTIONS.find((opt) => opt.value === accountRole)
                ?.description}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="account-currency">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="account-currency" className="w-full">
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
            <Label htmlFor="account-balance">Initial Balance</Label>
            <Input
              id="account-balance"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
              className="tabular-nums"
            />
            <p className="text-xs text-muted-foreground">
              Current account balance. Can be negative for credit accounts.
            </p>
          </div>

          {isCreditAccount && (
            <div className="grid gap-2">
              <Label htmlFor="account-credit-limit">Credit Limit</Label>
              <Input
                id="account-credit-limit"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={creditLimit}
                onChange={(event) => setCreditLimit(event.target.value)}
                className="tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Maximum credit available on this account.
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="account-iban">IBAN (Optional)</Label>
            <Input
              id="account-iban"
              placeholder="UA..."
              value={iban}
              onChange={(event) => setIban(event.target.value)}
              className="font-mono"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {loading ? "Adding..." : "Add Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
