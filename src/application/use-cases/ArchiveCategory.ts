import type { Category } from '@domain/entities/Category.ts';
import { CategoryNotFoundError } from '@domain/errors/DomainErrors.ts';
import {
  CATEGORY_REPOSITORY_TOKEN,
  type CategoryRepository,
} from '@domain/repositories/CategoryRepository.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface ArchiveCategoryRequestDTO {
  id: number;
}

@injectable()
export class ArchiveCategoryUseCase extends UseCase<
  ArchiveCategoryRequestDTO,
  Category
> {
  constructor(
    @inject(CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepository: CategoryRepository,
  ) {
    super();
  }

  async execute(request: ArchiveCategoryRequestDTO): Promise<Category> {
    const category = await this.categoryRepository.findById(request.id);
    if (!category) {
      throw new CategoryNotFoundError(request.id);
    }

    const archived = category.archive();
    return this.categoryRepository.update(archived);
  }
}
