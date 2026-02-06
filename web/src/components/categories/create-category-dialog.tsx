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
  CreateCategoryDocument,
  GetCategoriesDocument,
  CategoryStatus,
} from "@/graphql/generated/graphql";

interface CreateCategoryDialogProps {
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

export function CreateCategoryDialog({
  open,
  onOpenChange,
}: CreateCategoryDialogProps) {
  const [name, setName] = useState("");
  const [parentName, setParentName] = useState<string | null>(null);
  const [status, setStatus] = useState<CategoryStatus>(CategoryStatus.Active);
  const [error, setError] = useState("");

  // Fetch root categories to use as potential parents
  const { data: categoriesData } = useQuery(GetCategoriesDocument, {
    variables: { activeOnly: true },
  });

  const [createCategory, { loading }] = useMutation(CreateCategoryDocument, {
    refetchQueries: [
      { query: GetCategoriesDocument, variables: { activeOnly: true } },
      { query: GetCategoriesDocument, variables: { activeOnly: false } },
    ],
  });

  // Get only root categories (no parent) for the parent selector
  const rootCategories = (categoriesData?.categories ?? []).filter(
    (category) => !category.parentName,
  );

  const canSubmit = name.trim() !== "" && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError("");

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
    setParentName(null);
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Category</DialogTitle>
          <DialogDescription>
            Add a new category for transaction classification. Categories can be
            nested under parent categories.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
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
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category-parent">Parent Category (Optional)</Label>
            <Select
              value={parentName ?? "none"}
              onValueChange={(value) =>
                setParentName(value === "none" ? null : value)
              }
            >
              <SelectTrigger id="category-parent" className="w-full">
                <SelectValue placeholder="No parent (root category)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No parent (root category)</SelectItem>
                {rootCategories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <SelectTrigger id="category-status" className="w-full">
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

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {loading ? "Creating..." : "Create Category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
