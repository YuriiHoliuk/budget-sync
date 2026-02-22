"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreateTransactionDocument,
  GetTransactionsDocument,
  GetAccountsDocument,
  AccountSource,
  TransactionTypeEnum,
} from "@/graphql/generated/graphql";

interface CreateTransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTransactionSheet({
  open,
  onOpenChange,
}: CreateTransactionSheetProps) {
  const [accountId, setAccountId] = useState<string>("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionTypeEnum>(TransactionTypeEnum.Debit);
  const [description, setDescription] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const { data: accountsData } = useQuery(GetAccountsDocument, {
    variables: { activeOnly: true },
  });

  const manualAccounts = accountsData?.accounts.filter(
    (account) => account.source === AccountSource.Manual,
  ) ?? [];

  const [createTransaction, { loading }] = useMutation(CreateTransactionDocument, {
    refetchQueries: [{ query: GetTransactionsDocument }],
  });

  const parsedAmount = Number.parseFloat(amount);
  const isValidAmount = !Number.isNaN(parsedAmount) && parsedAmount > 0;

  const selectedAccount = manualAccounts.find(
    (account) => account.id.toString() === accountId,
  );

  const canSubmit =
    accountId !== "" &&
    isValidAmount &&
    description.trim() !== "" &&
    date !== "" &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

    try {
      await createTransaction({
        variables: {
          input: {
            accountId: Number.parseInt(accountId, 10),
            date,
            amount: parsedAmount,
            type,
            description: description.trim(),
            ...(counterpartyName.trim() ? { counterpartyName: counterpartyName.trim() } : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          },
        },
      });
      handleClose();
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to create transaction";
      setError(message);
    }
  };

  const handleClose = () => {
    setAccountId("");
    setDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setType(TransactionTypeEnum.Debit);
    setDescription("");
    setCounterpartyName("");
    setNotes("");
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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-md" data-qa="sheet-create-transaction">
        <SheetHeader>
          <SheetTitle>Add Transaction</SheetTitle>
          <SheetDescription>
            Record a manual transaction on a non-synced account.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tx-account">Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="tx-account" className="w-full" data-qa="select-tx-account">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {manualAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name} ({account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {manualAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No manual accounts available. Create one first.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                data-qa="input-tx-date"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tx-amount">
                Amount{selectedAccount ? ` (${selectedAccount.currency})` : ""}
              </Label>
              <Input
                id="tx-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="tabular-nums"
                data-qa="input-tx-amount"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tx-type">Type</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as TransactionTypeEnum)}
              >
                <SelectTrigger id="tx-type" className="w-full" data-qa="select-tx-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TransactionTypeEnum.Debit}>
                    Expense
                  </SelectItem>
                  <SelectItem value={TransactionTypeEnum.Credit}>
                    Income
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tx-description">Description</Label>
              <Input
                id="tx-description"
                placeholder="e.g., Coffee, Groceries, Salary"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSubmit) {
                    handleSubmit();
                  }
                }}
                data-qa="input-tx-description"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tx-counterparty">Counterparty (Optional)</Label>
              <Input
                id="tx-counterparty"
                placeholder="e.g., Starbucks, Employer"
                value={counterpartyName}
                onChange={(event) => setCounterpartyName(event.target.value)}
                data-qa="input-tx-counterparty"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tx-notes">Notes (Optional)</Label>
              <Textarea
                id="tx-notes"
                placeholder="Add any additional notes..."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                data-qa="input-tx-notes"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-qa="btn-create-transaction">
            {loading ? "Adding..." : "Add Transaction"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
