/**
 * PromptBuilder - Template variable injection for prompts
 *
 * Provides simple string templating with variable substitution.
 */

import type { TemplateVariables } from './types.ts';

export class PromptBuilder {
  private readonly template: string;

  constructor(template: string) {
    this.template = template;
  }

  /**
   * Build the prompt by replacing template variables with values
   *
   * Variables are specified in the template using {{variableName}} syntax.
   *
   * @param variables - Map of variable names to values
   * @returns The prompt with all variables replaced
   *
   * @example
   * ```typescript
   * const builder = new PromptBuilder('Hello, {{name}}!');
   * const prompt = builder.build({ name: 'World' });
   * // Returns: 'Hello, World!'
   * ```
   */
  build(variables: TemplateVariables = {}): string {
    let result = this.template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      result = result.replaceAll(placeholder, String(value));
    }

    return result;
  }

  /**
   * Get the raw template string
   */
  getTemplate(): string {
    return this.template;
  }

  /**
   * Extract variable names from the template
   *
   * @returns Array of variable names found in the template
   */
  getVariableNames(): string[] {
    const matches = this.template.matchAll(/\{\{(\w+)\}\}/g);
    const names = new Set<string>();

    for (const match of matches) {
      const variableName = match[1];
      if (variableName) {
        names.add(variableName);
      }
    }

    return Array.from(names);
  }
}
