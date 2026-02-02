/**
 * Local Development Server
 *
 * Entry point for the local dev web server.
 * Uses local DI container (real DB, mocked external services).
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

import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { setupLocalContainer } from './container.local.ts';
import { WebhookServer } from './presentation/http/WebhookServer.ts';

const DEFAULT_PORT = 4001;

function main() {
  const container = setupLocalContainer();

  const logger = container.resolve<Logger>(LOGGER_TOKEN);
  const webhookServer = container.resolve(WebhookServer);

  const port = getPort();

  try {
    webhookServer.start(port, container);

    setupGracefulShutdown(webhookServer, logger);

    logger.info(`Dev server started on http://localhost:${port}`);
    logger.info('Health check: GET /health');
    logger.info('Webhook: GET/POST /webhook');
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

function setupGracefulShutdown(server: WebhookServer, logger: Logger): void {
  const shutdown = () => {
    logger.info('Shutting down dev server...');
    server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
