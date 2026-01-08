/**
 * LLM module types
 * Business-agnostic types for working with LLM APIs
 */

/** Configuration for the Gemini client using API key */
export interface GeminiClientConfig {
  /** Gemini API key */
  apiKey: string;
  /** Model name to use (e.g., 'gemini-2.0-flash') */
  model?: string;
}

/** JSON Schema for structured output */
export type JsonSchema = Record<string, unknown>;

/** Options for generate request */
export interface GenerateOptions {
  /** Maximum number of tokens in the response */
  maxOutputTokens?: number;
  /** Temperature for response randomness (0.0 - 2.0) */
  temperature?: number;
  /** Top-p sampling parameter */
  topP?: number;
  /** Top-k sampling parameter */
  topK?: number;
  /** System instruction to set context for the model */
  systemInstruction?: string;
  /**
   * JSON Schema for structured output.
   * When provided, the API guarantees the response will match this schema.
   * The response will be returned as parsed JSON.
   */
  responseSchema?: JsonSchema;
}

/** Result of a generate request */
export interface GenerateResult<T = string> {
  /** The generated response (text or parsed JSON when schema is provided) */
  data: T;
  /** Number of tokens in the prompt */
  promptTokens?: number;
  /** Number of tokens in the response */
  responseTokens?: number;
  /** Total tokens used */
  totalTokens?: number;
}

/** Template variable map for prompt builder */
export type TemplateVariables = Record<string, string | number | boolean>;
