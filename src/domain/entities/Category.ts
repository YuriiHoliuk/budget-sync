import type { CategoryStatus } from '../value-objects/index.ts';

export interface CategoryProps {
  name: string;
  parent?: string;
  status: CategoryStatus;
  dbId?: number | null;
}

export class Category {
  private constructor(
    public readonly id: string,
    private readonly props: CategoryProps,
  ) {}

  static create(props: CategoryProps, id?: string): Category {
    return new Category(id ?? props.name, props);
  }

  get name(): string {
    return this.props.name;
  }

  get parent(): string | undefined {
    return this.props.parent;
  }

  get status(): CategoryStatus {
    return this.props.status;
  }

  get dbId(): number | null {
    return this.props.dbId ?? null;
  }

  /** Returns immediate full path: "Parent > Child" (only 2 levels) */
  get fullPath(): string {
    return this.parent ? `${this.parent} > ${this.name}` : this.name;
  }

  /**
   * Resolves the complete hierarchy path for a category.
   * Example: "Grandparent > Parent > Child"
   *
   * @param category - The category to resolve the path for
   * @param allCategories - All available categories for parent lookup
   * @returns Full path string with all ancestor names
   */
  static resolveFullPath(
    category: Category,
    allCategories: Category[],
  ): string {
    const categoryMap = new Map(allCategories.map((cat) => [cat.name, cat]));
    const pathParts: string[] = [];
    let current: Category | undefined = category;

    while (current) {
      pathParts.unshift(current.name);
      current = current.parent ? categoryMap.get(current.parent) : undefined;
    }

    return pathParts.join(' > ');
  }

  withDbId(dbId: number): Category {
    return Category.create({ ...this.props, dbId }, this.id);
  }
}
