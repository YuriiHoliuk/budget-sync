/**
 * GraphQLServer - Apollo Server integration for Bun's HTTP server
 *
 * Wraps Apollo Server v5 and provides a request handler compatible
 * with the project's HttpServer module. Uses Apollo's
 * executeHTTPGraphQLRequest API for framework-agnostic integration.
 */

import { ApolloServer, HeaderMap } from '@apollo/server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { HttpRequest, HttpServer } from '@modules/http/index.ts';
import type { GraphQLContext, GraphQLServerConfig } from './types.ts';

export class GraphQLServer {
  private apollo: ApolloServer<GraphQLContext>;
  private readonly path: string;
  private contextFactory: (() => GraphQLContext) | null = null;

  constructor(config: GraphQLServerConfig) {
    this.path = config.path ?? '/graphql';

    const schema = makeExecutableSchema({
      typeDefs: config.typeDefs,
      resolvers: config.resolvers,
    });

    this.apollo = new ApolloServer<GraphQLContext>({
      schema,
      introspection: config.introspection ?? true,
    });
  }

  /**
   * Start the Apollo Server and register the GraphQL route on the HttpServer.
   *
   * Must be called before the HttpServer starts listening.
   */
  async register(
    httpServer: HttpServer,
    contextFactory: () => GraphQLContext,
  ): Promise<void> {
    this.contextFactory = contextFactory;

    await this.apollo.start();

    httpServer.post(this.path, (request) => {
      return this.handleRequest(request);
    });

    httpServer.get(this.path, (request) => {
      return this.handleRequest(request);
    });
  }

  /**
   * Stop the Apollo Server gracefully.
   */
  async stop(): Promise<void> {
    await this.apollo.stop();
  }

  /**
   * Handle an incoming HTTP request by delegating to Apollo Server.
   *
   * Uses the pre-parsed HttpRequest (body already consumed by HttpServer)
   * to avoid double-consuming the request body stream.
   */
  private async handleRequest(request: HttpRequest): Promise<{
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
  }> {
    const httpGraphQLRequest = this.buildGraphQLRequest(request);
    const context =
      this.contextFactory?.() ??
      ({ container: null } as unknown as GraphQLContext);

    const result = await this.apollo.executeHTTPGraphQLRequest({
      httpGraphQLRequest,
      context: () => Promise.resolve(context),
    });

    return this.buildHttpResponse(result);
  }

  /**
   * Convert a pre-parsed HttpRequest into Apollo's HTTPGraphQLRequest format.
   */
  private buildGraphQLRequest(request: HttpRequest) {
    const headers = new HeaderMap();
    request.headers.forEach((value, key) => {
      headers.set(key, value);
    });

    const search = request.query.toString();

    return {
      method: request.method,
      headers,
      search: search ? `?${search}` : '',
      body: request.body ?? {},
    };
  }

  /**
   * Convert Apollo's HTTPGraphQLResponse into our HttpResponse format.
   */
  private buildHttpResponse(result: {
    status?: number;
    headers: Map<string, string>;
    body:
      | { kind: 'complete'; string: string }
      | { kind: 'chunked'; asyncIterator: AsyncIterableIterator<string> };
  }): { status: number; headers?: Record<string, string>; body?: unknown } {
    const responseHeaders: Record<string, string> = {};
    result.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    if (result.body.kind === 'complete') {
      const parsedBody: unknown = JSON.parse(result.body.string);
      return {
        status: result.status ?? 200,
        headers: responseHeaders,
        body: parsedBody,
      };
    }

    return {
      status: result.status ?? 200,
      headers: responseHeaders,
      body: { error: 'Streaming responses not supported' },
    };
  }
}
