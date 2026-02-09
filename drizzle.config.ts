import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const PRODUCTION_DB_PATTERNS = [
  'neon.tech',
  'aws.neon.tech',
  'supabase.co',
  '.cloud.',
];

const databaseUrl = process.env.DATABASE_URL!;

if (process.env.NODE_ENV === 'test' && databaseUrl) {
  const lowerUrl = databaseUrl.toLowerCase();
  if (PRODUCTION_DB_PATTERNS.some((pattern) => lowerUrl.includes(pattern))) {
    throw new Error(
      'FATAL: Refusing to run migrations against production database in test mode! ' +
        'DATABASE_URL contains a production pattern. ' +
        'Use a local database for testing.',
    );
  }
}

export default defineConfig({
  schema: './src/modules/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
