import "server-only";

import { Pool, type PoolClient } from "pg";
import { serverEnv } from "@/lib/env/server";

declare global {
  var __faigataPgPool: Pool | undefined;
}

function createPool() {
  return new Pool({ connectionString: serverEnv.databaseUrl() });
}

export function getPostgresPool() {
  if (!globalThis.__faigataPgPool) {
    globalThis.__faigataPgPool = createPool();
  }

  return globalThis.__faigataPgPool;
}

export async function withPgTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
