import {
  type BudgetAssignmentRequest,
  type BudgetAssignmentResult,
  type CategoryAssignmentRequest,
  type CategoryAssignmentResult,
  LLMGateway,
} from '@domain/gateways/LLMGateway.ts';
import {
  type GeminiClient,
  type GenerateOptions,
  type JsonSchema,
  PromptBuilder,
} from '@modules/llm/index.ts';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod/v3';
import zodToJsonSchema from 'zod-to-json-schema';
import { BUDGET_ASSIGNMENT_PROMPT_TEMPLATE } from './prompts/budgetAssignment.ts';
import { CATEGORY_ASSIGNMENT_PROMPT_TEMPLATE } from './prompts/categoryAssignment.ts';

/**
 * Zod schema for LLM category assignment responses.
 */
const CategoryAssignmentResponseSchema = z.object({
  category: z
    .string()
    .nullable()
    .describe('Selected category name only (not full hierarchical path)'),
  categoryReason: z
    .string()
    .nullable()
    .describe('Reason for category selection'),
  isNewCategory: z
    .boolean()
    .describe('Whether a new category should be created'),
});

type CategoryAssignmentResponse = z.infer<
  typeof CategoryAssignmentResponseSchema
>;

/**
 * Zod schema for LLM budget assignment responses.
 */
const BudgetAssignmentResponseSchema = z.object({
  budget: z.string().nullable().describe('Selected budget name'),
  budgetReason: z.string().nullable().describe('Reason for budget selection'),
});

type BudgetAssignmentResponse = z.infer<typeof BudgetAssignmentResponseSchema>;

/** JSON schemas for Gemini structured output */
const CATEGORY_ASSIGNMENT_JSON_SCHEMA = zodToJsonSchema(
  CategoryAssignmentResponseSchema,
  { target: 'openApi3' },
) as JsonSchema;

const BUDGET_ASSIGNMENT_JSON_SCHEMA = zodToJsonSchema(
  BudgetAssignmentResponseSchema,
  { target: 'openApi3' },
) as JsonSchema;

/**
 * Injection token for GeminiClient.
 * Use with @inject(GEMINI_CLIENT_TOKEN) in classes that depend on GeminiClient.
 */
export const GEMINI_CLIENT_TOKEN = Symbol('GeminiClient');

/**
 * Gemini-based implementation of LLMGateway.
 * Uses Google Gemini API for transaction categorization and budgeting.
 */
@injectable()
export class GeminiLLMGateway extends LLMGateway {
  constructor(
    @inject(GEMINI_CLIENT_TOKEN)
    private readonly client: GeminiClient,
  ) {
    super();
  }

  /**
   * Assign a category to a transaction using Gemini LLM.
   */
  async assignCategory(
    request: CategoryAssignmentRequest,
  ): Promise<CategoryAssignmentResult> {
    const prompt = this.buildCategoryPrompt(request);
    const options = this.buildGenerateOptions(
      'You are a financial transaction categorization assistant.',
      CATEGORY_ASSIGNMENT_JSON_SCHEMA,
    );

    const result = await this.client.generate<CategoryAssignmentResponse>(
      prompt,
      options,
    );

    return this.mapToCategoryResult(result.data);
  }

  /**
   * Assign a budget to a transaction using Gemini LLM.
   */
  async assignBudget(
    request: BudgetAssignmentRequest,
  ): Promise<BudgetAssignmentResult> {
    const prompt = this.buildBudgetPrompt(request);
    const options = this.buildGenerateOptions(
      'You are a financial transaction budgeting assistant.',
      BUDGET_ASSIGNMENT_JSON_SCHEMA,
    );

    const result = await this.client.generate<BudgetAssignmentResponse>(
      prompt,
      options,
    );

    return this.mapToBudgetResult(result.data);
  }

