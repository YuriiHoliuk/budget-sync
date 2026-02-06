/**
 * Local Development Server
 *
 * Entry point for local development. Uses local DI container
 * with real database but mocked external services (Monobank, Spreadsheet).
 *
 * Endpoints:
 * - GET /webhook - Validation endpoint
 * - POST /webhook - Receives transaction notifications
 * - POST /graphql - GraphQL API endpoint
 * - WS /graphql - GraphQL subscriptions (WebSocket)
 * - GET /health - Health check
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

import { ConsoleLogger } from '@modules/logging/ConsoleLogger.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { setupLocalContainer } from './container.local.ts';
import { startServer } from './presentation/http/startServer.ts';

const DEFAULT_PORT = 4001;

async function main() {
  const container = setupLocalContainer();
  container.register(LOGGER_TOKEN, { useClass: ConsoleLogger });

  const logger = container.resolve<Logger>(LOGGER_TOKEN);
  const port = getPort();

  try {
    const { stop } = await startServer({ container, port });

    setupGracefulShutdown(stop, logger);

    logger.info(`Dev server running at http://localhost:${port}`);
    logger.info(`  GraphQL:      POST http://localhost:${port}/graphql`);
    logger.info(`  Subscriptions: WS  ws://localhost:${port}/graphql`);
    logger.info(`  Webhook:       GET/POST http://localhost:${port}/webhook`);
    logger.info(`  Health:        GET http://localhost:${port}/health`);
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
  stop: () => Promise<void>,
  logger: Logger,
): void {
  const shutdown = async () => {
    logger.info('Shutting down dev server...');
    await stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}

main();
