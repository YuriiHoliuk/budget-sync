/**
 * HTTP module types
 * Business-agnostic types for a lightweight HTTP server
 */

/** HTTP methods supported by the server */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Parsed HTTP request with typed body */
export interface HttpRequest<TBody = unknown> {
  /** HTTP method */
  method: HttpMethod;
  /** Request path (without query string) */
  path: string;
  /** Query parameters */
  query: URLSearchParams;
  /** Request headers */
  headers: Headers;
  /** Parsed JSON body (null if no body or not JSON) */
  body: TBody | null;
  /** Raw request object for advanced use cases */
  raw: Request;
}

/** HTTP response to be sent to the client */
export interface HttpResponse {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response body (will be JSON-serialized if object) */
  body?: unknown;
}

/** Route handler function */
export type RouteHandler<TBody = unknown> = (
  request: HttpRequest<TBody>,
) => Promise<HttpResponse> | HttpResponse;

/** Route definition */
export interface Route {
  /** HTTP method to match */
  method: HttpMethod;
  /** Path pattern to match (exact match, no wildcards) */
  path: string;
  /** Handler function */
  handler: RouteHandler;
}

/**
 * Re-export Bun's WebSocket types for better module isolation.
 * Consumers of this module don't need to import from 'bun' directly.
 */
export type WebSocketHandler<DataType = unknown> =
  import('bun').WebSocketHandler<DataType>;

export type ServerWebSocket<DataType = unknown> =
  import('bun').ServerWebSocket<DataType>;

/** Server configuration */
export interface HttpServerConfig {
  /** Port to listen on */
  port: number;
  /** Host to bind to (default: '0.0.0.0') */
  host?: string;
  /** WebSocket handler configuration (optional) */
  websocket?: WebSocketHandler;
  /** Path for WebSocket upgrades (default: '/graphql') */
  websocketPath?: string;
}
