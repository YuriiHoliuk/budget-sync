"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import {
  CreateCategoryDocument,
  GetCategoriesDocument,
  CategoryStatus,
} from "@/graphql/generated/graphql";

interface CreateCategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTIONS = [
  {
    value: CategoryStatus.Active,
    label: "Active",
    description: "Confirmed by user, available for assignment.",
  },
  {
    value: CategoryStatus.Suggested,
    label: "Suggested",
    description: "Proposed by AI, awaiting user review.",
  },
];

export function CreateCategorySheet({
  open,
  onOpenChange,
}: CreateCategorySheetProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);
  const [status, setStatus] = useState<CategoryStatus>(CategoryStatus.Active);
  const [error, setError] = useState("");

  // Fetch categories for the parent selector
  const { data: categoriesData } = useQuery(GetCategoriesDocument, {
    variables: { activeOnly: true },
  });

  const [createCategory, { loading }] = useMutation(CreateCategoryDocument, {
    refetchQueries: [
      { query: GetCategoriesDocument, variables: { activeOnly: true } },
      { query: GetCategoriesDocument, variables: { activeOnly: false } },
    ],
  });

  const categories = categoriesData?.categories ?? [];

  const canSubmit = name.trim() !== "" && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

    const parentName = parentId
      ? categories.find((category) => category.id === parentId)?.name
      : undefined;

    try {
      await createCategory({
        variables: {
          input: {
            name: name.trim(),
            ...(parentName ? { parentName } : {}),
            status,
          },
        },
      });
      handleClose();
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to create category";
      setError(message);
    }
  };

  const handleClose = () => {
    setName("");
    setParentId(null);
    setStatus(CategoryStatus.Active);
    setError("");
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleClose();
    } else {
      onOpenChange(true);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-md" data-qa="sheet-create-category">
        <SheetHeader>
          <SheetTitle>Create Category</SheetTitle>
          <SheetDescription>
            Add a new category for transaction classification. Categories can be
            nested under parent categories.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                placeholder="e.g., Groceries, Entertainment, Utilities"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSubmit) {
                    handleSubmit();
                  }
                }}
                data-qa="input-category-name"
              />
            </div>

            <div className="grid gap-2">
              <Label>Parent Category (Optional)</Label>
              <CategoryCombobox
                categories={categories}
                value={parentId}
                onValueChange={setParentId}
                allowNone
                rootOnly
                placeholder="No parent (root category)"
                data-qa="select-parent-category"
              />
              <p className="text-xs text-muted-foreground">
                Select a parent to create a subcategory.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category-status">Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as CategoryStatus)}
              >
                <SelectTrigger id="category-status" className="w-full" data-qa="select-category-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {STATUS_OPTIONS.find((opt) => opt.value === status)?.description}
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-qa="btn-create-save">
            {loading ? "Creating..." : "Create Category"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
