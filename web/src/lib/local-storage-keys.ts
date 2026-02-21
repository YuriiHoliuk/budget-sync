export const LocalStorageKey = {
  SIDEBAR_COLLAPSED: "netto-sidebar-collapsed",
  FILTER_SIDEBAR_OPEN: "netto-filter-sidebar-open",
  TRANSACTION_FILTERS: "netto-transaction-filters",
} as const;

export type LocalStorageKey =
  (typeof LocalStorageKey)[keyof typeof LocalStorageKey];
