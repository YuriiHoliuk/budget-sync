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
  UpdateCategoryDocument,
  GetCategoriesDocument,
  CategoryStatus,
  type GetCategoryQuery,
} from "@/graphql/generated/graphql";

type Category = NonNullable<GetCategoryQuery["category"]>;

interface EditCategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category;
}

const STATUS_OPTIONS = [
  { value: CategoryStatus.Active, label: "Active" },
  { value: CategoryStatus.Suggested, label: "Suggested" },
  { value: CategoryStatus.Archived, label: "Archived" },
];

// Inner component that resets when category.id changes via key prop
function EditCategorySheetContent({
  category,
  onOpenChange,
}: {
  category: Category;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(category.name);
  const [status, setStatus] = useState<CategoryStatus>(category.status);
  const [error, setError] = useState("");

  // Fetch categories for the parent selector
  const { data: categoriesData } = useQuery(GetCategoriesDocument, {
    variables: { activeOnly: false },
  });

  const [updateCategory, { loading }] = useMutation(UpdateCategoryDocument, {
    refetchQueries: [
      { query: GetCategoriesDocument, variables: { activeOnly: true } },
      { query: GetCategoriesDocument, variables: { activeOnly: false } },
    ],
  });

  const categories = categoriesData?.categories ?? [];

  // Derive initial parentId from category's parentName
  const initialParentId = category.parentName
    ? (categories.find((cat) => cat.name === category.parentName)?.id ?? null)
    : null;

  const [parentId, setParentId] = useState<number | null>(initialParentId);

  // Update parentId when categories load and initial value becomes available
  const parentIdResolved = parentId ?? initialParentId;

  const canSubmit = name.trim() !== "" && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

    const parentName = parentIdResolved
      ? categories.find((cat) => cat.id === parentIdResolved)?.name
      : undefined;

    try {
      await updateCategory({
        variables: {
          input: {
            id: category.id,
            name: name.trim(),
            parentName: parentName ?? undefined,
            status,
          },
        },
      });
      onOpenChange(false);
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update category";
      setError(message);
    }
  };

  // Check if this is a parent category (has children)
  const hasChildren = category.children && category.children.length > 0;

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit Category</SheetTitle>
        <SheetDescription>
          Update category details. Changes will affect how transactions are
          classified.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-category-name">Name</Label>
            <Input
              id="edit-category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSubmit) {
                  handleSubmit();
                }
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label>Parent Category</Label>
            <CategoryCombobox
              categories={categories}
              value={parentIdResolved}
              onValueChange={setParentId}
              allowNone
              rootOnly
              excludeIds={[category.id]}
              placeholder="No parent (root category)"
              disabled={hasChildren}
            />
            {hasChildren && (
              <p className="text-xs text-muted-foreground">
                Cannot change parent for categories with children.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-category-status">Status</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as CategoryStatus)}
            >
              <SelectTrigger id="edit-category-status" className="w-full">
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
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </div>

      <SheetFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </SheetFooter>
    </>
  );
}

export function EditCategorySheet({
  open,
  onOpenChange,
  category,
}: EditCategorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md" data-qa="sheet-edit-category">
        <EditCategorySheetContent
          key={category.id}
          category={category}
          onOpenChange={onOpenChange}
        />
      </SheetContent>
    </Sheet>
  );
}
