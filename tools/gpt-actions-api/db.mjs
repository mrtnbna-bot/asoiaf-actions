import { Pool } from "pg";

import { SCHEMA_STATEMENTS } from "./schema.mjs";

export function createPool({ connectionString } = {}) {
  const resolvedConnectionString = connectionString ?? process.env.DATABASE_URL;
  if (!resolvedConnectionString) {
    throw new Error("DATABASE_URL is required for the Postgres-backed GPT Actions API.");
  }

  return new Pool({
    connectionString: resolvedConnectionString,
  });
}

export async function ensureSchema(pool) {
  for (const statement of SCHEMA_STATEMENTS) {
    await pool.query(statement);
  }
}
