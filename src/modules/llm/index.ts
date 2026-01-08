/**
 * LLM Module
 *
 * Provides business-agnostic utilities for working with Large Language Models.
 *
 * Two main components:
 * 1. GeminiClient - Wrapper for Google Gemini API
 * 2. PromptBuilder - Template variable injection for prompts
 *
 * Usage example:
 *
 * ```typescript
 * import {
 *   GeminiClient,
 *   PromptBuilder,
 *   type GenerateOptions,
 * } from '@modules/llm';
 *
 * // Create client (uses API key)
 * const client = new GeminiClient({
 *   apiKey: 'your-gemini-api-key',
 * });
 *
 * // Simple generation
 * const result = await client.generate('What is 2 + 2?');
 * console.log(result.data); // '4'
 *
 * // With options
 * const result2 = await client.generate('Write a poem', {
 *   temperature: 0.9,
 *   maxOutputTokens: 500,
 * });
 *
 * // Using prompt builder for templates
 * const builder = new PromptBuilder('Translate "{{text}}" to {{language}}');
 * const prompt = builder.build({ text: 'Hello', language: 'French' });
 * const result3 = await client.generate(prompt);
 * ```
 */

// Errors
export {
  LLMApiError,
  LLMError,
  LLMRateLimitError,
  LLMResponseParseError,
} from './errors.ts';

// Client
export { GeminiClient } from './GeminiClient.ts';

// Prompt Builder
export { PromptBuilder } from './PromptBuilder.ts';

// Types
export type {
  GeminiClientConfig,
  GenerateOptions,
  GenerateResult,
  JsonSchema,
  TemplateVariables,
} from './types.ts';
