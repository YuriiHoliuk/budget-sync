import { AllocationNotFoundError } from '@domain/errors/DomainErrors.ts';
import {
  ALLOCATION_REPOSITORY_TOKEN,
  type AllocationRepository,
} from '@domain/repositories/AllocationRepository.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface DeleteAllocationRequestDTO {
  id: number;
}

@injectable()
export class DeleteAllocationUseCase extends UseCase<
  DeleteAllocationRequestDTO,
  void
> {
  constructor(
    @inject(ALLOCATION_REPOSITORY_TOKEN)
    private readonly allocationRepository: AllocationRepository,
  ) {
    super();
  }

  async execute(request: DeleteAllocationRequestDTO): Promise<void> {
    await this.ensureAllocationExists(request.id);
    await this.allocationRepository.delete(request.id);
  }

  private async ensureAllocationExists(allocationId: number): Promise<void> {
    const allocation = await this.allocationRepository.findById(allocationId);
    if (!allocation) {
      throw new AllocationNotFoundError(allocationId);
    }
  }
}
