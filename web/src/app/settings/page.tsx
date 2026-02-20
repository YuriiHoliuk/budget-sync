"use client";

import { RulesSection } from "@/components/rules/rules-section";
import {
  CreateBudgetizationRuleDocument,
  CreateCategorizationRuleDocument,
  DeleteBudgetizationRuleDocument,
  DeleteCategorizationRuleDocument,
  GetBudgetizationRulesDocument,
  GetCategorizationRulesDocument,
  UpdateBudgetizationRuleDocument,
  UpdateCategorizationRuleDocument,
} from "@/graphql/generated/graphql";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure AI rules for automatic transaction processing.
        </p>
      </div>

      <RulesSection
        title="Categorization Rules"
        description="Instructions the AI follows when assigning categories to transactions. Higher priority rules are applied first."
        ruleType="Categorization"
        queryDocument={GetCategorizationRulesDocument}
        queryKey="categorizationRules"
        createMutationDocument={CreateCategorizationRuleDocument}
        updateMutationDocument={UpdateCategorizationRuleDocument}
        deleteMutationDocument={DeleteCategorizationRuleDocument}
      />

      <RulesSection
        title="Budgetization Rules"
        description="Instructions the AI follows when assigning budgets to transactions. Higher priority rules are applied first."
        ruleType="Budgetization"
        queryDocument={GetBudgetizationRulesDocument}
        queryKey="budgetizationRules"
        createMutationDocument={CreateBudgetizationRuleDocument}
        updateMutationDocument={UpdateBudgetizationRuleDocument}
        deleteMutationDocument={DeleteBudgetizationRuleDocument}
      />
    </div>
  );
}
