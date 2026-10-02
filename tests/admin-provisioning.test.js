import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testDatabase } from './database.js';

test('database blocks direct public signup even with forged user metadata', async () => {
  const db = await testDatabase();
  try {
    for (const metadata of [{}, { gkl_role: 'admin', app_metadata: { gkl_role: 'admin' } }]) {
      await assert.rejects(db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',
        [crypto.randomUUID(), 'blocked@example.test', metadata]), /gkl_admin_only_registration/);
    }
    for (const role of ['user', 'admin']) {
      await db.query('INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES($1,$2,$3)',
        [crypto.randomUUID(), `${role}@example.test`, { gkl_role: role }]);
    }
    assert.equal((await db.query('SELECT id FROM auth.users')).rows.length, 2);
    await db.exec(await readFile(new URL('../supabase/migrations/20261002010000_admin_only_registration.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query('SELECT id FROM auth.users')).rows.length, 2);
  } finally { await db.end(); }
});

test('owner repair promotes only the existing verified account and preserves family data', async () => {
  const db = await testDatabase();
  try {
    const id = crypto.randomUUID(), session = crypto.randomUUID(), other = crypto.randomUUID();
    await db.query(`INSERT INTO auth.users(id,email,encrypted_password,raw_app_meta_data,email_confirmed_at)
      VALUES($1,'wahib.chelsea@gmail.com','unchanged-password','{"gkl_role":"user","provider":"email"}',now()),
      ($2,'other@example.test','other-password','{"gkl_role":"user"}',now())`, [id, other]);
    await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [session, id]);
    await db.query('SELECT public.gkl_allow_session($1,$2)', [session, id]);
    const family = { version: 1, profiles: [{ id: 'child', name: 'Anak', age: 8, entries: {} }] };
    await db.query('SELECT public.gkl_write_family($1,$2,0,$3)', [id, session, family]);
    const before = (await db.query('SELECT * FROM public.gkl_family_data')).rows;
    const sql = await readFile(new URL('../supabase/admin/restore-wahib-admin.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    const owner = (await db.query('SELECT * FROM auth.users WHERE id=$1', [id])).rows[0];
    assert.deepEqual(owner.raw_app_meta_data, { gkl_role: 'admin', provider: 'email' });
    assert.equal(owner.encrypted_password, 'unchanged-password');
    assert.deepEqual((await db.query('SELECT * FROM public.gkl_family_data')).rows, before);
    assert.equal((await db.query('SELECT * FROM public.gkl_session_access')).rows.length, 0);
    assert.equal((await db.query('SELECT raw_app_meta_data FROM auth.users WHERE id=$1', [other])).rows[0].raw_app_meta_data.gkl_role, 'user');
    await db.query('SELECT public.gkl_allow_session($1,$2)', [session, id]);
    await db.exec(sql);
    assert.equal((await db.query('SELECT * FROM public.gkl_session_access')).rows.length, 1);
  } finally { await db.end(); }
});
