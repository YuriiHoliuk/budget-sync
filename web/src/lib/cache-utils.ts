import type { ApolloCache, Reference } from "@apollo/client";
import { arrayMove } from "@dnd-kit/sortable";
import {
  GetMonthlyOverviewDocument,
  type GetMonthlyOverviewQuery,
} from "@/graphql/generated/graphql";

/**
 * Updates the monthly overview cache when an allocation changes.
 * Used for optimistic updates in createAllocation and moveFunds mutations.
 *
 * @param cache - Apollo cache instance
 * @param month - The period in YYYY-MM format
 * @param budgetId - The budget to update
 * @param allocationDelta - The change in allocation (positive = add, negative = subtract)
 */
export function updateMonthlyOverviewCache(
  cache: ApolloCache,
  month: string,
  budgetId: number,
  allocationDelta: number,
): void {
  const existingData = cache.readQuery<GetMonthlyOverviewQuery>({
    query: GetMonthlyOverviewDocument,
    variables: { month },
  });

  if (!existingData?.monthlyOverview) {
    return;
  }

  const overview = existingData.monthlyOverview;

  cache.writeQuery<GetMonthlyOverviewQuery>({
    query: GetMonthlyOverviewDocument,
    variables: { month },
    data: {
      monthlyOverview: {
        ...overview,
        // Update totals
        readyToAssign: overview.readyToAssign - allocationDelta,
        totalAllocated: overview.totalAllocated + allocationDelta,
        // Update the specific budget summary
        budgetSummaries: overview.budgetSummaries.map((summary) => {
          if (summary.budgetId !== budgetId) {
            return summary;
          }
          return {
            ...summary,
            allocated: summary.allocated + allocationDelta,
            available: summary.available + allocationDelta,
          };
        }),
      },
    },
  });
}

/**
 * Updates the monthly overview cache for a move funds operation.
 * Adjusts both source and destination budgets.
 *
 * @param cache - Apollo cache instance
 * @param month - The period in YYYY-MM format
 * @param sourceBudgetId - The budget to subtract from
 * @param destBudgetId - The budget to add to
 * @param amount - The amount to move (always positive)
 */
export function updateMonthlyOverviewCacheForMoveFunds(
  cache: ApolloCache,
  month: string,
  sourceBudgetId: number,
  destBudgetId: number,
  amount: number,
): void {
  const existingData = cache.readQuery<GetMonthlyOverviewQuery>({
    query: GetMonthlyOverviewDocument,
    variables: { month },
  });

  if (!existingData?.monthlyOverview) {
    return;
  }

  const overview = existingData.monthlyOverview;

  cache.writeQuery<GetMonthlyOverviewQuery>({
    query: GetMonthlyOverviewDocument,
    variables: { month },
    data: {
      monthlyOverview: {
        ...overview,
        // readyToAssign and totalAllocated stay the same (zero-sum transfer)
        budgetSummaries: overview.budgetSummaries.map((summary) => {
          if (summary.budgetId === sourceBudgetId) {
            return {
              ...summary,
              allocated: summary.allocated - amount,
              available: summary.available - amount,
            };
          }
          if (summary.budgetId === destBudgetId) {
            return {
              ...summary,
              allocated: summary.allocated + amount,
              available: summary.available + amount,
            };
          }
          return summary;
        }),
      },
    },
  });
}

/**
 * Updates the monthly overview cache when a budget is moved to a different group
 * without reordering (e.g., dropping into an empty group).
 * Only updates the budgetGroupId on the target budget summary.
 */
export function moveBudgetToGroupInCache(
  cache: ApolloCache,
  month: string,
  budgetId: number,
  targetGroupId: number | null,
): void {
  const existingData = cache.readQuery<GetMonthlyOverviewQuery>({
    query: GetMonthlyOverviewDocument,
    variables: { month },
  });

  if (!existingData?.monthlyOverview) {
    return;
  }

  const overview = existingData.monthlyOverview;

  cache.writeQuery<GetMonthlyOverviewQuery>({
    query: GetMonthlyOverviewDocument,
    variables: { month },
    data: {
      monthlyOverview: {
        ...overview,
        budgetSummaries: overview.budgetSummaries.map((summary) => {
          if (summary.budgetId !== budgetId) return summary;
          return { ...summary, budgetGroupId: targetGroupId };
        }),
      },
    },
  });
}

