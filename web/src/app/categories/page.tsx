"use client";

import { CategoriesTable } from "@/components/categories/categories-table";

export default function CategoriesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage transaction categories for classification and reporting.
        </p>
      </div>
      <CategoriesTable />
    </div>
  );
}
