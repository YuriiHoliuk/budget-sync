import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.ts';
import type { DatabaseConfig } from './types.ts';

export class DatabaseClient {
  private readonly client: postgres.Sql;
  readonly db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(config: DatabaseConfig) {
    this.client = postgres(config.url, {
      max: config.maxConnections ?? 10,
      idle_timeout: config.idleTimeout ?? 20,
      connect_timeout: config.connectTimeout ?? 10,
    });
    this.db = drizzle(this.client, { schema });
  }

  async disconnect(): Promise<void> {
    await this.client.end();
  }
}