/**
 * Updates the monthly overview cache after a budget reorder.
 * Moves the budget from oldIndex to newIndex in the summaries array.
 * Optionally updates the budgetGroupId for cross-group moves.
 *
 * @param cache - Apollo cache instance
 * @param month - The period in YYYY-MM format
 * @param oldIndex - The original index of the budget
 * @param newIndex - The new index of the budget
 * @param targetGroupId - Optional new group ID for cross-group moves
 */
export function reorderBudgetInCache(
  cache: ApolloCache,
  month: string,
  oldIndex: number,
  newIndex: number,
  targetGroupId?: number | null,
): void {
  const existingData = cache.readQuery<GetMonthlyOverviewQuery>({
    query: GetMonthlyOverviewDocument,
    variables: { month },
  });

  if (!existingData?.monthlyOverview) {
    return;
  }

  const overview = existingData.monthlyOverview;
  const reorderedSummaries = arrayMove(
    [...overview.budgetSummaries],
    oldIndex,
    newIndex,
  );

  // Update budgetGroupId if moving to a different group
  if (targetGroupId !== undefined) {
    const movedBudget = reorderedSummaries[newIndex];
    if (movedBudget) {
      reorderedSummaries[newIndex] = {
        ...movedBudget,
        budgetGroupId: targetGroupId,
      };
    }
  }

  cache.writeQuery<GetMonthlyOverviewQuery>({
    query: GetMonthlyOverviewDocument,
    variables: { month },
    data: {
      monthlyOverview: {
        ...overview,
        budgetSummaries: reorderedSummaries,
      },
    },
  });
}

/**
 * Adds new transactions to all cached `transactions` query results.
 * Inserts in sorted position (descending by date, then by id) to match the table order.
 * Used after split/revertReturning/convertToTransfer to insert newly created transactions.
 */
export function addTransactionsToCache(
  cache: ApolloCache,
  newTransactions: Array<{ id: number }>,
): void {
  cache.modify({
    fields: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cache.modify field modifiers are loosely typed
      transactions(existing: any, { toReference, readField }: any) {
        if (!existing?.items) return existing;

        const newRefs = newTransactions
          .map((transaction) =>
            toReference({ __typename: "Transaction", id: transaction.id }),
          )
          .filter((ref: unknown): ref is Reference => ref != null);

        if (newRefs.length === 0) return existing;

        const merged = [...existing.items, ...newRefs];
        merged.sort((refA: Reference, refB: Reference) => {
          const dateA = String(readField("date", refA) ?? "");
          const dateB = String(readField("date", refB) ?? "");
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          const idA = Number(readField("id", refA) ?? 0);
          const idB = Number(readField("id", refB) ?? 0);
          return idB - idA;
        });

        return {
          ...existing,
          items: merged,
          totalCount: existing.totalCount + newRefs.length,
        };
      },
    },
  });
}

/**
 * Removes a transaction from all cached `transactions` query results and evicts it from the cache.
 * Used after join to remove the absorbed transaction from the table.
 */
export function removeTransactionFromCache(
  cache: ApolloCache,
  transactionId: number,
): void {
  cache.modify({
    fields: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cache.modify field modifiers are loosely typed
      transactions(existing: any, { readField }: any) {
        if (!existing?.items) return existing;

        return {
          ...existing,
          items: existing.items.filter(
            (ref: Reference) => readField("id", ref) !== transactionId,
          ),
          totalCount: existing.totalCount - 1,
        };
      },
    },
  });

  const cacheId = cache.identify({
    __typename: "Transaction",
    id: transactionId,
  });
  if (cacheId) {
    cache.evict({ id: cacheId });
    cache.gc();
  }
}

/**
 * Evicts the `siblingTransactions` field from specific transactions in the cache.
 * Forces Apollo to re-fetch sibling data when those transactions are viewed.
 * Used to invalidate stale sibling lists after split/join operations.
 */
export function evictSiblingTransactions(
  cache: ApolloCache,
  transactionIds: number[],
): void {
  for (const transactionId of transactionIds) {
    const cacheId = cache.identify({
      __typename: "Transaction",
      id: transactionId,
    });
    if (cacheId) {
      cache.evict({ id: cacheId, fieldName: "siblingTransactions" });
    }
  }
  cache.gc();
}
