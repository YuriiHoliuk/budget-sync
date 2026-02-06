/**
 * Shared server startup logic for both local dev and production.
 *
 * This module contains the common server setup including:
 * - GraphQL API endpoint
 * - WebSocket subscriptions
 * - Webhook endpoints (via controllers)
 * - Health check
 *
 * The only difference between environments is the DI container
 * (local uses mocks, production uses real services).
 */

import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLServer } from '@modules/graphql/index.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { PubSub } from 'graphql-subscriptions';
import { makeHandler } from 'graphql-ws/use/bun';
import type { DependencyContainer } from 'tsyringe';
import { buildResolverMaps } from '../graphql/resolvers/index.ts';
import { typeDefs } from '../graphql/schema/index.ts';
import { WebhookServer } from './WebhookServer.ts';

export interface StartServerOptions {
  container: DependencyContainer;
  port: number;
}

export interface StartServerResult {
  webhookServer: WebhookServer;
  graphqlServer: GraphQLServer;
  stop: () => Promise<void>;
}

/**
 * Start the HTTP server with GraphQL API and webhook endpoints.
 *
 * This is the single source of truth for server setup. Both local dev
 * and production use this function with different DI containers.
 */
export async function startServer(
  options: StartServerOptions,
): Promise<StartServerResult> {
  const { container, port } = options;

  const logger = container.resolve<Logger>(LOGGER_TOKEN);
  const webhookServer = container.resolve(WebhookServer);

  // Create PubSub instance for GraphQL subscriptions
  const pubsub = new PubSub();

  // Build resolvers from injectable classes
  const resolvers = buildResolverMaps(container);

  // Create executable schema for both HTTP and WebSocket
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  const graphqlServer = new GraphQLServer({
    typeDefs,
    resolvers,
    introspection: true,
  });

  // Create WebSocket handler for GraphQL subscriptions
  const websocketHandler = makeHandler({
    schema,
    context: () => ({ container, pubsub }),
  });

  await webhookServer.start({
    port,
    container,
    websocket: websocketHandler,
    beforeStart: async (httpServer) => {
      await graphqlServer.register(httpServer, () => ({ container, pubsub }));
      logger.info('GraphQL endpoint registered at /graphql');
    },
  });

  logger.info(`Server started on port ${port}`);
  logger.info(
    'Endpoints: GET /health, GET/POST /webhook, POST /graphql, WS /graphql',
  );

  const stop = async () => {
    logger.info('Stopping server...');
    await graphqlServer.stop();
    webhookServer.stop();
  };

  return { webhookServer, graphqlServer, stop };
}
