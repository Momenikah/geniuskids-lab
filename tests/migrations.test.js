import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testDatabase } from './database.js';

test('merged migration can be reapplied without changing accounts, sessions or family data', async () => {
  const db = await testDatabase();
  try {
    const userId = crypto.randomUUID(), sessionId = crypto.randomUUID();
    await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [userId, 'migration@example.test']);
    await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [sessionId, userId]);
    await db.query('SELECT public.gkl_allow_session($1,$2)', [sessionId, userId]);
    await db.query('SELECT public.gkl_rate_limit($1,$2)', ['migration-test', 10]);
    const family = { version: 1, profiles: [{ id: 'child', name: 'Nara', age: 8, entries: {} }] };
    await db.query('SELECT public.gkl_write_family($1,$2,$3,$4)', [userId, sessionId, 0, JSON.stringify(family)]);
    const tables = ['auth.users', 'auth.sessions', 'public.gkl_session_access', 'public.gkl_rate_limits', 'public.gkl_admin_guard', 'public.gkl_family_data'];
    const before = await Promise.all(tables.map(table => db.query(`SELECT * FROM ${table}`)));

    await db.exec(await readFile(new URL('../supabase/migrations/20261002000000_init.sql', import.meta.url), 'utf8'));

    for (const [index, table] of tables.entries()) {
      assert.deepEqual((await db.query(`SELECT * FROM ${table}`)).rows, before[index].rows, table);
    }
    const result = await db.query('SELECT public.gkl_read_family($1,$2) AS family', [userId, sessionId]);
    assert.deepEqual(result.rows[0].family.data, family);
    assert.equal(result.rows[0].family.revision, 1);
    const rls = await db.query("SELECT relname,relrowsecurity FROM pg_class WHERE oid IN ('public.gkl_session_access'::regclass,'public.gkl_rate_limits'::regclass,'public.gkl_admin_guard'::regclass,'public.gkl_family_data'::regclass)");
    assert.equal(rls.rows.length, 4);
    assert.ok(rls.rows.every(row => row.relrowsecurity));
  } finally {
    await db.end();
  }
});
