import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  split,
} from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";

/**
 * Creates an Apollo Client instance with support for:
 * - HTTP queries and mutations via /api/graphql
 * - WebSocket subscriptions via ws://localhost:3000/api/graphql (proxied to backend)
 *
 * Note: Subscriptions currently only work in development.
 * Production would require a proper WebSocket proxy setup.
 */
function createApolloClient() {
  // HTTP link for queries and mutations
  const httpLink = new HttpLink({
    uri: "/api/graphql",
  });

  // Determine WebSocket URL based on window location
  const wsProtocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsHost = typeof window !== "undefined" ? window.location.host : "localhost:3000";
  const wsUrl = `${wsProtocol}//${wsHost}/api/graphql`;

  // WebSocket link for subscriptions
  // Only create in browser environment
  const wsLink =
    typeof window !== "undefined"
      ? new GraphQLWsLink(
          createClient({
            url: wsUrl,
            // Reconnection settings
            retryAttempts: 5,
            shouldRetry: () => true,
            connectionParams: () => {
              // Add any auth tokens here if needed
              return {};
            },
          })
        )
      : null;

  // Split link: use WebSocket for subscriptions, HTTP for everything else
  const splitLink = wsLink
    ? split(
        ({ query }) => {
          const definition = getMainDefinition(query);
          return (
            definition.kind === "OperationDefinition" &&
            definition.operation === "subscription"
          );
        },
        wsLink,
        httpLink
      )
    : httpLink;

  return new ApolloClient({
    cache: new InMemoryCache(),
    link: splitLink,
  });
}

export { createApolloClient };
