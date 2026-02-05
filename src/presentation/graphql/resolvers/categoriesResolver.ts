import { ArchiveCategoryUseCase } from '@application/use-cases/ArchiveCategory.ts';
import type { CreateCategoryRequestDTO } from '@application/use-cases/CreateCategory.ts';
import { CreateCategoryUseCase } from '@application/use-cases/CreateCategory.ts';
import type { UpdateCategoryRequestDTO } from '@application/use-cases/UpdateCategory.ts';
import { UpdateCategoryUseCase } from '@application/use-cases/UpdateCategory.ts';
import {
  CATEGORY_REPOSITORY_TOKEN,
  type CategoryRepository,
} from '@domain/repositories/CategoryRepository.ts';
import { inject, injectable } from 'tsyringe';
import {
  type CategoryGql,
  GQL_TO_CATEGORY_STATUS,
  mapCategoryToGql,
} from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

interface CreateCategoryInput {
  name: string;
  parentName?: string | null;
  status?: string | null;
}

interface UpdateCategoryInput {
  id: number;
  name?: string | null;
  parentName?: string | null;
  status?: string | null;
}

@injectable()
export class CategoriesResolver extends Resolver {
  constructor(
    @inject(CATEGORY_REPOSITORY_TOKEN)
    private categoryRepository: CategoryRepository,
    private createCategoryUseCase: CreateCategoryUseCase,
    private updateCategoryUseCase: UpdateCategoryUseCase,
    private archiveCategoryUseCase: ArchiveCategoryUseCase,
  ) {
    super();
  }

  getResolverMap(): ResolverMap {
    return {
      Query: {
        categories: (_parent: unknown, args: { activeOnly: boolean }) =>
          this.getCategories(args.activeOnly),
        category: (_parent: unknown, args: { id: number }) =>
          this.getCategoryById(args.id),
      },
      Mutation: {
        createCategory: (
          _parent: unknown,
          args: { input: CreateCategoryInput },
        ) => this.createCategory(args.input),
        updateCategory: (
          _parent: unknown,
          args: { input: UpdateCategoryInput },
        ) => this.updateCategory(args.input),
        archiveCategory: (_parent: unknown, args: { id: number }) =>
          this.archiveCategory(args.id),
      },
      Category: {
        children: (parent: CategoryGql) => this.getChildCategories(parent.name),
      },
    };
  }

  private async getCategories(activeOnly: boolean) {
    const categories = activeOnly
      ? await this.categoryRepository.findActive()
      : await this.categoryRepository.findAll();
    return categories.map(mapCategoryToGql);
  }

  private async getCategoryById(id: number) {
    const category = await this.categoryRepository.findById(id);
    return category ? mapCategoryToGql(category) : null;
  }

  private async createCategory(input: CreateCategoryInput) {
    const category = await this.createCategoryUseCase.execute(
      this.mapCreateInput(input),
    );
    return mapCategoryToGql(category);
  }

  private async updateCategory(input: UpdateCategoryInput) {
    const category = await this.updateCategoryUseCase.execute(
      this.mapUpdateInput(input),
    );
    return mapCategoryToGql(category);
  }

  private async archiveCategory(id: number) {
    const category = await this.archiveCategoryUseCase.execute({ id });
    return mapCategoryToGql(category);
  }

  private async getChildCategories(parentName: string) {
    const allCategories = await this.categoryRepository.findAll();
    const children = allCategories.filter(
      (category) => category.parent === parentName,
    );
    return children.map(mapCategoryToGql);
  }

  private mapCreateInput(input: CreateCategoryInput): CreateCategoryRequestDTO {
    return {
      name: input.name,
      parentName: input.parentName ?? null,
      status: input.status ?? undefined,
    };
  }

  private mapUpdateInput(input: UpdateCategoryInput): UpdateCategoryRequestDTO {
    return {
      id: input.id,
      name: input.name ?? undefined,
      parentName: input.parentName !== undefined ? input.parentName : undefined,
      status: input.status
        ? (GQL_TO_CATEGORY_STATUS[input.status] ?? undefined)
        : undefined,
    };
  }
}
