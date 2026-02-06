/**
 * Cloud Run Service: Webhook Server
 *
 * HTTP server for receiving Monobank webhook notifications and GraphQL API.
 * This is a direct entry point for Cloud Run Services.
 *
 * Endpoints:
 * - GET /webhook - Validation endpoint (Monobank sends this to verify the URL)
 * - POST /webhook - Receives transaction notifications
 * - POST /graphql - GraphQL API endpoint
 * - WS /graphql - GraphQL subscriptions (WebSocket)
 * - GET /health - Health check for Cloud Run
 *
 * Usage:
 *   bun run src/jobs/webhook-server.ts
 *
 * Environment:
 *   PORT - Port to listen on (default: 8080, Cloud Run provides this)
 *   DEBUG=* or DEBUG=webhook,http - Enable debug logging
 */

import 'reflect-metadata';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { PubSub } from 'graphql-subscriptions';
import { makeHandler } from 'graphql-ws/use/bun';
import { setupContainer } from '../container.ts';
import { GraphQLServer } from '../modules/graphql/index.ts';
import { LOGGER_TOKEN, type Logger } from '../modules/logging/Logger.ts';
import { StructuredLogger } from '../modules/logging/StructuredLogger.ts';
import { buildResolverMaps } from '../presentation/graphql/resolvers/index.ts';
import { typeDefs } from '../presentation/graphql/schema/index.ts';
import { WebhookServer } from '../presentation/http/WebhookServer.ts';

const DEFAULT_PORT = 8080;

async function main() {
  const container = setupContainer();
  container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

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

  const port = getPort();

  try {
    await webhookServer.start({
      port,
      container,
      websocket: websocketHandler,
      beforeStart: async (httpServer) => {
        await graphqlServer.register(httpServer, () => ({ container, pubsub }));
        logger.info('GraphQL endpoint registered at /graphql');
      },
    });

    setupGracefulShutdown(webhookServer, graphqlServer, logger);

    logger.info('Webhook server ready', { port, graphql: '/graphql' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start webhook server', { error: message });
    process.exit(1);
  }
}

function getPort(): number {
  const portEnv = process.env['PORT'];
  if (portEnv) {
    const parsedPort = Number.parseInt(portEnv, 10);
    if (!Number.isNaN(parsedPort) && parsedPort > 0) {
      return parsedPort;
    }
  }
  return DEFAULT_PORT;
}

function setupGracefulShutdown(
  server: WebhookServer,
  graphqlServer: GraphQLServer,
  logger: Logger,
): void {
  const shutdown = async () => {
    logger.info('Received shutdown signal, stopping server...');
    await graphqlServer.stop();
    server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}

main();
