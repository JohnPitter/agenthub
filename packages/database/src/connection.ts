import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { resolve } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";
import * as schema from "./schema/index";

const DB_DIR = resolve(homedir(), ".agenthub");
const DB_PATH = resolve(DB_DIR, "agenthub.db");

mkdirSync(DB_DIR, { recursive: true });

export const client = createClient({ url: `file:${DB_PATH}` });

// SQLite performance tuning PRAGMAs
client.execute("PRAGMA busy_timeout = 5000");       // Wait instead of fail on lock
client.execute("PRAGMA synchronous = NORMAL");       // 2x faster with WAL
client.execute("PRAGMA cache_size = -64000");        // 64MB page cache
client.execute("PRAGMA temp_store = MEMORY");        // Temp tables in RAM
client.execute("PRAGMA mmap_size = 268435456");      // 256MB memory-mapped I/O

export const db = drizzle(client, { schema });
