"use client";

import { useState, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Calendar,
  CreditCard,
  Building2,
  Hash,
  FileText,
  Tag,
  Wallet,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  Database,
  RotateCcw,
  Undo2,
  X,
  Scissors,
  Merge,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import { BudgetCombobox } from "@/components/budget/budget-combobox";
import {
  GetTransactionDocument,
  GetCategoriesDocument,
  GetBudgetsDocument,
  GetAccountsDocument,
  UpdateTransactionCategoryDocument,
  UpdateTransactionBudgetDocument,
  UpdateTransactionNotesDocument,
  VerifyTransactionDocument,
  ConvertToTransferDocument,
  RevertTransferDocument,
  RevertReturningDocument,
  JoinTransactionsDocument,
  TransactionTypeEnum,
  CategorizationStatusEnum,
  AccountSource,
  type GetTransactionQuery,
  type BankTransaction,
} from "@/graphql/generated/graphql";
import { SplitTransactionForm } from "@/components/transactions/split-transaction-form";
import { addTransactionsToCache, removeTransactionFromCache, evictSiblingTransactions, invalidateBudgetRelatedCache } from "@/lib/cache-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Transaction = NonNullable<GetTransactionQuery["transaction"]>;
type TransactionSibling = Transaction["siblingTransactions"][number];

interface TransactionDetailPanelProps {
  transactionId: number | null;
  onClose: () => void;
  onStartReturningSelection?: (transactionId: number, amount: number, currency: string) => void;
}

const TYPE_CONFIG: Record<string, { icon: typeof ArrowDownCircle; color: string; bgColor: string; label: string }> = {
  [TransactionTypeEnum.Credit]: {
    icon: ArrowDownCircle,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "Income",
  },
  [TransactionTypeEnum.Debit]: {
    icon: ArrowUpCircle,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    label: "Expense",
  },
  TRANSFER: {
    icon: ArrowLeftRight,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "Transfer",
  },
};

const STATUS_CONFIG = {
  [CategorizationStatusEnum.Pending]: {
    icon: Clock,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    label: "Pending",
    description: "Waiting for AI categorization",
  },
  [CategorizationStatusEnum.Categorized]: {
    icon: AlertCircle,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "AI Categorized",
    description: "Categorized by AI, awaiting verification",
  },
  [CategorizationStatusEnum.Verified]: {
    icon: CheckCircle2,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "Verified",
    description: "Manually verified by user",
  },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const datePart = date.toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

function formatMcc(mcc: number | null | undefined): string {
  if (!mcc) return "N/A";
  return mcc.toString().padStart(4, "0");
}

export function TransactionDetailPanel({
  transactionId,
  onClose,
  onStartReturningSelection,
}: TransactionDetailPanelProps) {
  const isOpen = transactionId !== null;

  const { data, loading } = useQuery(GetTransactionDocument, {
    variables: { id: transactionId ?? 0 },
    skip: !transactionId,
  });

  const { data: categoriesData } = useQuery(GetCategoriesDocument, {
    variables: { activeOnly: true },
  });

  const { data: budgetsData } = useQuery(GetBudgetsDocument, {
    variables: { activeOnly: false },
  });

  const categories = useMemo(
    () => categoriesData?.categories ?? [],
    [categoriesData]
  );
  const budgets = useMemo(
    () => (budgetsData?.budgets ?? []).filter((budget) => !budget.isArchived),
    [budgetsData]
  );

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetTitle className="sr-only">Transaction details</SheetTitle>
        {loading ? (
          <TransactionDetailSkeleton />
        ) : data?.transaction ? (
          <TransactionDetailContent
            key={data.transaction.id}
            transaction={data.transaction}
            categories={categories}
            budgets={budgets}
            onStartReturningSelection={onStartReturningSelection}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">Transaction not found</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface TransactionDetailContentProps {
  transaction: Transaction;
  categories: Array<{ id: number; name: string; fullPath: string }>;
  budgets: Array<{ id: number; name: string; startDate?: string | null; endDate?: string | null }>;
  onStartReturningSelection?: (transactionId: number, amount: number, currency: string) => void;
}

function TransactionDetailContent({
  transaction,
  categories,
  budgets,
  onStartReturningSelection,
}: TransactionDetailContentProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const [bankDataOpen, setBankDataOpen] = useState(false);

  const typeConfig = TYPE_CONFIG[transaction.type] ?? TYPE_CONFIG[TransactionTypeEnum.Debit];
  const statusConfig = STATUS_CONFIG[transaction.categorizationStatus];
  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;

  const isTransfer = transaction.type === TransactionTypeEnum.Transfer;
  const isCredit = transaction.type === TransactionTypeEnum.Credit;
  const isDebit = transaction.type === TransactionTypeEnum.Debit;
  const isVerified =
    transaction.categorizationStatus === CategorizationStatusEnum.Verified;
  const isCategorized =
    transaction.categorizationStatus === CategorizationStatusEnum.Categorized;
  const isManualAccount = transaction.account?.source === AccountSource.Manual;

  const [updateCategory] = useMutation(UpdateTransactionCategoryDocument);

  const [updateBudget] = useMutation(UpdateTransactionBudgetDocument, {
    update(cache) {
      invalidateBudgetRelatedCache(cache);
    },
  });

  const [updateNotes] = useMutation(UpdateTransactionNotesDocument);

  const [verifyTransaction] = useMutation(VerifyTransactionDocument);

  const [convertToTransfer] = useMutation(ConvertToTransferDocument, {
    update(cache, { data }) {
      if (!data?.convertToTransfer) return;
      addTransactionsToCache(cache, [data.convertToTransfer.counterpartTransaction]);
    },
  });

  const pairedTransactionId = transaction.transferPair?.pairedTransactionId ?? null;

  const [revertTransfer] = useMutation(RevertTransferDocument, {
    update(cache) {
      if (pairedTransactionId) {
        removeTransactionFromCache(cache, pairedTransactionId);
      }
    },
  });

  const [revertReturning] = useMutation(RevertReturningDocument, {
    update(cache, { data }) {
      if (!data?.revertReturning) return;
      addTransactionsToCache(cache, data.revertReturning.createdTransactions);
    },
  });

  const [joinTransactions, { loading: joinLoading }] = useMutation(JoinTransactionsDocument, {
    update(cache, { data }, { variables }) {
      if (!data?.joinTransactions || !variables?.input) return;

      const sourceTransactionId = variables.input.sourceTransactionId;

      // Remove the absorbed transaction from the transactions list
      removeTransactionFromCache(cache, sourceTransactionId);

      // Evict stale siblingTransactions from remaining siblings
      const remainingSiblingIds = data.joinTransactions.siblingTransactions
        .map((s) => s.id)
        .filter((id) => id !== data.joinTransactions.id);

      if (remainingSiblingIds.length > 0) {
        evictSiblingTransactions(cache, remainingSiblingIds);
      }
    },
  });

  const { data: accountsData } = useQuery(GetAccountsDocument, {
    variables: { activeOnly: true },
  });

  const manualAccounts = useMemo(
    () =>
      (accountsData?.accounts ?? []).filter(
        (account) =>
          account.source === AccountSource.Manual &&
          account.currency === transaction.currency,
      ),
    [accountsData, transaction.currency],
  );

  const [showTransferForm, setShowTransferForm] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [showSplitForm, setShowSplitForm] = useState(false);
  const [joinTargetSibling, setJoinTargetSibling] = useState<TransactionSibling | null>(null);

  const [notesValue, setNotesValue] = useState(transaction.notes ?? "");
  const [notesSaved, setNotesSaved] = useState(false);
  const notesSavedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleNotesSave = async () => {
    const trimmed = notesValue.trim();
    const newNotes = trimmed === "" ? null : trimmed;
    if (newNotes === (transaction.notes ?? null)) return;

    setIsUpdating(true);
    try {
      await updateNotes({
        variables: { input: { id: transaction.id, notes: newNotes } },
      });
      setNotesSaved(true);
      clearTimeout(notesSavedTimerRef.current);
      notesSavedTimerRef.current = setTimeout(() => setNotesSaved(false), 2000);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCategoryChange = async (categoryId: number | null) => {
    setIsUpdating(true);
    try {
      await updateCategory({
        variables: {
          input: {
            id: transaction.id,
            categoryId,
          },
        },
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBudgetChange = async (budgetId: number | null) => {
    setIsUpdating(true);
    try {
      await updateBudget({
        variables: {
          input: {
            id: transaction.id,
            budgetId,
          },
        },
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleVerify = async () => {
    setIsUpdating(true);
    try {
      await verifyTransaction({
        variables: { id: transaction.id },
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConvertToTransfer = async () => {
    if (!selectedAccountId) return;
    setIsUpdating(true);
    try {
      await convertToTransfer({
        variables: {
          input: {
            transactionId: transaction.id,
            destinationAccountId: Number.parseInt(selectedAccountId, 10),
          },
        },
      });
      setShowTransferForm(false);
      setSelectedAccountId("");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRevertTransfer = async () => {
    setIsUpdating(true);
    try {
      await revertTransfer({
        variables: { transactionId: transaction.id },
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkAsReturning = () => {
    onStartReturningSelection?.(transaction.id, transaction.amount, transaction.currency);
  };

  const handleRevertReturning = async () => {
    setIsUpdating(true);
    try {
      await revertReturning({
        variables: { transactionId: transaction.id },
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleJoinTransaction = async (sourceTransactionId: number) => {
    setIsUpdating(true);
    try {
      await joinTransactions({
        variables: {
          input: {
            targetTransactionId: transaction.id,
            sourceTransactionId,
          },
        },
      });
      setJoinTargetSibling(null);
    } finally {
      setIsUpdating(false);
    }
  };

  const hasSiblings = transaction.siblingTransactions.length > 0;

  const description =
    transaction.counterpartyName || transaction.description || "Unknown";

  const currentBudgetId = transaction.budget?.id ?? null;
  const filteredBudgets = useMemo(() => {
    const txDate = transaction.date;
    return budgets.filter((budget) => {
      if (budget.id === currentBudgetId) return true;
      const afterStart = !budget.startDate || txDate >= budget.startDate;
      const beforeEnd = !budget.endDate || txDate <= budget.endDate;
      return afterStart && beforeEnd;
    });
  }, [budgets, transaction.date, currentBudgetId]);

  return (
    <>
      <SheetHeader className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <SheetTitle className="text-xl">{description}</SheetTitle>
            <SheetDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {formatDate(transaction.date)}
            </SheetDescription>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={cn(
              "gap-1 px-3 py-1 text-base font-semibold",
              typeConfig.bgColor,
              typeConfig.color
            )}
            data-qa="detail-panel-amount"
          >
            <TypeIcon className="h-4 w-4" />
            {transaction.type === TransactionTypeEnum.Debit ? "-" : "+"}
            {formatCurrency(transaction.amount)} {transaction.currency}
          </Badge>

          {!isTransfer && (
            <Badge
              variant="outline"
              className={cn("gap-1", statusConfig.bgColor, statusConfig.color)}
            >
              <StatusIcon className="h-3 w-3" />
              {statusConfig.label}
            </Badge>
          )}
        </div>
      </SheetHeader>

      <div className="mt-6 space-y-6 px-4 pb-6">
        {isTransfer && transaction.transferPair && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Transfer Info
              </h3>
              <div className="rounded-lg border bg-blue-50/50 p-3 dark:bg-blue-900/10">
                <div className="flex items-center gap-2 text-sm">
                  <ArrowLeftRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span>
                    Transfer to{" "}
                    <span className="font-medium">
                      {transaction.transferPair.pairedAccountName ?? "Unknown account"}
                    </span>
                  </span>
                </div>
              </div>
              {transaction.transferPair.isRevertible && (
                <Button
                  onClick={handleRevertTransfer}
                  disabled={isUpdating}
                  variant="outline"
                  className="w-full"
                >
                  {isUpdating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Undo2 className="mr-2 h-4 w-4" />
                  )}
                  Revert Transfer
                </Button>
              )}
            </div>
            <Separator />
          </>
        )}

        {!isTransfer && !showTransferForm && !showSplitForm && (
          <>
            <div className="flex flex-wrap gap-2">
              {manualAccounts.length > 0 && (
                <Button
                  onClick={() => setShowTransferForm(true)}
                  disabled={isUpdating}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Transfer
                </Button>
              )}
              {isCredit && (
                <Button
                  onClick={handleMarkAsReturning}
                  disabled={isUpdating}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  data-qa="btn-mark-as-returning"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Returning
                </Button>
              )}
              <Button
                onClick={() => setShowSplitForm(true)}
                disabled={isUpdating}
                variant="outline"
                size="sm"
                className="gap-1.5"
                data-qa="btn-split-transaction"
              >
                <Scissors className="h-3.5 w-3.5" />
                Split
              </Button>
            </div>
            <Separator />
          </>
        )}

        {!isTransfer && showTransferForm && !showSplitForm && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Convert to Transfer
              </h3>
              <div className="grid gap-3">
                <Select
                  value={selectedAccountId}
                  onValueChange={setSelectedAccountId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination account" />
                  </SelectTrigger>
                  <SelectContent>
                    {manualAccounts.map((account) => (
                      <SelectItem
                        key={account.id}
                        value={account.id.toString()}
                      >
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    onClick={handleConvertToTransfer}
                    disabled={isUpdating || !selectedAccountId}
                    className="flex-1"
                  >
                    {isUpdating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Confirm
                  </Button>
                  <Button
                    onClick={() => {
                      setShowTransferForm(false);
                      setSelectedAccountId("");
                    }}
                    disabled={isUpdating}
                    variant="outline"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <Separator />
          </>
        )}

        {isDebit && transaction.returningInfo && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Return Info
              </h3>
              <div className="rounded-lg border bg-amber-50/50 p-3 dark:bg-amber-900/10">
                <p className="text-sm">
                  This transaction has a return of{" "}
                  <span className="font-medium">
                    {formatCurrency(transaction.returningInfo.returningAmount)} {transaction.currency}
                  </span>
                </p>
              </div>
              {transaction.returningInfo.isRevertible && (
                <Button
                  onClick={handleRevertReturning}
                  disabled={isUpdating}
                  variant="outline"
                  className="w-full"
                  data-qa="btn-revert-returning"
                >
                  {isUpdating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Undo2 className="mr-2 h-4 w-4" />
                  )}
                  Revert Return
                </Button>
              )}
            </div>
            <Separator />
          </>
        )}

        {!isTransfer && showSplitForm && (
          <>
            <SplitTransactionForm
              transactionId={transaction.id}
              transactionAmount={transaction.amount}
              currency={transaction.currency}
              onComplete={() => setShowSplitForm(false)}
              onCancel={() => setShowSplitForm(false)}
            />
            <Separator />
          </>
        )}

        {hasSiblings && (
          <>
            <div className="space-y-3" data-qa="split-group">
              <h3 className="text-sm font-medium text-muted-foreground">
                Split Group
              </h3>
              <div className="space-y-2">
                {transaction.siblingTransactions.map((sibling, siblingIndex) => (
                  <div
                    key={sibling.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                    data-qa={`sibling-item-${siblingIndex}`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium" data-qa={`sibling-description-${siblingIndex}`}>
                          {sibling.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="tabular-nums font-medium" data-qa={`sibling-amount-${siblingIndex}`}>
                          {formatCurrency(sibling.amount)} {sibling.currency}
                        </span>
                        {sibling.category && (
                          <>
                            <span>·</span>
                            <span>{sibling.category.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 shrink-0 gap-1 text-xs"
                      onClick={() => setJoinTargetSibling(sibling)}
                      disabled={isUpdating}
                      data-qa={`btn-join-sibling-${siblingIndex}`}
                    >
                      <Merge className="h-3.5 w-3.5" />
                      Join
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
          </>
        )}

        {!isTransfer && !showSplitForm && (
          <>
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Classification
              </h3>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="category" className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Category
                  </Label>
                  <CategoryCombobox
                    categories={categories}
                    value={transaction.category?.id ?? null}
                    onValueChange={handleCategoryChange}
                    allowNone
                    disabled={isUpdating}
                    triggerClassName="w-full"
                    data-qa="select-category"
                  />
                  {transaction.categoryReason && (
                    <AIReasoningNote reason={transaction.categoryReason} />
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="budget" className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Budget
                  </Label>
                  <BudgetCombobox
                    budgets={filteredBudgets}
                    value={transaction.budget?.id ?? null}
                    onValueChange={handleBudgetChange}
                    allowNone
                    disabled={isUpdating}
                    triggerClassName="w-full"
                    data-qa="select-budget"
                  />
                  {transaction.budgetReason && (
                    <AIReasoningNote reason={transaction.budgetReason} />
                  )}
                </div>
              </div>

              {!isVerified && (
                <Button
                  onClick={handleVerify}
                  disabled={isUpdating}
                  className={cn(
                    "w-full",
                    isCategorized && "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                  )}
                  variant={isCategorized ? "outline" : "outline"}
                >
                  {isUpdating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  {isCategorized ? "Approve AI Categorization" : "Verify Categorization"}
                </Button>
              )}
            </div>

            <Separator />
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="notes" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileText className="h-4 w-4" />
            Notes
            {notesSaved && (
              <span className="ml-auto text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Saved
              </span>
            )}
          </Label>
          <Textarea
            id="notes"
            placeholder="Add notes..."
            value={notesValue}
            onChange={(event) => setNotesValue(event.target.value)}
            onBlur={handleNotesSave}
            disabled={isUpdating}
            rows={3}
            className="resize-none"
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Transaction Details
          </h3>

          <div className="grid gap-3 text-sm">
            <DetailRow
              icon={CreditCard}
              label="Account"
              value={transaction.account?.name ?? "Unknown"}
              badge={isManualAccount ? "Manual" : "Synced"}
            />

            {transaction.counterpartyName && (
              <DetailRow
                icon={Building2}
                label="Counterparty"
                value={transaction.counterpartyName}
              />
            )}

            {transaction.counterpartyIban && (
              <DetailRow
                icon={CreditCard}
                label="IBAN"
                value={transaction.counterpartyIban}
                mono
              />
            )}

            {transaction.mcc && (
              <DetailRow
                icon={Hash}
                label="MCC"
                value={formatMcc(transaction.mcc)}
                mono
              />
            )}

          </div>
        </div>

        {transaction.bankTransactionCount > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setBankDataOpen((prev) => !prev)}
                className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span>
                    {transaction.bankTransactionCount} bank transaction
                    {transaction.bankTransactionCount !== 1 ? "s" : ""} linked
                  </span>
                </div>
                {bankDataOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {bankDataOpen && (
                <div className="space-y-4">
                  {transaction.bankTransactions.map(
                    (bankTxn) => (
                      <BankTransactionCard key={bankTxn.id} bankTransaction={bankTxn} />
                    )
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <Separator />

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Identifiers
          </h3>
          <div className="grid gap-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Internal ID</span>
              <span className="font-mono">{transaction.id}</span>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={joinTargetSibling !== null}
        onOpenChange={(open) => {
          if (!open) setJoinTargetSibling(null);
        }}
      >
        <DialogContent className="sm:max-w-[400px]" data-qa="dialog-join-confirmation">
          <DialogHeader>
            <DialogTitle>Join Transactions</DialogTitle>
            <DialogDescription>
              Merge a sibling transaction into this one.
            </DialogDescription>
          </DialogHeader>

          {joinTargetSibling && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                This will merge{" "}
                <span className="font-medium text-foreground">
                  {joinTargetSibling.description}
                </span>{" "}
                ({formatCurrency(joinTargetSibling.amount)} {joinTargetSibling.currency})
                into this transaction, keeping this transaction&apos;s category and budget.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setJoinTargetSibling(null)}
              disabled={joinLoading}
              data-qa="btn-join-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (joinTargetSibling) {
                  handleJoinTransaction(joinTargetSibling.id);
                }
              }}
              disabled={joinLoading}
              data-qa="btn-join-confirm"
            >
              {joinLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <Merge className="mr-2 h-4 w-4" />
                  Confirm Join
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface BankTransactionCardProps {
  bankTransaction: BankTransaction;
}

function BankTransactionCard({ bankTransaction }: BankTransactionCardProps) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
          {bankTransaction.externalId}
        </span>
        {bankTransaction.hold && (
          <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            Hold
          </Badge>
        )}
      </div>

      <div className="grid gap-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date</span>
          <span>{formatDate(bankTransaction.date)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-medium tabular-nums">
            {formatCurrency(bankTransaction.amount)} {bankTransaction.currency}
          </span>
        </div>
        {bankTransaction.bankDescription && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground shrink-0">Description</span>
            <span className="text-right truncate">{bankTransaction.bankDescription}</span>
          </div>
        )}
        {bankTransaction.balanceAfter != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Balance After</span>
            <span className="font-mono tabular-nums">
              {formatCurrency(bankTransaction.balanceAfter)} {bankTransaction.currency}
            </span>
          </div>
        )}
        {bankTransaction.cashback != null && bankTransaction.cashback > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cashback</span>
            <span className="text-green-600 dark:text-green-400">
              +{formatCurrency(bankTransaction.cashback)} {bankTransaction.currency}
            </span>
          </div>
        )}
        {bankTransaction.commission != null && bankTransaction.commission > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Commission</span>
            <span className="text-red-600 dark:text-red-400">
              -{formatCurrency(bankTransaction.commission)} {bankTransaction.currency}
            </span>
          </div>
        )}
        {bankTransaction.receiptId && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Receipt ID</span>
            <span className="font-mono truncate max-w-[180px]">{bankTransaction.receiptId}</span>
          </div>
        )}
      </div>

      {bankTransaction.returnHistory.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          {bankTransaction.returnHistory.map((returnRecord) => {
            const isOriginalSide = returnRecord.originalBankTransactionId === bankTransaction.id;
            return (
              <div
                key={`${returnRecord.originalBankTransactionId}-${returnRecord.returningBankTransactionId}`}
                className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400"
              >
                <RotateCcw className="h-3 w-3 shrink-0" />
                <span>
                  {isOriginalSide
                    ? `${formatCurrency(returnRecord.amount)} ${bankTransaction.currency} returned`
                    : `Return of ${formatCurrency(returnRecord.amount)} ${bankTransaction.currency}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DetailRowProps {
  icon: React.ElementType;
  label: string;
  value: string;
  badge?: string;
  mono?: boolean;
  highlight?: "green" | "red";
}

function DetailRow({
  icon: Icon,
  label,
  value,
  badge,
  mono,
  highlight,
}: DetailRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2 text-right">
        <span
          className={cn(
            mono && "font-mono",
            highlight === "green" && "text-green-600 dark:text-green-400",
            highlight === "red" && "text-red-600 dark:text-red-400"
          )}
        >
          {value}
        </span>
        {badge && (
          <Badge variant="secondary" className="text-xs">
            {badge}
          </Badge>
        )}
      </div>
    </div>
  );
}

interface AIReasoningNoteProps {
  reason: string;
}

function AIReasoningNote({ reason }: AIReasoningNoteProps) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
      <Sparkles className="h-3 w-3 shrink-0 mt-0.5 text-purple-500" />
      <span>{reason}</span>
    </div>
  );
}

function TransactionDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-px bg-border" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex justify-between">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
