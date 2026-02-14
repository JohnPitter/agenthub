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
export const db = drizzle(client, { schema });
