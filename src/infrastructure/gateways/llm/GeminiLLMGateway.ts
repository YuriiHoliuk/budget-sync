import {
  type CategorizationRequest,
  type CategorizationResult,
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
import { CATEGORIZATION_PROMPT_TEMPLATE } from './prompts/categorization.ts';

/**
 * Zod schema for LLM categorization responses.
 * Used to generate JSON schema for Gemini structured output.
 */
const CategorizationResponseSchema = z.object({
  category: z.string().nullable().describe('Selected category full path'),
  categoryReason: z
    .string()
    .nullable()
    .describe('Reason for category selection'),
  budget: z.string().nullable().describe('Selected budget name'),
  budgetReason: z.string().nullable().describe('Reason for budget selection'),
  isNewCategory: z
    .boolean()
    .describe('Whether a new category should be created'),
});

type CategorizationResponse = z.infer<typeof CategorizationResponseSchema>;

/** JSON schema for Gemini structured output */
const CATEGORIZATION_JSON_SCHEMA = zodToJsonSchema(
  CategorizationResponseSchema,
  { target: 'openApi3' },
) as JsonSchema;

/**
 * Injection token for GeminiClient.
 * Use with @inject(GEMINI_CLIENT_TOKEN) in classes that depend on GeminiClient.
 */
export const GEMINI_CLIENT_TOKEN = Symbol('GeminiClient');

/**
 * Gemini-based implementation of LLMGateway.
 * Uses Google Gemini API for transaction categorization.
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
   * Categorize a transaction using Gemini LLM.
   *
   * @param request - Transaction context and available categories/budgets
   * @returns Categorization result with category, budget, and reasoning
   */
  async categorize(
    request: CategorizationRequest,
  ): Promise<CategorizationResult> {
    const prompt = this.buildPrompt(request);
    const options = this.buildGenerateOptions();

    const result = await this.client.generate<CategorizationResponse>(
      prompt,
      options,
    );

    return this.mapToResult(result.data);
  }

  /**
   * Build the categorization prompt from request data.
   */
  private buildPrompt(request: CategorizationRequest): string {
    const categoryList = this.formatCategoryList(request.availableCategories);
    const budgetList = this.formatBudgetList(request.availableBudgets);
    const customRules = this.formatCustomRules(request.customRules);

    return new PromptBuilder(CATEGORIZATION_PROMPT_TEMPLATE).build({
      categories: categoryList,
      budgets: budgetList,
      description: request.transaction.description,
      amount: `${request.transaction.amount} ${request.transaction.currency}`,
      date: this.formatDate(request.transaction.date),
      counterparty: request.transaction.counterpartyName ?? '',
      mcc: request.transaction.mcc?.toString() ?? '',
      bankCategory: request.transaction.bankCategory ?? '',
      customRules: customRules,
    });
  }

  /**
   * Format categories list for the prompt.
   */
  private formatCategoryList(
    categories: CategorizationRequest['availableCategories'],
  ): string {
    if (categories.length === 0) {
      return '(немає доступних категорій)';
    }
    return categories.map((category) => `- ${category.fullPath}`).join('\n');
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
   * Format custom rules for the prompt.
   */
  private formatCustomRules(rules?: string[]): string {
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
  private buildGenerateOptions(): GenerateOptions {
    return {
      temperature: 0.1,
      maxOutputTokens: 1024,
      systemInstruction:
        'You are a financial transaction categorization assistant.',
      responseSchema: CATEGORIZATION_JSON_SCHEMA,
    };
  }

  /**
   * Map response to CategorizationResult.
   */
  private mapToResult(response: CategorizationResponse): CategorizationResult {
    return {
      category: response.category,
      categoryReason: response.categoryReason,
      budget: response.budget,
      budgetReason: response.budgetReason,
      isNewCategory: response.isNewCategory,
    };
  }
}
