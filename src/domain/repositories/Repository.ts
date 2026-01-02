/**
 * Generic base repository abstract class.
 * Domain layer doesn't know about storage implementation details.
 *
 * @template TEntity - The entity type managed by this repository
 * @template TId - The identifier type for the entity
 */
export abstract class Repository<TEntity, TId> {
  abstract findById(id: TId): Promise<TEntity | null>;
  abstract findAll(): Promise<TEntity[]>;
  abstract save(entity: TEntity): Promise<void>;
  abstract update(entity: TEntity): Promise<void>;
  abstract delete(id: TId): Promise<void>;
}
