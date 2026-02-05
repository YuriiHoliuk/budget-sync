/**
 * Health Check Resolver
 *
 * Provides a basic health check query for the GraphQL API.
 */

import { injectable } from 'tsyringe';
import { Resolver, type ResolverMap } from '../Resolver.ts';

@injectable()
export class HealthResolver extends Resolver {
  getResolverMap(): ResolverMap {
    return {
      Query: {
        health: () => this.healthCheck(),
      },
    };
  }

  private healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
