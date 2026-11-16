// A small stand-in for the parts of Supabase the database script relies on, so the real
// script in supabase/migrations can be run and tested in an embedded Postgres.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'
  );
  -- Same idea as Supabase: the signed-in user's id comes from the request's token.
  create function auth.uid() returns uuid language sql stable as $$
    select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export type Who = { role: 'anon' } | { role: 'authenticated'; id: string } | { role: 'service_role' };
export const ANON: Who = { role: 'anon' };
export const SERVICE: Who = { role: 'service_role' };

export type TestDb = {
  pg: PGlite;
  /** Runs one statement as the given caller and returns its rows. */
  run<T = Record<string, unknown>>(who: Who, sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs one statement as the database owner (test setup only). */
  owner<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Signs a person up the way Supabase Auth does, and returns them as a caller. */
  signUp(email: string, meta?: Record<string, unknown>): Promise<{ role: 'authenticated'; id: string }>;
};

export async function freshDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(STUB);
  await pg.exec(readFileSync('supabase/migrations/20261116000000_init.sql', 'utf8'));

  const owner: TestDb['owner'] = async (sql, params) => (await pg.query(sql, params)).rows as never;
  const run: TestDb['run'] = async (who, sql, params) => {
    const claims = who.role === 'authenticated' ? JSON.stringify({ sub: who.id, role: who.role }) : '';
    await pg.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
    await pg.exec(`set role ${who.role}`);
    try {
      return (await pg.query(sql, params)).rows as never;
    } finally {
      await pg.exec('reset role');
      await pg.query(`select set_config('request.jwt.claims', '', false)`);
    }
  };
  const signUp: TestDb['signUp'] = async (email, meta = {}) => {
    const [row] = await owner<{ id: string }>(
      'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
      [email, JSON.stringify(meta)],
    );
    return { role: 'authenticated', id: row.id };
  };
  return { pg, run, owner, signUp };
}

/** The short code a database function failed with ('ok' when it did not fail). */
export const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (e: { detail?: string; code?: string; message?: string }) => (e.code === 'P0001' ? e.detail : `${e.code}: ${e.message}`),
  );
