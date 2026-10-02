import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export async function testDatabase() {
  const engine = new PGlite();
  // Minimal managed Auth schema for SQL/SDK contract tests; this is not Supabase Auth.
  await engine.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,encrypted_password text,
      raw_app_meta_data jsonb DEFAULT '{}',raw_user_meta_data jsonb DEFAULT '{}',
      banned_until timestamptz,created_at timestamptz DEFAULT now(),deleted_at timestamptz,email_confirmed_at timestamptz);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users ON DELETE CASCADE);`);
  await engine.exec(await readFile(new URL('../supabase/migrations/20261002000000_init.sql', import.meta.url), 'utf8'));
  await engine.exec(await readFile(new URL('../supabase/migrations/20261002010000_admin_only_registration.sql', import.meta.url), 'utf8'));
  await engine.exec(await readFile(new URL('../supabase/migrations/20261002020000_admin_directory.sql', import.meta.url), 'utf8'));
  return { query: (sql, params) => engine.query(sql, params), exec: sql => engine.exec(sql), end: () => engine.close() };
}
