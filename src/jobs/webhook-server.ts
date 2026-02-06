/**
 * Cloud Run Service: Webhook Server (Production)
 *
 * Entry point for the production HTTP server on Cloud Run.
 * Uses production DI container with real external services.
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
 */

import 'reflect-metadata';
import { setupContainer } from '../container.ts';
import { LOGGER_TOKEN, type Logger } from '../modules/logging/Logger.ts';
import { StructuredLogger } from '../modules/logging/StructuredLogger.ts';
import { startServer } from '../presentation/http/startServer.ts';

const DEFAULT_PORT = 8080;

async function main() {
  const container = setupContainer();
  container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

  const logger = container.resolve<Logger>(LOGGER_TOKEN);
  const port = getPort();

  try {
    const { stop } = await startServer({ container, port });

    setupGracefulShutdown(stop, logger);

    logger.info('Production server ready', { port });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start server', { error: message });
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
    logger.info('Received shutdown signal');
    await stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}

main();
