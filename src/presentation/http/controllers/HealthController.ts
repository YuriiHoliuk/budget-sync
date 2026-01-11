/**
 * HealthController - Health check endpoints for Cloud Run
 *
 * Endpoints:
 * - GET /health - Basic health check (is the service running?)
 * - GET /ready - Readiness check (is the service ready to receive traffic?)
 */

import { type HttpResponse, ok } from '@modules/http/index.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { inject, injectable } from 'tsyringe';
import { Controller, type RouteDefinition } from '../Controller.ts';

/**
 * Controller for health check endpoints.
 *
 * Used by Cloud Run for:
 * - Startup probes (initial container readiness)
 * - Liveness probes (ongoing health checks)
 * - Readiness probes (traffic routing decisions)
 */
@injectable()
export class HealthController extends Controller {
  routes: RouteDefinition[] = [
    { method: 'get', path: '/health', handler: 'healthCheck' },
    { method: 'get', path: '/ready', handler: 'readinessCheck' },
  ];

  constructor(@inject(LOGGER_TOKEN) protected logger: Logger) {
    super();
  }

  /**
   * GET /health - Basic health check.
   * Returns 200 if the service is running.
   */
  healthCheck(): HttpResponse {
    return ok({ status: 'healthy', timestamp: new Date().toISOString() });
  }

  /**
   * GET /ready - Readiness check.
   * Returns 200 if the service is ready to receive traffic.
   */
  readinessCheck(): HttpResponse {
    return ok({ status: 'ready' });
  }
}
