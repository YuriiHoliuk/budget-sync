/**
 * GraphQL Module
 *
 * Provides Apollo Server integration for Bun's native HTTP server.
 * Business-agnostic wrapper that bridges Apollo Server v5 with
 * the project's HttpServer module.
 *
 * Usage:
 *
 * ```typescript
 * import { GraphQLServer } from '@modules/graphql';
 *
 * const graphql = new GraphQLServer({
 *   typeDefs: `type Query { health: String }`,
 *   resolvers: { Query: { health: () => 'ok' } },
 * });
 *
 * await graphql.register(httpServer, () => ({ container }));
 * ```
 */

export { GraphQLServer } from './GraphQLServer.ts';
export type {
  GraphQLContext,
  GraphQLServerConfig,
} from './types.ts';
