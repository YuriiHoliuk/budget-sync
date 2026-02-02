/**
 * Cloud Run Service: Webhook Server
 *
 * HTTP server for receiving Monobank webhook notifications.
 * This is a direct entry point for Cloud Run Services.
 *
 * Endpoints:
 * - GET /webhook - Validation endpoint (Monobank sends this to verify the URL)
 * - POST /webhook - Receives transaction notifications
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
import { setupContainer } from '../container.ts';
import { LOGGER_TOKEN, type Logger } from '../modules/logging/Logger.ts';
import { StructuredLogger } from '../modules/logging/StructuredLogger.ts';
import { WebhookServer } from '../presentation/http/WebhookServer.ts';

const DEFAULT_PORT = 8080;

async function main() {
  const container = setupContainer();
  container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

  const logger = container.resolve<Logger>(LOGGER_TOKEN);
  const webhookServer = container.resolve(WebhookServer);

  const port = getPort();

  try {
    await webhookServer.start(port, container);

    setupGracefulShutdown(webhookServer, logger);

    logger.info('Webhook server ready', { port });
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

function setupGracefulShutdown(server: WebhookServer, logger: Logger): void {
  const shutdown = () => {
    logger.info('Received shutdown signal, stopping server...');
    server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
