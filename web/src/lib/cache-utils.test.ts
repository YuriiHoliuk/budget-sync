import { describe, test, expect, mock } from "bun:test";
import {
  updateMonthlyOverviewCache,
  updateMonthlyOverviewCacheForMoveFunds,
} from "./cache-utils";
import { GetMonthlyOverviewDocument, BudgetType } from "@/graphql/generated/graphql";

interface MockWriteQueryArgs {
  query: unknown;
  variables: unknown;
  data: {
    monthlyOverview: {
      readyToAssign: number;
      totalAllocated: number;
      budgetSummaries: Array<{ budgetId: number; allocated: number; available: number }>;
    };
  };
}

// Helper to create a mock cache
function createMockCache(existingData: unknown) {
  const writeQueryMock = mock((_args: MockWriteQueryArgs) => {});
  return {
    readQuery: mock(() => existingData),
    writeQuery: writeQueryMock,
  };
}

// Sample monthly overview data
const sampleOverviewData = {
  monthlyOverview: {
    month: "2024-01",
    readyToAssign: 1000,
    totalAllocated: 5000,
    totalSpent: 3000,
    capitalBalance: 10000,
    availableFunds: 8000,
    savingsRate: 0.25,
    budgetSummaries: [
      {
        budgetId: 1,
        name: "Groceries",
        type: BudgetType.Spending,
        targetAmount: 500,
        allocated: 400,
        spent: 200,
        available: 200,
        carryover: 0,
      },
      {
        budgetId: 2,
        name: "Rent",
        type: BudgetType.Spending,
        targetAmount: 1000,
        allocated: 1000,
        spent: 1000,
        available: 0,
        carryover: 0,
      },
      {
        budgetId: 3,
        name: "Savings",
        type: BudgetType.Savings,
        targetAmount: 500,
        allocated: 500,
        spent: 0,
        available: 500,
        carryover: 0,
      },
    ],
  },
};

describe("updateMonthlyOverviewCache", () => {
  test("should update budget allocated and available when adding allocation", () => {
    const mockCache = createMockCache(sampleOverviewData);

    updateMonthlyOverviewCache(
      mockCache as unknown as Parameters<typeof updateMonthlyOverviewCache>[0],
      "2024-01",
      1,
      100,
    );

    expect(mockCache.writeQuery).toHaveBeenCalledTimes(1);

    const writeArgs = mockCache.writeQuery.mock.calls[0][0];
    expect(writeArgs.query).toBe(GetMonthlyOverviewDocument);
    expect(writeArgs.variables).toEqual({ month: "2024-01" });

    const writtenData = writeArgs.data;
    expect(writtenData.monthlyOverview.readyToAssign).toBe(900); // 1000 - 100
    expect(writtenData.monthlyOverview.totalAllocated).toBe(5100); // 5000 + 100

    const groceriesBudget = writtenData.monthlyOverview.budgetSummaries.find(
      (budget: { budgetId: number }) => budget.budgetId === 1,
    )!;
    expect(groceriesBudget.allocated).toBe(500); // 400 + 100
    expect(groceriesBudget.available).toBe(300); // 200 + 100
  });

  test("should update budget when removing allocation (negative amount)", () => {
    const mockCache = createMockCache(sampleOverviewData);

    updateMonthlyOverviewCache(
      mockCache as unknown as Parameters<typeof updateMonthlyOverviewCache>[0],
      "2024-01",
      1,
      -50,
    );

    const writtenData = mockCache.writeQuery.mock.calls[0][0].data;
    expect(writtenData.monthlyOverview.readyToAssign).toBe(1050); // 1000 + 50
    expect(writtenData.monthlyOverview.totalAllocated).toBe(4950); // 5000 - 50

    const groceriesBudget = writtenData.monthlyOverview.budgetSummaries.find(
      (budget: { budgetId: number }) => budget.budgetId === 1,
    )!;
    expect(groceriesBudget.allocated).toBe(350); // 400 - 50
    expect(groceriesBudget.available).toBe(150); // 200 - 50
  });

  test("should not modify cache if data is missing", () => {
    const mockCache = createMockCache(null);

    updateMonthlyOverviewCache(
      mockCache as unknown as Parameters<typeof updateMonthlyOverviewCache>[0],
      "2024-01",
      1,
      100,
    );

    expect(mockCache.writeQuery).not.toHaveBeenCalled();
  });

  test("should not modify other budgets", () => {
    const mockCache = createMockCache(sampleOverviewData);

    updateMonthlyOverviewCache(
      mockCache as unknown as Parameters<typeof updateMonthlyOverviewCache>[0],
      "2024-01",
      1,
      100,
    );

    const writtenData = mockCache.writeQuery.mock.calls[0][0].data;

    const rentBudget = writtenData.monthlyOverview.budgetSummaries.find(
      (budget: { budgetId: number }) => budget.budgetId === 2,
    )!;
    expect(rentBudget.allocated).toBe(1000); // unchanged
    expect(rentBudget.available).toBe(0); // unchanged
  });
});

describe("updateMonthlyOverviewCacheForMoveFunds", () => {
  test("should transfer funds between budgets", () => {
    const mockCache = createMockCache(sampleOverviewData);

    updateMonthlyOverviewCacheForMoveFunds(
      mockCache as unknown as Parameters<typeof updateMonthlyOverviewCacheForMoveFunds>[0],
      "2024-01",
      1, // source: Groceries
      3, // dest: Savings
      100,
    );

    expect(mockCache.writeQuery).toHaveBeenCalledTimes(1);

    const writtenData = mockCache.writeQuery.mock.calls[0][0].data;

    // Totals should remain unchanged (zero-sum transfer)
    expect(writtenData.monthlyOverview.readyToAssign).toBe(1000);
    expect(writtenData.monthlyOverview.totalAllocated).toBe(5000);

    const groceriesBudget = writtenData.monthlyOverview.budgetSummaries.find(
      (budget: { budgetId: number }) => budget.budgetId === 1,
    )!;
    expect(groceriesBudget.allocated).toBe(300); // 400 - 100
    expect(groceriesBudget.available).toBe(100); // 200 - 100

    const savingsBudget = writtenData.monthlyOverview.budgetSummaries.find(
      (budget: { budgetId: number }) => budget.budgetId === 3,
    )!;
    expect(savingsBudget.allocated).toBe(600); // 500 + 100
    expect(savingsBudget.available).toBe(600); // 500 + 100
  });

  test("should not modify unrelated budgets", () => {
    const mockCache = createMockCache(sampleOverviewData);

    updateMonthlyOverviewCacheForMoveFunds(
      mockCache as unknown as Parameters<typeof updateMonthlyOverviewCacheForMoveFunds>[0],
      "2024-01",
      1, // source: Groceries
      3, // dest: Savings
      100,
    );

    const writtenData = mockCache.writeQuery.mock.calls[0][0].data;

    const rentBudget = writtenData.monthlyOverview.budgetSummaries.find(
      (budget: { budgetId: number }) => budget.budgetId === 2,
    )!;
    expect(rentBudget.allocated).toBe(1000); // unchanged
    expect(rentBudget.available).toBe(0); // unchanged
  });

  test("should not modify cache if data is missing", () => {
    const mockCache = createMockCache(null);

    updateMonthlyOverviewCacheForMoveFunds(
      mockCache as unknown as Parameters<typeof updateMonthlyOverviewCacheForMoveFunds>[0],
      "2024-01",
      1,
      3,
      100,
    );

    expect(mockCache.writeQuery).not.toHaveBeenCalled();
  });
});
