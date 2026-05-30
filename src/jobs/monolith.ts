/**
 * Self-Hosted Monolith Entry Point
 *
 * Runs the budget-sync app as a single process suitable for self-hosting
 * (e.g. on a Jetson). Depending on env flags it can run any combination of:
 * - the HTTP server (webhook + GraphQL + /metrics)        RUN_SERVER (default on)
 * - the in-process BullMQ workers                          RUN_WORKER=true
 * - the in-process account-sync scheduler                  RUN_SCHEDULER=true
 *
 * Usage:
 *   bun run src/jobs/monolith.ts
 *
 * Environment:
 *   PORT                 - HTTP port (default: 8080)
 *   RUN_SERVER           - 'false' to disable the HTTP server (default: enabled)
 *   RUN_WORKER           - 'true' to start the BullMQ workers
 *   RUN_SCHEDULER        - 'true' to start the account-sync scheduler
 *   SCHEDULER_SYNC_CRON  - Cron expression for sync (default: '0 *​/3 * * *')
 *   WEBHOOK_URL          - Webhook URL to re-register during scheduled sync
 */

import 'reflect-metadata';
import { setupContainer } from '../container.ts';
import { LOGGER_TOKEN, type Logger } from '../modules/logging/Logger.ts';
import { StructuredLogger } from '../modules/logging/StructuredLogger.ts';
import { startServer } from '../presentation/http/startServer.ts';
import { InProcessScheduler } from '../presentation/scheduler/InProcessScheduler.ts';
import { BullMQWorkerRunner } from '../presentation/workers/BullMQWorkerRunner.ts';

const DEFAULT_PORT = 8080;
const DEFAULT_SYNC_CRON = '0 */3 * * *';

async function main() {
  const container = setupContainer();
  container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

  const logger = container.resolve<Logger>(LOGGER_TOKEN);

  const shutdownFns: Array<() => void | Promise<void>> = [];

  try {
    if (process.env['RUN_SERVER'] !== 'false') {
      const { stop } = await startServer({ container, port: getPort() });
      shutdownFns.push(stop);
      logger.info('HTTP server started', { port: getPort() });
    }

    if (process.env['RUN_WORKER'] === 'true') {
      const runner = container.resolve(BullMQWorkerRunner);
      runner.start();
      shutdownFns.push(() => runner.stop());
      logger.info('BullMQ worker started');
    }

    if (process.env['RUN_SCHEDULER'] === 'true') {
      const scheduler = container.resolve(InProcessScheduler);
      scheduler.start(
        process.env['SCHEDULER_SYNC_CRON'] ?? DEFAULT_SYNC_CRON,
        process.env['WEBHOOK_URL'],
      );
      shutdownFns.push(() => scheduler.stop());
      logger.info('Scheduler started');
    }

    setupGracefulShutdown(shutdownFns, logger);

    logger.info('Monolith ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start monolith', { error: message });
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
  shutdownFns: Array<() => void | Promise<void>>,
  logger: Logger,
): void {
  const shutdown = async () => {
    logger.info('Received shutdown signal');
    for (const fn of shutdownFns) {
      await fn();
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}

main();
