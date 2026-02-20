"use client";

import { useState } from "react";
import type { DocumentNode } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import { MoreHorizontal, Pencil, Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteRuleDialog } from "./delete-rule-dialog";
import { RuleFormSheet } from "./rule-form-sheet";

interface RuleItem {
  id: number;
  rule: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface RulesSectionProps {
  title: string;
  description: string;
  ruleType: "Categorization" | "Budgetization";
  queryDocument: DocumentNode;
  createMutationDocument: DocumentNode;
  updateMutationDocument: DocumentNode;
  deleteMutationDocument: DocumentNode;
  queryKey: string;
}

export function RulesSection({
  title,
  description,
  ruleType,
  queryDocument,
  createMutationDocument,
  updateMutationDocument,
  deleteMutationDocument,
  queryKey,
}: RulesSectionProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<RuleItem | null>(null);

  const { data, loading } = useQuery(queryDocument);
  const queryData = data as Record<string, RuleItem[]> | undefined;
  const rules: RuleItem[] = queryData?.[queryKey] ?? [];

  const handleEdit = (rule: RuleItem) => {
    setSelectedRule(rule);
    setEditOpen(true);
  };

  const handleDelete = (rule: RuleItem) => {
    setSelectedRule(rule);
    setDeleteOpen(true);
  };

  return (
    <div data-qa={`rules-section-${ruleType.toLowerCase()}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-qa="btn-add-rule"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Rule
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No rules yet. Add a rule to guide how the AI assigns{" "}
              {ruleType === "Categorization" ? "categories" : "budgets"} to
              transactions.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Priority</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} data-qa="rule-row">
                    <TableCell className="font-mono text-sm">
                      {rule.priority}
                    </TableCell>
                    <TableCell className="max-w-0">
                      <p className="truncate text-sm" title={rule.rule}>
                        {rule.rule}
                      </p>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            data-qa="btn-rule-actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleEdit(rule)}
                            data-qa="btn-edit-rule"
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(rule)}
                            variant="destructive"
                            data-qa="btn-delete-rule"
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <RuleFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        ruleType={ruleType}
        mutationDocument={createMutationDocument}
        refetchDocument={queryDocument}
      />

      {selectedRule && (
        <>
          <RuleFormSheet
            key={`edit-${selectedRule.id}`}
            open={editOpen}
            onOpenChange={setEditOpen}
            mode="edit"
            ruleType={ruleType}
            mutationDocument={updateMutationDocument}
            refetchDocument={queryDocument}
            initialValues={selectedRule}
          />
          <DeleteRuleDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            rule={selectedRule}
            deleteMutationDocument={deleteMutationDocument}
            refetchDocument={queryDocument}
            ruleType={ruleType}
          />
        </>
      )}
    </div>
  );
}
