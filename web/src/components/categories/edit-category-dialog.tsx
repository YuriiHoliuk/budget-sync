"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UpdateCategoryDocument,
  GetCategoriesDocument,
  CategoryStatus,
  type GetCategoryQuery,
} from "@/graphql/generated/graphql";

type Category = NonNullable<GetCategoryQuery["category"]>;

interface EditCategoryDialogProps {
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
function EditCategoryDialogContent({
  category,
  onOpenChange,
}: {
  category: Category;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(category.name);
  const [parentName, setParentName] = useState<string | null>(
    category.parentName ?? null,
  );
  const [status, setStatus] = useState<CategoryStatus>(category.status);
  const [error, setError] = useState("");

  // Fetch root categories to use as potential parents
  const { data: categoriesData } = useQuery(GetCategoriesDocument, {
    variables: { activeOnly: false },
  });

  const [updateCategory, { loading }] = useMutation(UpdateCategoryDocument, {
    refetchQueries: [
      { query: GetCategoriesDocument, variables: { activeOnly: true } },
      { query: GetCategoriesDocument, variables: { activeOnly: false } },
    ],
  });

  // Get only root categories (no parent) that are not this category or its children
  const rootCategories = (categoriesData?.categories ?? []).filter(
    (cat) =>
      !cat.parentName && // Must be a root category
      cat.id !== category.id && // Can't be itself
      cat.name !== category.name, // Double check
  );

  const canSubmit = name.trim() !== "" && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

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
      <DialogHeader>
        <DialogTitle>Edit Category</DialogTitle>
        <DialogDescription>
          Update category details. Changes will affect how transactions are
          classified.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
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
          <Label htmlFor="edit-category-parent">Parent Category</Label>
          <Select
            value={parentName ?? "none"}
            onValueChange={(value) =>
              setParentName(value === "none" ? null : value)
            }
            disabled={hasChildren}
          >
            <SelectTrigger id="edit-category-parent" className="w-full">
              <SelectValue placeholder="No parent (root category)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No parent (root category)</SelectItem>
              {rootCategories.map((cat) => (
                <SelectItem key={cat.id} value={cat.name}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      <DialogFooter>
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
      </DialogFooter>
    </>
  );
}

export function EditCategoryDialog({
  open,
  onOpenChange,
  category,
}: EditCategoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <EditCategoryDialogContent
          key={category.id}
          category={category}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
