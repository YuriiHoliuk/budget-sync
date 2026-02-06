/**
 * API Integration Test Harness
 *
 * Provides infrastructure for testing GraphQL API with real database.
 * Sets up Apollo Server with test container and provides helpers for:
 * - Executing GraphQL queries and mutations
 * - Seeding and clearing test data
 * - Managing database transactions
 *
 * Usage:
 *   import { TestHarness } from './test-harness.ts';
 *
 *   const harness = new TestHarness();
 *   await harness.setup();
 *   const result = await harness.executeQuery(QUERY, { id: 1 });
 *   await harness.teardown();
 */

import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { DATABASE_CLIENT_TOKEN } from '@infrastructure/repositories/database/tokens.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import type { GraphQLContext } from '@modules/graphql/types.ts';
import { buildResolverMaps } from '@presentation/graphql/resolvers/index.ts';
import { typeDefs } from '@presentation/graphql/schema/index.ts';
import type { DocumentNode } from 'graphql';
import { print } from 'graphql';
import { PubSub } from 'graphql-subscriptions';
import { container, type DependencyContainer } from 'tsyringe';
import { setupTestContainer } from './test-container.ts';

export interface GraphQLResponse<TData = unknown> {
  data?: TData;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
    extensions?: Record<string, unknown>;
  }>;
}

export class TestHarness {
  private apollo: ApolloServer<GraphQLContext> | null = null;
  private testContainer: DependencyContainer | null = null;
  private databaseClient: DatabaseClient | null = null;
  private pubsub: PubSub | null = null;

  /**
   * Initialize the test harness.
   * Sets up DI container and Apollo Server.
   */
  async setup(): Promise<void> {
    // Reset container to avoid state from previous tests
    container.reset();

    // Set up test container with real DB, mocked external services
    this.testContainer = setupTestContainer();

    // Get database client for data management
    this.databaseClient = this.testContainer.resolve<DatabaseClient>(
      DATABASE_CLIENT_TOKEN,
    );

    // Create PubSub instance for tests
    this.pubsub = new PubSub();

    // Build resolvers from injectable classes
    const resolvers = buildResolverMaps(this.testContainer);

    // Create executable schema
    const schema = makeExecutableSchema({
      typeDefs,
      resolvers,
    });

    // Create Apollo Server instance (no HTTP, just in-memory execution)
    this.apollo = new ApolloServer<GraphQLContext>({
      schema,
      introspection: true,
    });

    await this.apollo.start();
  }

  /**
   * Tear down the test harness.
   * Stops Apollo Server and cleans up resources.
   */
  async teardown(): Promise<void> {
    if (this.apollo) {
      await this.apollo.stop();
      this.apollo = null;
    }

    // Reset container to clean up singletons
    container.reset();
    this.testContainer = null;
    this.databaseClient = null;
  }

  /**
   * Execute a GraphQL query or mutation.
   *
   * @param query - GraphQL document (query or mutation)
   * @param variables - Optional variables for the query
   * @returns GraphQL response with data or errors
   */
  async executeQuery<
    TData = unknown,
    TVariables extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: DocumentNode | string,
    variables?: TVariables,
  ): Promise<GraphQLResponse<TData>> {
    if (!this.apollo || !this.testContainer || !this.pubsub) {
      throw new Error(
        'Test harness not initialized. Call setup() before executing queries.',
      );
    }

    const queryString = typeof query === 'string' ? query : print(query);

    const response = await this.apollo.executeOperation<TData>(
      {
        query: queryString,
        variables,
      },
      {
        contextValue: { container: this.testContainer, pubsub: this.pubsub },
      },
    );

    // Apollo Server returns a different format depending on response type
    if (response.body.kind === 'single') {
      return {
        data: response.body.singleResult.data ?? undefined,
        errors: response.body.singleResult.errors as GraphQLResponse['errors'],
      };
    }

    // Incremental delivery not supported in tests
    throw new Error('Unexpected response format: incremental delivery');
  }

  /**
   * Get the Drizzle database instance for direct queries.
   * Returns the same db instance used by repositories.
   */
  getDb() {
    if (!this.databaseClient) {
      throw new Error('Database client not initialized.');
    }
    return this.databaseClient.db;
  }

  /**
   * Get the test container for direct dependency resolution.
   */
  getContainer(): DependencyContainer {
    if (!this.testContainer) {
      throw new Error('Test harness not initialized.');
    }
    return this.testContainer;
  }

  /**
   * Get the database client for advanced operations.
   */
  getDatabaseClient(): DatabaseClient {
    if (!this.databaseClient) {
      throw new Error('Database client not initialized.');
    }
    return this.databaseClient;
  }
}

/**
 * Singleton harness for use across test files.
 * Prefer creating new instances per test suite for isolation.
 */
let sharedHarness: TestHarness | null = null;

export function getSharedHarness(): TestHarness {
  if (!sharedHarness) {
    sharedHarness = new TestHarness();
  }
  return sharedHarness;
}

export async function resetSharedHarness(): Promise<void> {
  if (sharedHarness) {
    await sharedHarness.teardown();
    sharedHarness = null;
  }
}
