import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(connectionString, {
  max: 50,
  idle_timeout: 30,
  connect_timeout: 10,
  max_lifetime: 1800,
});
export const db = drizzle(client, { schema });
export { schema };

export * from './schema';
export * from 'drizzle-orm';