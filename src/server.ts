/**
 * Local Development Server
 *
 * Entry point for the local dev web server.
 * Uses local DI container (real DB, mocked external services).
 * Hosts both webhook endpoints and GraphQL API with subscription support.
 *
 * Usage:
 *   bun run --watch src/server.ts
 *   just dev-server
 *
 * Environment:
 *   PORT - Port to listen on (default: 4001)
 *   DATABASE_URL - PostgreSQL connection string (default: local Docker)
 */

import 'dotenv/config';
import 'reflect-metadata';

import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLServer } from '@modules/graphql/index.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { PubSub } from 'graphql-subscriptions';
import { makeHandler } from 'graphql-ws/use/bun';
import { setupLocalContainer } from './container.local.ts';
import { buildResolverMaps } from './presentation/graphql/resolvers/index.ts';
import { typeDefs } from './presentation/graphql/schema/index.ts';
import { WebhookServer } from './presentation/http/WebhookServer.ts';

const DEFAULT_PORT = 4001;

async function main() {
  const container = setupLocalContainer();

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

    logger.info(`Dev server started on http://localhost:${port}`);
    logger.info('Health check: GET /health');
    logger.info('Webhook: GET/POST /webhook');
    logger.info(`GraphQL: POST http://localhost:${port}/graphql`);
    logger.info(`GraphQL Subscriptions: WS ws://localhost:${port}/graphql`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start dev server', { error: message });
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
    logger.info('Shutting down dev server...');
    await graphqlServer.stop();
    server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}

main();
