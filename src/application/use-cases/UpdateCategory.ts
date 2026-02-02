import type { Category } from '@domain/entities/Category.ts';
import {
  CategoryNameTakenError,
  CategoryNotFoundError,
  ParentCategoryNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import {
  CATEGORY_REPOSITORY_TOKEN,
  type CategoryRepository,
} from '@domain/repositories/CategoryRepository.ts';
import type { CategoryStatus } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface UpdateCategoryRequestDTO {
  id: number;
  name?: string;
  parentName?: string | null;
  status?: CategoryStatus;
}

@injectable()
export class UpdateCategoryUseCase extends UseCase<
  UpdateCategoryRequestDTO,
  Category
> {
  constructor(
    @inject(CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepository: CategoryRepository,
  ) {
    super();
  }

  async execute(request: UpdateCategoryRequestDTO): Promise<Category> {
    const existing = await this.findCategory(request.id);
    await this.ensureNameIsAvailable(request.name, request.id);
    await this.ensureParentExists(request.parentName);

    const updated = existing.withUpdatedProps({
      name: request.name,
      parent: request.parentName,
      status: request.status,
    });
    return this.categoryRepository.update(updated);
  }

  private async findCategory(categoryId: number): Promise<Category> {
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) {
      throw new CategoryNotFoundError(categoryId);
    }
    return category;
  }

  private async ensureNameIsAvailable(
    name: string | undefined,
    currentId: number,
  ): Promise<void> {
    if (!name) {
      return;
    }
    const existing = await this.categoryRepository.findByName(name);
    if (existing && existing.dbId !== currentId) {
      throw new CategoryNameTakenError(name);
    }
  }

  private async ensureParentExists(
    parentName: string | null | undefined,
  ): Promise<void> {
    if (parentName === undefined || parentName === null) {
      return;
    }
    const parent = await this.categoryRepository.findByName(parentName);
    if (!parent) {
      throw new ParentCategoryNotFoundError(parentName);
    }
  }
}
