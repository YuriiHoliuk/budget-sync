import type { ApolloCache } from "@apollo/client";
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
  cache: ApolloCache<unknown>,
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
  cache: ApolloCache<unknown>,
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
