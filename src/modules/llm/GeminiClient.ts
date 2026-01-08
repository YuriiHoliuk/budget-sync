/**
 * GeminiClient - Wrapper for Google Gemini API
 *
 * Provides a simplified interface for generating text using Gemini models.
 * This is a business-agnostic wrapper around the @google/genai package.
 * Uses API key for authentication.
 */

import { type GenerateContentConfig, GoogleGenAI } from '@google/genai';
import {
  LLMApiError,
  LLMRateLimitError,
  LLMResponseParseError,
} from './errors.ts';
import type {
  GeminiClientConfig,
  GenerateOptions,
  GenerateResult,
} from './types.ts';

const DEFAULT_MODEL = 'gemini-2.0-flash';

export class GeminiClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(config: GeminiClientConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model ?? DEFAULT_MODEL;
  }

  /**
   * Generate text using the Gemini model
   *
   * @param prompt - The input prompt to generate a response for
   * @param options - Optional generation parameters
   * @returns The generated response and token usage information
   *
   * @example
   * ```typescript
   * const client = new GeminiClient({
   *   apiKey: 'your-gemini-api-key',
   * });
   *
   * // Text response
   * const textResult = await client.generate('What is the capital of France?');
   * console.log(textResult.data); // 'Paris'
   *
   * // Structured output with schema
   * const schema = { type: 'object', properties: { answer: { type: 'string' } } };
   * const structuredResult = await client.generate('What is 2+2?', { responseSchema: schema });
   * console.log(structuredResult.data); // { answer: '4' }
   * ```
   */
  generate<T = string>(
    prompt: string,
    options: GenerateOptions = {},
  ): Promise<GenerateResult<T>> {
    return this.withErrorHandling(async () => {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: this.buildConfig(options),
      });

      const text = response.text;
      if (text === undefined) {
        throw new LLMResponseParseError(
          JSON.stringify(response),
          'Response text is undefined',
        );
      }

      const data = options.responseSchema
        ? (JSON.parse(text) as T)
        : (text as T);

      return {
        data,
        promptTokens: response.usageMetadata?.promptTokenCount,
        responseTokens: response.usageMetadata?.candidatesTokenCount,
        totalTokens: response.usageMetadata?.totalTokenCount,
      };
    });
  }

  /**
   * Build generation config from options
   */
  private buildConfig(options: GenerateOptions): GenerateContentConfig {
    const config: GenerateContentConfig = {};

    if (options.maxOutputTokens !== undefined) {
      config.maxOutputTokens = options.maxOutputTokens;
    }
    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
    }
    if (options.topP !== undefined) {
      config.topP = options.topP;
    }
    if (options.topK !== undefined) {
      config.topK = options.topK;
    }
    if (options.systemInstruction !== undefined) {
      config.systemInstruction = options.systemInstruction;
    }
    if (options.responseSchema !== undefined) {
      config.responseMimeType = 'application/json';
      config.responseSchema = options.responseSchema;
    }

    return config;
  }

  /**
   * Wraps API calls with error handling
   */
  private async withErrorHandling<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.isRateLimitError(error)) {
        throw new LLMRateLimitError();
      }

      if (error instanceof LLMResponseParseError) {
        throw error;
      }

      throw new LLMApiError(
        error instanceof Error ? error.message : 'Unknown LLM API error',
      );
    }
  }

  /**
   * Check if an error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('quota exceeded') ||
        message.includes('429')
      );
    }
    return false;
  }
}
