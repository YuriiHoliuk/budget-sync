/**
 * Prompt template for budget assignment.
 *
 * This is a focused prompt that handles ONLY budget selection,
 * separate from category assignment to avoid confusing the model.
 */
export const BUDGET_ASSIGNMENT_PROMPT_TEMPLATE = `
<context>
You are a financial transaction budgeting system for a personal finance application.
Your task is to assign a BUDGET to a bank transaction.
</context>

<custom_rules>
{{#if budgetRules}}
User-defined budgetization rules (HIGHEST PRIORITY - follow these BEFORE applying general logic):
{{budgetRules}}

IMPORTANT: If any rule above matches the transaction, you MUST apply it.
Rules take precedence over your general budgeting logic.
{{/if}}
</custom_rules>

<budgets>
Available budgets:
{{budgets}}

Budget is optional. Assign only if you are confident in the match.
</budgets>

<transaction>
Description: {{description}}
Amount: {{amount}}
Date: {{date}}
Counterparty: {{counterparty}}
MCC code: {{mcc}}
Bank category: {{bankCategory}}
Assigned category: {{assignedCategory}}
</transaction>

<instructions>
1. FIRST check if any custom rule applies to this transaction - custom rules have highest priority
2. Use the assigned category as context to help determine the appropriate budget
3. Choose a budget from the list; if nothing fits, do not choose any (set budget = null)
4. Provide a brief explanation (1-2 sentences in English)
5. If uncertain about budget assignment, set budget = null with an explanation
</instructions>
`;
