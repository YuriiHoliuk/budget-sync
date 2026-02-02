import { ArchiveCategoryUseCase } from '@application/use-cases/ArchiveCategory.ts';
import type { CreateCategoryRequestDTO } from '@application/use-cases/CreateCategory.ts';
import { CreateCategoryUseCase } from '@application/use-cases/CreateCategory.ts';
import type { UpdateCategoryRequestDTO } from '@application/use-cases/UpdateCategory.ts';
import { UpdateCategoryUseCase } from '@application/use-cases/UpdateCategory.ts';
import type { Category } from '@domain/entities/Category.ts';
import {
  CATEGORY_REPOSITORY_TOKEN,
  CategoryRepository,
} from '@domain/repositories/CategoryRepository.ts';
import type { CategoryStatus } from '@domain/value-objects/index.ts';
import type { GraphQLContext } from '@modules/graphql/types.ts';

const STATUS_TO_GQL: Record<string, string> = {
  active: 'ACTIVE',
  suggested: 'SUGGESTED',
  archived: 'ARCHIVED',
};

const GQL_TO_STATUS: Record<string, CategoryStatus> = {
  ACTIVE: 'active',
  SUGGESTED: 'suggested',
  ARCHIVED: 'archived',
};

interface CategoryGql {
  id: number;
  name: string;
  parentName: string | null;
  status: string;
  fullPath: string;
}

function mapCategoryToGql(category: Category): CategoryGql {
  return {
    id: category.dbId ?? 0,
    name: category.name,
    parentName: category.parent ?? null,
    status: STATUS_TO_GQL[category.status] ?? 'ACTIVE',
    fullPath: category.fullPath,
  };
}

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

function mapCreateInput(input: CreateCategoryInput): CreateCategoryRequestDTO {
  return {
    name: input.name,
    parentName: input.parentName ?? null,
    status: input.status ?? undefined,
  };
}

function mapUpdateInput(input: UpdateCategoryInput): UpdateCategoryRequestDTO {
  return {
    id: input.id,
    name: input.name ?? undefined,
    parentName: input.parentName !== undefined ? input.parentName : undefined,
    status: input.status
      ? (GQL_TO_STATUS[input.status] ?? undefined)
      : undefined,
  };
}

export const categoriesResolver = {
  Query: {
    categories: async (
      _parent: unknown,
      args: { activeOnly: boolean },
      context: GraphQLContext,
    ) => {
      const repository = context.container.resolve<CategoryRepository>(
        CATEGORY_REPOSITORY_TOKEN,
      );

      const allCategories = args.activeOnly
        ? await repository.findActive()
        : await repository.findAll();

      return allCategories.map(mapCategoryToGql);
    },

    category: async (
      _parent: unknown,
      args: { id: number },
      context: GraphQLContext,
    ) => {
      const repository = context.container.resolve<CategoryRepository>(
        CATEGORY_REPOSITORY_TOKEN,
      );
      const category = await repository.findById(args.id);
      return category ? mapCategoryToGql(category) : null;
    },
  },

  Mutation: {
    createCategory: async (
      _parent: unknown,
      args: { input: CreateCategoryInput },
      context: GraphQLContext,
    ) => {
      const useCase = context.container.resolve(CreateCategoryUseCase);
      const category = await useCase.execute(mapCreateInput(args.input));
      return mapCategoryToGql(category);
    },

    updateCategory: async (
      _parent: unknown,
      args: { input: UpdateCategoryInput },
      context: GraphQLContext,
    ) => {
      const useCase = context.container.resolve(UpdateCategoryUseCase);
      const category = await useCase.execute(mapUpdateInput(args.input));
      return mapCategoryToGql(category);
    },

    archiveCategory: async (
      _parent: unknown,
      args: { id: number },
      context: GraphQLContext,
    ) => {
      const useCase = context.container.resolve(ArchiveCategoryUseCase);
      const category = await useCase.execute({ id: args.id });
      return mapCategoryToGql(category);
    },
  },

  Category: {
    children: async (
      parent: CategoryGql,
      _args: unknown,
      context: GraphQLContext,
    ) => {
      const repository = context.container.resolve<CategoryRepository>(
        CATEGORY_REPOSITORY_TOKEN,
      );
      const allCategories = await repository.findAll();
      const children = allCategories.filter(
        (category) => category.parent === parent.name,
      );
      return children.map(mapCategoryToGql);
    },
  },
};
