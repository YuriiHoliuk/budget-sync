/**
 * GraphQL Subscription Server
 *
 * Integrates graphql-ws with Bun's native WebSocket support.
 * Handles WebSocket connections for GraphQL subscriptions.
 */

import type { WebSocketHandler } from '@modules/http/types.ts';
import type { GraphQLSchema } from 'graphql';
import { handleProtocols, makeHandler } from 'graphql-ws/use/bun';
import type { GraphQLContext } from './types.ts';

export interface GraphQLSubscriptionServerConfig {
  /** The compiled GraphQL schema */
  schema: GraphQLSchema;
  /** Path for WebSocket connections (default: '/graphql') */
  path?: string;
}

export type SubscriptionContextFactory = () => Pick<
  GraphQLContext,
  'container' | 'pubsub'
>;

/**
 * Creates a WebSocket handler for GraphQL subscriptions using graphql-ws.
 */
export class GraphQLSubscriptionServer {
  private readonly schema: GraphQLSchema;
  private readonly path: string;
  private contextFactory: SubscriptionContextFactory | null = null;

  constructor(config: GraphQLSubscriptionServerConfig) {
    this.schema = config.schema;
    this.path = config.path ?? '/graphql';
  }

  /**
   * Get the WebSocket handler for Bun.serve configuration.
   * Must call setContextFactory() before using the handler.
   */
  getWebSocketHandler(): WebSocketHandler {
    return makeHandler({
      schema: this.schema,
      context: () => {
        if (!this.contextFactory) {
          throw new Error('Context factory not set');
        }
        return this.contextFactory();
      },
    });
  }

  /**
   * Set the context factory for subscription resolvers.
   */
  setContextFactory(factory: SubscriptionContextFactory): void {
    this.contextFactory = factory;
  }

  /**
   * Get the WebSocket path for routing.
   */
  getPath(): string {
    return this.path;
  }

  /**
   * Check if a request is a valid WebSocket upgrade request for GraphQL.
   * @param request - The incoming HTTP request
   * @returns true if this is a valid WebSocket upgrade for GraphQL subscriptions
   */
  shouldUpgrade(request: Request): boolean {
    const url = new URL(request.url);

    // Check path matches
    if (url.pathname !== this.path) {
      return false;
    }

    // Check it's a WebSocket upgrade request
    if (request.headers.get('upgrade') !== 'websocket') {
      return false;
    }

    // Check the subprotocol is graphql-ws
    const protocol = request.headers.get('sec-websocket-protocol') ?? '';
    return handleProtocols(protocol) !== false;
  }

  /**
   * Create a Response for invalid WebSocket upgrade attempts.
   */
  createInvalidUpgradeResponse(request: Request): Response {
    const upgrade = request.headers.get('upgrade');

    if (upgrade !== 'websocket') {
      return new Response('Upgrade Required', { status: 426 });
    }

    const protocol = request.headers.get('sec-websocket-protocol') ?? '';
    if (!handleProtocols(protocol)) {
      return new Response('Bad Request: Invalid WebSocket subprotocol', {
        status: 400,
      });
    }

    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Create a GraphQL subscription server instance.
 */
export function createSubscriptionServer(
  config: GraphQLSubscriptionServerConfig,
): GraphQLSubscriptionServer {
  return new GraphQLSubscriptionServer(config);
}
