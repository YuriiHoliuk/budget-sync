import { Category } from '@domain/entities/Category.ts';
import {
  CategoryNameTakenError,
  ParentCategoryNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import {
  CATEGORY_REPOSITORY_TOKEN,
  type CategoryRepository,
} from '@domain/repositories/CategoryRepository.ts';
import { CategoryStatus } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface CreateCategoryRequestDTO {
  name: string;
  parentName?: string | null;
  status?: string;
}

@injectable()
export class CreateCategoryUseCase extends UseCase<
  CreateCategoryRequestDTO,
  Category
> {
  constructor(
    @inject(CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepository: CategoryRepository,
  ) {
    super();
  }

  async execute(request: CreateCategoryRequestDTO): Promise<Category> {
    await this.ensureNameIsAvailable(request.name);
    await this.ensureParentExists(request.parentName);

    const category = this.buildCategory(request);
    return this.categoryRepository.saveAndReturn(category);
  }

  private async ensureNameIsAvailable(name: string): Promise<void> {
    const existing = await this.categoryRepository.findByName(name);
    if (existing) {
      throw new CategoryNameTakenError(name);
    }
  }

  private async ensureParentExists(
    parentName: string | null | undefined,
  ): Promise<void> {
    if (!parentName) {
      return;
    }
    const parent = await this.categoryRepository.findByName(parentName);
    if (!parent) {
      throw new ParentCategoryNotFoundError(parentName);
    }
  }

  private buildCategory(request: CreateCategoryRequestDTO): Category {
    const status = this.resolveStatus(request.status);
    return Category.create({
      name: request.name,
      parent: request.parentName ?? undefined,
      status,
    });
  }

  private resolveStatus(status?: string): CategoryStatus {
    if (status === 'SUGGESTED' || status === 'suggested') {
      return CategoryStatus.SUGGESTED;
    }
    return CategoryStatus.ACTIVE;
  }
}
