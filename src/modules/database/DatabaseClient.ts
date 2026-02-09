import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.ts';
import type { DatabaseConfig } from './types.ts';

const PRODUCTION_DB_PATTERNS = [
  'neon.tech',
  'aws.neon.tech',
  'supabase.co',
  '.cloud.',
];

export class DatabaseClient {
  private readonly client: postgres.Sql;
  readonly db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(config: DatabaseConfig) {
    if (process.env['NODE_ENV'] === 'test') {
      const lowerUrl = config.url.toLowerCase();
      if (
        PRODUCTION_DB_PATTERNS.some((pattern) => lowerUrl.includes(pattern))
      ) {
        throw new Error(
          'FATAL: Refusing to connect to production database in test mode! ' +
            'DATABASE_URL contains a production pattern. ' +
            'Use a local database for testing.',
        );
      }
    }

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
