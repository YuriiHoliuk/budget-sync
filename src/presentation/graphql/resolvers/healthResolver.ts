/**
 * Health Check Resolver
 *
 * Provides a basic health check query for the GraphQL API.
 */

import type { GraphQLContext } from '@modules/graphql/types.ts';

export const healthResolver = {
  Query: {
    health: (_parent: unknown, _args: unknown, _context: GraphQLContext) => ({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    }),
  },
};
