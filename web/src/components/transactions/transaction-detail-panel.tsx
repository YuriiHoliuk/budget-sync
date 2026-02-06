"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
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
  Receipt,
  Coins,
  Percent,
  Loader2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GetTransactionDocument,
  GetCategoriesDocument,
  GetBudgetsDocument,
  GetTransactionsDocument,
  UpdateTransactionCategoryDocument,
  UpdateTransactionBudgetDocument,
  VerifyTransactionDocument,
  TransactionTypeEnum,
  CategorizationStatusEnum,
  AccountSource,
  type GetTransactionQuery,
} from "@/graphql/generated/graphql";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Transaction = NonNullable<GetTransactionQuery["transaction"]>;

interface TransactionDetailPanelProps {
  transactionId: number | null;
  onClose: () => void;
}

const TYPE_CONFIG = {
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
  return date.toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatMcc(mcc: number | null | undefined): string {
  if (!mcc) return "N/A";
  return mcc.toString().padStart(4, "0");
}

export function TransactionDetailPanel({
  transactionId,
  onClose,
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
    variables: { activeOnly: true },
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
        {loading ? (
          <TransactionDetailSkeleton />
        ) : data?.transaction ? (
          <TransactionDetailContent
            transaction={data.transaction}
            categories={categories}
            budgets={budgets}
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
  budgets: Array<{ id: number; name: string }>;
}

function TransactionDetailContent({
  transaction,
  categories,
  budgets,
}: TransactionDetailContentProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const typeConfig = TYPE_CONFIG[transaction.type];
  const statusConfig = STATUS_CONFIG[transaction.categorizationStatus];
  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;

  const isVerified =
    transaction.categorizationStatus === CategorizationStatusEnum.Verified;
  const isManualAccount = transaction.account?.source === AccountSource.Manual;

  const [updateCategory] = useMutation(UpdateTransactionCategoryDocument, {
    refetchQueries: [{ query: GetTransactionsDocument }],
  });

  const [updateBudget] = useMutation(UpdateTransactionBudgetDocument, {
    refetchQueries: [{ query: GetTransactionsDocument }],
  });

  const [verifyTransaction] = useMutation(VerifyTransactionDocument, {
    refetchQueries: [{ query: GetTransactionsDocument }],
  });

  const handleCategoryChange = async (value: string) => {
    setIsUpdating(true);
    try {
      await updateCategory({
        variables: {
          input: {
            id: transaction.id,
            categoryId: value === "none" ? null : parseInt(value, 10),
          },
        },
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBudgetChange = async (value: string) => {
    setIsUpdating(true);
    try {
      await updateBudget({
        variables: {
          input: {
            id: transaction.id,
            budgetId: value === "none" ? null : parseInt(value, 10),
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

  const description =
    transaction.counterpartyName || transaction.description || "Unknown";

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
          >
            <TypeIcon className="h-4 w-4" />
            {transaction.type === TransactionTypeEnum.Debit ? "-" : "+"}
            {formatCurrency(transaction.amount)} {transaction.currency}
          </Badge>

          <Badge
            variant="outline"
            className={cn("gap-1", statusConfig.bgColor, statusConfig.color)}
          >
            <StatusIcon className="h-3 w-3" />
            {statusConfig.label}
          </Badge>
        </div>
      </SheetHeader>

      <div className="mt-6 space-y-6">
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
              <Select
                value={transaction.category?.id.toString() ?? "none"}
                onValueChange={handleCategoryChange}
                disabled={isUpdating}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem
                      key={category.id}
                      value={category.id.toString()}
                    >
                      {category.fullPath}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transaction.categoryReason && (
                <AIReasoningNote reason={transaction.categoryReason} />
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="budget" className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Budget
              </Label>
              <Select
                value={transaction.budget?.id.toString() ?? "none"}
                onValueChange={handleBudgetChange}
                disabled={isUpdating}
              >
                <SelectTrigger id="budget">
                  <SelectValue placeholder="Select budget" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No budget</SelectItem>
                  {budgets.map((budget) => (
                    <SelectItem key={budget.id} value={budget.id.toString()}>
                      {budget.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transaction.budgetReason && (
                <AIReasoningNote reason={transaction.budgetReason} />
              )}
            </div>
          </div>

          {!isVerified && (
            <Button
              onClick={handleVerify}
              disabled={isUpdating}
              className="w-full"
              variant="outline"
            >
              {isUpdating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Verify Categorization
            </Button>
          )}
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

            {transaction.notes && (
              <DetailRow
                icon={FileText}
                label="Notes"
                value={transaction.notes}
              />
            )}

            {transaction.hold && (
              <DetailRow
                icon={Clock}
                label="Status"
                value="Hold (pending settlement)"
                badge="Hold"
              />
            )}
          </div>
        </div>

        {(transaction.cashbackAmount ||
          transaction.commissionAmount ||
          transaction.receiptId) && (
          <>
            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Additional Info
              </h3>

              <div className="grid gap-3 text-sm">
                {transaction.cashbackAmount !== null &&
                  transaction.cashbackAmount !== undefined &&
                  transaction.cashbackAmount > 0 && (
                    <DetailRow
                      icon={Coins}
                      label="Cashback"
                      value={`+${formatCurrency(transaction.cashbackAmount)} ${transaction.currency}`}
                      highlight="green"
                    />
                  )}

                {transaction.commissionAmount !== null &&
                  transaction.commissionAmount !== undefined &&
                  transaction.commissionAmount > 0 && (
                    <DetailRow
                      icon={Percent}
                      label="Commission"
                      value={`-${formatCurrency(transaction.commissionAmount)} ${transaction.currency}`}
                      highlight="red"
                    />
                  )}

                {transaction.receiptId && (
                  <DetailRow
                    icon={Receipt}
                    label="Receipt ID"
                    value={transaction.receiptId}
                    mono
                  />
                )}
              </div>
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
            <div className="flex justify-between">
              <span>External ID</span>
              <span className="truncate ml-4 font-mono">
                {transaction.externalId}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
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
