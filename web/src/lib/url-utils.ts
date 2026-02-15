import {
  TransactionTypeEnum,
  CategorizationStatusEnum,
} from "@/graphql/generated/graphql";

export function getDateRangeFromMonth(month: string): {
  dateFrom: string;
  dateTo: string;
} {
  const [year, monthNum] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);

  return {
    dateFrom: firstDay.toISOString().split("T")[0],
    dateTo: lastDay.toISOString().split("T")[0],
  };
}

interface TransactionsUrlParams {
  budgetId?: number | null;
  categoryId?: number | null;
  accountId?: number | null;
  type?: TransactionTypeEnum | null;
  status?: CategorizationStatusEnum | null;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
}

export function buildTransactionsUrl(params: TransactionsUrlParams): string {
  const searchParams = new URLSearchParams();

  if (params.budgetId != null) {
    searchParams.set("budgetId", String(params.budgetId));
  }
  if (params.categoryId != null) {
    searchParams.set("categoryId", String(params.categoryId));
  }
  if (params.accountId != null) {
    searchParams.set("accountId", String(params.accountId));
  }
  if (params.type) {
    searchParams.set("type", params.type);
  }
  if (params.status) {
    searchParams.set("status", params.status);
  }
  if (params.dateFrom) {
    searchParams.set("dateFrom", params.dateFrom);
  }
  if (params.dateTo) {
    searchParams.set("dateTo", params.dateTo);
  }
  if (params.search) {
    searchParams.set("search", params.search);
  }
  if (params.page && params.page > 1) {
    searchParams.set("page", String(params.page));
  }

  const query = searchParams.toString();
  return `/transactions${query ? `?${query}` : ""}`;
}

const VALID_TYPES = new Set(Object.values(TransactionTypeEnum));
const VALID_STATUSES = new Set(Object.values(CategorizationStatusEnum));

export function parseTransactionFiltersFromParams(searchParams: URLSearchParams): TransactionsUrlParams {
  const params: TransactionsUrlParams = {};

  const budgetId = searchParams.get("budgetId");
  if (budgetId) {
    const parsed = Number.parseInt(budgetId, 10);
    if (Number.isFinite(parsed)) params.budgetId = parsed;
  }

  const categoryId = searchParams.get("categoryId");
  if (categoryId) {
    const parsed = Number.parseInt(categoryId, 10);
    if (Number.isFinite(parsed)) params.categoryId = parsed;
  }

  const accountId = searchParams.get("accountId");
  if (accountId) {
    const parsed = Number.parseInt(accountId, 10);
    if (Number.isFinite(parsed)) params.accountId = parsed;
  }

  const type = searchParams.get("type");
  if (type && VALID_TYPES.has(type as TransactionTypeEnum)) {
    params.type = type as TransactionTypeEnum;
  }

  const status = searchParams.get("status");
  if (status && VALID_STATUSES.has(status as CategorizationStatusEnum)) {
    params.status = status as CategorizationStatusEnum;
  }

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) params.dateFrom = dateFrom;

  const dateTo = searchParams.get("dateTo");
  if (dateTo) params.dateTo = dateTo;

  const search = searchParams.get("search");
  if (search) params.search = search;

  const page = searchParams.get("page");
  if (page) {
    const parsed = Number.parseInt(page, 10);
    if (Number.isFinite(parsed) && parsed >= 1) params.page = parsed;
  }

  return params;
}
