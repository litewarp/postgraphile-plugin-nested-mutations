import { makeSchema } from 'postgraphile';
import { PostGraphileAmberPreset } from 'postgraphile/presets/amber';
import { PgManyToManyPreset } from '@graphile-contrib/pg-many-to-many';
import { makePgService } from 'postgraphile/adaptors/pg';
import type { PoolClient } from 'pg';
import { Pool } from 'pg';

export async function withPgClient<
  TResult = Record<string, unknown> | unknown[],
>(opts: { cb: (pgClient: PoolClient) => Promise<TResult>; url?: string }) {
  const { cb, url = process.env.TEST_DATABASE_URL } = opts;

  const pgPool = new Pool({ connectionString: url });
  let client: PoolClient | null = null;

  try {
    client = await pgPool.connect();
    await client.query('begin');
    await client.query("set local timezone to '+04:00'");
    const result = await cb(client);
    await client.query('rollback');
    return result;
  } finally {
    if (client) {
      client.release();
    }
    await pgPool.end();
  }
}
