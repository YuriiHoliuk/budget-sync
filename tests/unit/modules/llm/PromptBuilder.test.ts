import { describe, expect, test } from 'bun:test';
import { PromptBuilder } from '@modules/llm/PromptBuilder.ts';

describe('PromptBuilder', () => {
  describe('build', () => {
    test('replaces single variable', () => {
      const builder = new PromptBuilder('Hello, {{name}}!');
      const result = builder.build({ name: 'World' });
      expect(result).toBe('Hello, World!');
    });

    test('replaces multiple different variables', () => {
      const builder = new PromptBuilder(
        'Name: {{name}}, Age: {{age}}, Active: {{active}}',
      );
      const result = builder.build({
        name: 'John',
        age: 30,
        active: true,
      });
      expect(result).toBe('Name: John, Age: 30, Active: true');
    });

    test('replaces same variable used multiple times', () => {
      const builder = new PromptBuilder(
        '{{item}} is great. I love {{item}}. Did I mention {{item}}?',
      );
      const result = builder.build({ item: 'TypeScript' });
      expect(result).toBe(
        'TypeScript is great. I love TypeScript. Did I mention TypeScript?',
      );
    });

    test('converts number value to string', () => {
      const builder = new PromptBuilder('Amount: {{amount}}');
      const result = builder.build({ amount: 42.5 });
      expect(result).toBe('Amount: 42.5');
    });

    test('converts boolean value to string', () => {
      const builder = new PromptBuilder('Enabled: {{enabled}}');
      const resultTrue = builder.build({ enabled: true });
      const resultFalse = builder.build({ enabled: false });
      expect(resultTrue).toBe('Enabled: true');
      expect(resultFalse).toBe('Enabled: false');
    });

    test('leaves unreplaced variables in template', () => {
      const builder = new PromptBuilder('Hello, {{name}}! Your ID is {{id}}.');
      const result = builder.build({ name: 'John' });
      expect(result).toBe('Hello, John! Your ID is {{id}}.');
    });

    test('returns template unchanged when no variables provided', () => {
      const builder = new PromptBuilder('No variables here');
      const result = builder.build();
      expect(result).toBe('No variables here');
    });

    test('returns template unchanged when empty variables provided', () => {
      const builder = new PromptBuilder('Hello, {{name}}!');
      const result = builder.build({});
      expect(result).toBe('Hello, {{name}}!');
    });

    test('ignores extra variables not in template', () => {
      const builder = new PromptBuilder('Hello, {{name}}!');
      const result = builder.build({ name: 'World', extra: 'ignored' });
      expect(result).toBe('Hello, World!');
    });
  });

  describe('getTemplate', () => {
    test('returns the original template string', () => {
      const template = 'Hello, {{name}}!';
      const builder = new PromptBuilder(template);
      expect(builder.getTemplate()).toBe(template);
    });
  });

  describe('getVariableNames', () => {
    test('extracts single variable name', () => {
      const builder = new PromptBuilder('Hello, {{name}}!');
      expect(builder.getVariableNames()).toEqual(['name']);
    });

    test('extracts multiple variable names', () => {
      const builder = new PromptBuilder('{{greeting}}, {{name}}! Age: {{age}}');
      const names = builder.getVariableNames();
      expect(names).toContain('greeting');
      expect(names).toContain('name');
      expect(names).toContain('age');
      expect(names).toHaveLength(3);
    });

    test('returns unique variable names for repeated variables', () => {
      const builder = new PromptBuilder('{{name}} and {{name}} again');
      expect(builder.getVariableNames()).toEqual(['name']);
    });

    test('returns empty array when no variables in template', () => {
      const builder = new PromptBuilder('No variables here');
      expect(builder.getVariableNames()).toEqual([]);
    });
  });
});
