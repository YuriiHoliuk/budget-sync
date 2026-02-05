/**
 * Resolver - Base class for GraphQL resolvers
 *
 * Provides a standardized pattern for defining GraphQL resolvers with:
 * - Type-safe resolver definitions
 * - DI support via TSyringe (inject dependencies in constructor)
 * - Clear separation between Query, Mutation, and field resolvers
 * - Automatic resolver map building for Apollo Server
 *
 * Subclasses must:
 * - Use @injectable() decorator
 * - Inject dependencies via constructor
 * - Implement getResolverMap() to return the resolver definition
 *
 * Example:
 * ```typescript
 * @injectable()
 * export class AccountsResolver extends Resolver {
 *   constructor(private accountRepository: AccountRepository) {
 *     super();
 *   }
 *
 *   getResolverMap(): ResolverMap {
 *     return {
 *       Query: {
 *         accounts: () => this.getAccounts(),
 *       },
 *     };
 *   }
 *
 *   private async getAccounts() {
 *     const accounts = await this.accountRepository.findAll();
 *     return accounts.map(mapAccountToGql);
 *   }
 * }
 * ```
 */

import type { IResolvers } from '@graphql-tools/utils';
import type { GraphQLContext } from '@modules/graphql/types.ts';

/**
 * Resolver map type that matches Apollo/graphql-tools expectations.
 * Includes Query, Mutation, Subscription, and entity field resolvers.
 */
export type ResolverMap = IResolvers<unknown, GraphQLContext>;

/**
 * Type for a resolver function
 */
export type ResolverFn<
  TResult = unknown,
  TParent = unknown,
  TArgs = unknown,
> = (
  parent: TParent,
  args: TArgs,
  context: GraphQLContext,
  info: unknown,
) => Promise<TResult> | TResult;

/**
 * Abstract base class for GraphQL resolvers.
 *
 * Subclasses must implement getResolverMap() to define their resolvers.
 * Dependencies should be injected via constructor.
 */
export abstract class Resolver {
  /**
   * Returns the resolver map for this resolver.
   * Called once during GraphQL server setup to register resolvers.
   *
   * @returns Resolver map with Query, Mutation, and/or field resolvers
   */
  abstract getResolverMap(): ResolverMap;
}
