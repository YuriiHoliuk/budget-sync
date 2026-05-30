/**
 * MetricsController - Prometheus metrics endpoint.
 *
 * Endpoints:
 * - GET /metrics - Prometheus exposition of application metrics
 */

import type { HttpResponse } from '@modules/http/index.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { METRICS_TOKEN, type Metrics } from '@modules/metrics/index.ts';
import { inject, injectable } from 'tsyringe';
import { Controller, type RouteDefinition } from '../Controller.ts';

@injectable()
export class MetricsController extends Controller {
  routes: RouteDefinition[] = [
    { method: 'get', path: '/metrics', handler: 'handleMetrics' },
  ];

  constructor(
    @inject(METRICS_TOKEN) private metrics: Metrics,
    @inject(LOGGER_TOKEN) protected logger: Logger,
  ) {
    super();
  }

  /**
   * GET /metrics - Prometheus metrics in text exposition format.
   */
  async handleMetrics(): Promise<HttpResponse> {
    const body = await this.metrics.render();
    return {
      status: 200,
      headers: { 'content-type': this.metrics.contentType() },
      body,
    };
  }
}
