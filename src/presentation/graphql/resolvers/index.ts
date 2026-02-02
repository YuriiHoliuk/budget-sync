/**
 * GraphQL Resolver Registry
 *
 * Combines all resolver maps into a single array for schema construction.
 * New resolvers should be imported and added to the resolvers array.
 */

import { accountsResolver } from './accountsResolver.ts';
import { healthResolver } from './healthResolver.ts';

export const resolvers = [healthResolver, accountsResolver];
