"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@apollo/client/react";
import {
  FolderTree,
  MoreHorizontal,
  Pencil,
  Archive,
  Plus,
  ChevronRight,
  FolderOpen,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  GetCategoriesDocument,
  GetCategoryDocument,
  CategoryStatus,
  type GetCategoriesQuery,
} from "@/graphql/generated/graphql";
import { cn } from "@/lib/utils";
import { CreateCategoryDialog } from "./create-category-dialog";
import { EditCategoryDialog } from "./edit-category-dialog";
import { ArchiveCategoryDialog } from "./archive-category-dialog";

type Category = GetCategoriesQuery["categories"][number];

const STATUS_LABELS: Record<CategoryStatus, string> = {
  [CategoryStatus.Active]: "Active",
  [CategoryStatus.Suggested]: "Suggested",
  [CategoryStatus.Archived]: "Archived",
};

const STATUS_VARIANTS: Record<
  CategoryStatus,
  "default" | "secondary" | "outline"
> = {
  [CategoryStatus.Active]: "default",
  [CategoryStatus.Suggested]: "secondary",
  [CategoryStatus.Archived]: "outline",
};

interface CategoriesTableProps {
  showArchived?: boolean;
}

export function CategoriesTable({
  showArchived: initialShowArchived = false,
}: CategoriesTableProps) {
  const [showArchived, setShowArchived] = useState(initialShowArchived);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [editCategoryDialogOpen, setEditCategoryDialogOpen] = useState(false);
  const [archiveCategoryDialogOpen, setArchiveCategoryDialogOpen] =
    useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null,
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    new Set(),
  );

  const { data, loading, error } = useQuery(GetCategoriesDocument, {
    variables: { activeOnly: !showArchived },
  });

  const { data: categoryData } = useQuery(GetCategoryDocument, {
    variables: { id: selectedCategoryId ?? 0 },
    skip: selectedCategoryId === null,
  });

  const categories = data?.categories;

  // Build flat list with parent categories first, then their children (grouped)
  const flattenedCategories = useMemo(() => {
    if (!categories) return [];

    const rootCategories = categories.filter((cat) => !cat.parentName);
    const result: Array<Category & { isChild: boolean; parentId?: number }> =
      [];

    for (const root of rootCategories) {
      result.push({ ...root, isChild: false });

      // Add children if parent is expanded
      if (expandedCategories.has(root.id) && root.children) {
        for (const child of root.children) {
          // Find full child data from categories list (children array is shallow)
          const fullChild = categories.find((c) => c.id === child.id);
          if (fullChild) {
            result.push({ ...fullChild, isChild: true, parentId: root.id });
          }
        }
      }
    }

    return result;
  }, [categories, expandedCategories]);

  const handleEditCategory = (categoryId: number) => {
    setSelectedCategoryId(categoryId);
    setEditCategoryDialogOpen(true);
  };

  const handleArchiveCategory = (categoryId: number) => {
    setSelectedCategoryId(categoryId);
    setArchiveCategoryDialogOpen(true);
  };

  const toggleExpand = (categoryId: number) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  if (loading) {
    return <CategoriesTableSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/50 dark:bg-red-950/50">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load categories: {error.message}
        </p>
      </div>
    );
  }

  const allCategories = categories ?? [];
  const selectedCategory = allCategories.find(
    (cat) => cat.id === selectedCategoryId,
  );

  if (allCategories.length === 0) {
    return (
      <>
        <div className="rounded-xl border border-dashed p-8 text-center">
          <FolderTree className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">
            No categories yet. Create your first category to start classifying
            transactions.
          </p>
          <Button
            className="mt-4"
            onClick={() => setCreateCategoryOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Category
          </Button>
        </div>
        <CreateCategoryDialog
          open={createCategoryOpen}
          onOpenChange={setCreateCategoryOpen}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
          <Label htmlFor="show-archived" className="text-sm text-muted-foreground">
            Show archived
          </Label>
        </div>
        <Button size="sm" onClick={() => setCreateCategoryOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Category
        </Button>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[400px]">Category</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[100px] text-center">Children</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {flattenedCategories.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                isChild={category.isChild}
                isExpanded={expandedCategories.has(category.id)}
                hasChildren={(category.children?.length ?? 0) > 0}
                onToggleExpand={() => toggleExpand(category.id)}
                onEdit={() => handleEditCategory(category.id)}
                onArchive={() => handleArchiveCategory(category.id)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <CreateCategoryDialog
        open={createCategoryOpen}
        onOpenChange={setCreateCategoryOpen}
      />
      {categoryData?.category && (
        <EditCategoryDialog
          open={editCategoryDialogOpen}
          onOpenChange={setEditCategoryDialogOpen}
          category={categoryData.category}
        />
      )}
      {selectedCategory && (
        <ArchiveCategoryDialog
          open={archiveCategoryDialogOpen}
          onOpenChange={setArchiveCategoryDialogOpen}
          category={{
            id: selectedCategory.id,
            name: selectedCategory.name,
            fullPath: selectedCategory.fullPath,
          }}
        />
      )}
    </>
  );
}

interface CategoryRowProps {
  category: Category;
  isChild: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

function CategoryRow({
  category,
  isChild,
  isExpanded,
  hasChildren,
  onToggleExpand,
  onEdit,
  onArchive,
}: CategoryRowProps) {
  const isArchived = category.status === CategoryStatus.Archived;
  const FolderIcon = isExpanded ? FolderOpen : Folder;

  return (
    <TableRow className={cn(isArchived && "opacity-60")}>
      <TableCell>
        <div className={cn("flex items-center gap-2", isChild && "pl-8")}>
          {!isChild && hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onToggleExpand}
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
              <span className="sr-only">
                {isExpanded ? "Collapse" : "Expand"}
              </span>
            </Button>
          ) : (
            <div className="w-8" />
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <FolderIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="font-medium">{category.name}</div>
            {isChild && category.parentName && (
              <div className="text-xs text-muted-foreground">
                {category.fullPath}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANTS[category.status]}>
          {STATUS_LABELS[category.status]}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        {hasChildren ? (
          <span className="text-sm text-muted-foreground">
            {category.children?.length}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            {!isArchived && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onArchive} variant="destructive">
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function CategoriesTableSkeleton() {
  return (
    <div className="rounded-xl border">
      <div className="space-y-0">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-0"
          >
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