  /**
   * Build the category assignment prompt from request data.
   */
  private buildCategoryPrompt(request: CategoryAssignmentRequest): string {
    const categoryList = this.formatCategoryList(request.availableCategories);
    const categoryHierarchy = this.formatCategoryHierarchy(
      request.availableCategories,
    );
    const categoryRules = this.formatRules(request.categoryRules);

    return new PromptBuilder(CATEGORY_ASSIGNMENT_PROMPT_TEMPLATE).build({
      categoryList: categoryList,
      categoryHierarchy: categoryHierarchy,
      categoryRules: categoryRules,
      description: request.transaction.description,
      amount: `${request.transaction.amount} ${request.transaction.currency}`,
      date: this.formatDate(request.transaction.date),
      counterparty: request.transaction.counterpartyName ?? '',
      mcc: request.transaction.mcc?.toString() ?? '',
      bankCategory: request.transaction.bankCategory ?? '',
    });
  }

  /**
   * Build the budget assignment prompt from request data.
   */
  private buildBudgetPrompt(request: BudgetAssignmentRequest): string {
    const budgetList = this.formatBudgetList(request.availableBudgets);
    const budgetRules = this.formatRules(request.budgetRules);

    return new PromptBuilder(BUDGET_ASSIGNMENT_PROMPT_TEMPLATE).build({
      budgets: budgetList,
      budgetRules: budgetRules,
      description: request.transaction.description,
      amount: `${request.transaction.amount} ${request.transaction.currency}`,
      date: this.formatDate(request.transaction.date),
      counterparty: request.transaction.counterpartyName ?? '',
      mcc: request.transaction.mcc?.toString() ?? '',
      bankCategory: request.transaction.bankCategory ?? '',
      assignedCategory: request.assignedCategory ?? '(not assigned)',
    });
  }

  /**
   * Format categories as a flat list of names for selection.
   */
  private formatCategoryList(
    categories: CategoryAssignmentRequest['availableCategories'],
  ): string {
    if (categories.length === 0) {
      return '(немає доступних категорій)';
    }
    return categories.map((category) => `- ${category.name}`).join('\n');
  }

  /**
   * Format category hierarchy information for context.
   */
  private formatCategoryHierarchy(
    categories: CategoryAssignmentRequest['availableCategories'],
  ): string {
    if (categories.length === 0) {
      return '(немає ієрархії)';
    }
    return categories
      .map((category) => {
        if (category.parent) {
          return `- ${category.name} → parent: ${category.parent}`;
        }
        return `- ${category.name} → (root category)`;
      })
      .join('\n');
  }

  /**
   * Format budgets list for the prompt.
   */
  private formatBudgetList(budgets: string[]): string {
    if (budgets.length === 0) {
      return '(немає доступних бюджетів)';
    }
    return budgets.map((budget) => `- ${budget}`).join('\n');
  }

  /**
   * Format rules for the prompt.
   */
  private formatRules(rules?: string[]): string {
    if (!rules || rules.length === 0) {
      return '';
    }
    return rules.map((rule) => `- ${rule}`).join('\n');
  }

  /**
   * Format date as YYYY-MM-DD string.
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0] ?? '';
  }

  /**
   * Build generation options for Gemini.
   */
  private buildGenerateOptions(
    systemInstruction: string,
    responseSchema: JsonSchema,
  ): GenerateOptions {
    return {
      temperature: 0.1,
      maxOutputTokens: 1024,
      systemInstruction,
      responseSchema,
    };
  }

  /**
   * Map response to CategoryAssignmentResult.
   */
  private mapToCategoryResult(
    response: CategoryAssignmentResponse,
  ): CategoryAssignmentResult {
    return {
      category: response.category,
      categoryReason: response.categoryReason,
      isNewCategory: response.isNewCategory,
    };
  }

  /**
   * Map response to BudgetAssignmentResult.
   */
  private mapToBudgetResult(
    response: BudgetAssignmentResponse,
  ): BudgetAssignmentResult {
    return {
      budget: response.budget,
      budgetReason: response.budgetReason,
    };
  }
}
