/**
 * GraphQL Resolver Registry
 *
 * Exports all resolver classes and provides utilities for building resolver maps.
 * Resolvers are injectable classes that extend the Resolver base class.
 *
 * Usage:
 * ```typescript
 * import { RESOLVER_CLASSES, buildResolverMaps } from './resolvers';
 *
 * // In server setup:
 * const resolvers = buildResolverMaps(container);
 * ```
 */

import type { DependencyContainer, InjectionToken } from 'tsyringe';
import type { Resolver, ResolverMap } from '../Resolver.ts';
import { AccountsResolver } from './accountsResolver.ts';
import { AllocationsResolver } from './allocationsResolver.ts';
import { BudgetsResolver } from './budgetsResolver.ts';
import { CategoriesResolver } from './categoriesResolver.ts';
import { HealthResolver } from './healthResolver.ts';
import { MonthlyOverviewResolver } from './monthlyOverviewResolver.ts';
import { SubscriptionsResolver } from './subscriptionsResolver.ts';
import { TransactionsResolver } from './transactionsResolver.ts';

/** All resolver classes in the application */
export const RESOLVER_CLASSES: InjectionToken<Resolver>[] = [
  HealthResolver,
  AccountsResolver,
  AllocationsResolver,
  BudgetsResolver,
  CategoriesResolver,
  MonthlyOverviewResolver,
  TransactionsResolver,
  SubscriptionsResolver,
];

/**
 * Build resolver maps from all resolver classes using the DI container.
 *
 * @param container - The DI container to resolve resolver instances from
 * @returns Array of resolver maps ready for Apollo Server
 */
export function buildResolverMaps(
  container: DependencyContainer,
): ResolverMap[] {
  return RESOLVER_CLASSES.map((resolverToken) => {
    const resolver = container.resolve(resolverToken);
    return resolver.getResolverMap();
  });
}

// Re-export resolver classes for direct access if needed
export {
  HealthResolver,
  AccountsResolver,
  AllocationsResolver,
  BudgetsResolver,
  CategoriesResolver,
  MonthlyOverviewResolver,
  SubscriptionsResolver,
  TransactionsResolver,
};
