import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

// AlloyDB (Postgres) connection. All app tables live in the isolated
// `sales_kyc` schema on a shared cluster — never the crowded `public` schema.
// Pool is cached across hot-reloads to avoid exhausting connections in dev.
const globalForDb = globalThis as unknown as { __kycPool?: Pool };

function getPool(): Pool {
  if (!globalForDb.__kycPool) {
    globalForDb.__kycPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
  }
  return globalForDb.__kycPool;
}

export const db = drizzle(getPool(), { schema });
