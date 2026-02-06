/**
 * GraphQL module types
 *
 * Business-agnostic types for the GraphQL server integration.
 */

import type { IExecutableSchemaDefinition } from '@graphql-tools/schema';
import type { PubSub } from 'graphql-subscriptions';

/** Context object passed to all GraphQL resolvers */
export interface GraphQLContext {
  /** DI container for resolving dependencies */
  container: import('tsyringe').DependencyContainer;
  /** PubSub instance for GraphQL subscriptions */
  pubsub: PubSub;
}

/** Resolver map type from graphql-tools, bound to our context */
type ResolverMap = NonNullable<
  IExecutableSchemaDefinition<GraphQLContext>['resolvers']
>;

/** Configuration for the GraphQL server */
export interface GraphQLServerConfig {
  /** GraphQL type definitions (SDL strings) */
  typeDefs: string | string[];
  /** GraphQL resolvers */
  resolvers: ResolverMap;
  /** Path to serve GraphQL on (default: '/graphql') */
  path?: string;
  /** Enable introspection (default: true in dev) */
  introspection?: boolean;
}
