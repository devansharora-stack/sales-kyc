import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

// AlloyDB (Postgres) connection. All app tables live in the isolated
// `sales_kyc` schema on a shared cluster — never the crowded `public` schema.
// Pool is cached across hot-reloads to avoid exhausting connections in dev.
const globalForDb = globalThis as unknown as { __kycPool?: Pool };

function getPool(): Pool {
  if (!globalForDb.__kycPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      // Fail fast instead of hanging when a connection can't be established
      // (e.g. transient network drops) rather than blocking for minutes.
      connectionTimeoutMillis: 10_000,
    });
    // An idle client erroring (dropped connection) emits 'error' on the pool.
    // Without a handler this throws as an uncaughtException and can crash the
    // process — log and swallow so a blip never takes the server down.
    pool.on("error", (err) => {
      console.log(`[db] idle pool client error: ${err instanceof Error ? err.message : err}`);
    });
    globalForDb.__kycPool = pool;
  }
  return globalForDb.__kycPool;
}

export const db = drizzle(getPool(), { schema });
