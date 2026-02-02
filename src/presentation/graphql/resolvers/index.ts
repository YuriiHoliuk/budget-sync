/**
 * GraphQL Resolver Registry
 *
 * Combines all resolver maps into a single array for schema construction.
 * New resolvers should be imported and added to the resolvers array.
 */

import { accountsResolver } from './accountsResolver.ts';
import { allocationsResolver } from './allocationsResolver.ts';
import { budgetsResolver } from './budgetsResolver.ts';
import { categoriesResolver } from './categoriesResolver.ts';
import { healthResolver } from './healthResolver.ts';
import { monthlyOverviewResolver } from './monthlyOverviewResolver.ts';
import { transactionsResolver } from './transactionsResolver.ts';

export const resolvers = [
  healthResolver,
  accountsResolver,
  allocationsResolver,
  budgetsResolver,
  categoriesResolver,
  monthlyOverviewResolver,
  transactionsResolver,
];
