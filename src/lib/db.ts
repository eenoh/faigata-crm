// src/lib/db.ts
import { Pool } from "pg";

declare global {
  // Allow global reuse in dev so we don't create too many connections
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

const pool =
  global.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  global.pgPool = pool;
}

export { pool };
