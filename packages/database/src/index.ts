import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/agenthub'

const client = postgres(connectionString, {
  prepare: false,
  max: 20,
  idle_timeout: 30,
  max_lifetime: 60 * 30,
})

export const db = drizzle(client)

export { client as pgClient }

export * from './drizzle'