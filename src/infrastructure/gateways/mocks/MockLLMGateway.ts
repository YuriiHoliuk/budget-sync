import type {
  BudgetAssignmentRequest,
  BudgetAssignmentResult,
  CategoryAssignmentRequest,
  CategoryAssignmentResult,
} from '@domain/gateways/LLMGateway.ts';
import { LLMGateway } from '@domain/gateways/LLMGateway.ts';
import { injectable } from 'tsyringe';

/**
 * Mock LLM gateway for local development.
 * Returns null assignments — no real LLM API calls.
 */
@injectable()
export class MockLLMGateway extends LLMGateway {
  assignCategory(
    _request: CategoryAssignmentRequest,
  ): Promise<CategoryAssignmentResult> {
    return Promise.resolve({
      category: null,
      categoryReason: null,
      isNewCategory: false,
    });
  }

  assignBudget(
    _request: BudgetAssignmentRequest,
  ): Promise<BudgetAssignmentResult> {
    return Promise.resolve({
      budget: null,
      budgetReason: null,
    });
  }
}
