# Learnings

## Apollo Server + Bun HttpServer Integration

- Apollo Server v5 provides `executeHTTPGraphQLRequest` for framework-agnostic integration
- Must use `HeaderMap` from `@apollo/server` (not plain `Map<string, string>`) for request headers
- The project's `HttpServer` consumes the request body stream in `parseRequest()` before route handlers run. GraphQL handlers must use the pre-parsed `HttpRequest.body` instead of re-reading `request.raw` to avoid "Body already used" errors
- `WebhookServer.start()` was made async with a `beforeStart` hook to allow GraphQL registration before the HTTP server starts listening
- GraphQL schema files (.graphql) are loaded via `readFileSync` from `src/presentation/graphql/schema/`
- Resolvers are plain objects in `src/presentation/graphql/resolvers/`, combined into an array
