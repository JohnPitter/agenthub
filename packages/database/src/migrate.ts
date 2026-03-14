import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL || "";

if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

async function runMigration() {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  // Resolve drizzle folder relative to this file
  // In dev: src/migrate.ts -> ../drizzle
  // In prod: dist/migrate.js -> ../drizzle
  const migrationsFolder = path.resolve(__dirname, "../drizzle");

  console.log(`Running migrations from ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  console.log("Migration completed successfully.");

  await client.end();
  process.exit(0);
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
