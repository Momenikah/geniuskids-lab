import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testDatabase } from './database.js';

test('admin directory filters before pagination, sorts deterministically and clamps empty pages', async () => {
  const db = await testDatabase();
  const search = async (query = '', page = 1, role = 'all', status = 'all', sort = 'newest') =>
    (await db.query('SELECT public.gkl_search_users($1,$2,$3,$4,$5) AS data', [query,page,role,status,sort])).rows[0].data;
  try {
    for (let index = 0; index < 25; index++) {
      await db.query(`INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data,banned_until,created_at)
        VALUES($1,$2,$3,$4,$5,$6)`, [crypto.randomUUID(), `family${index}@example.test`,
        { gkl_role: index < 2 ? 'admin' : 'user' }, { name: `Family ${String(index).padStart(2,'0')}` },
        index >= 22 ? '2099-01-01' : null, `2026-01-${String(index+1).padStart(2,'0')}T00:00:00Z`]);
    }
    const first = await search();
    assert.equal(first.total,25); assert.equal(first.pages,2); assert.equal(first.users.length,20);
    assert.equal(first.users[0].email,'family24@example.test');
    assert.deepEqual(first.stats,{total:25,active:22,inactive:3,admins:2});
    const second = await search('',2);
    assert.equal(second.users.length,5);
    assert.equal(new Set([...first.users,...second.users].map(u=>u.id)).size,25);
    const filtered = await search('',99,'user','active','name');
    assert.equal(filtered.total,20); assert.equal(filtered.page,1); assert.equal(filtered.users[0].name,'Family 02');
    assert.deepEqual(filtered.stats,first.stats);
    assert.equal((await search('',1,'all','inactive')).total,3);
    assert.equal((await search('',1,'admin','active','oldest')).users[0].email,'family0@example.test');
    assert.equal((await search('FAMILY 24')).total,1);
    for (const query of ['%', '_', "' OR true --"]) {
      const empty = await search(query,99);
      assert.equal(empty.total,0); assert.equal(empty.page,1); assert.deepEqual(empty.users,[]);
    }
    await db.exec(await readFile(new URL('../supabase/migrations/20261002020000_admin_directory.sql',import.meta.url),'utf8'));
    assert.deepEqual(await search(),first);
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      try { await assert.rejects(search(), /permission denied/); }
      finally { await db.exec('RESET ROLE'); }
    }
    await db.exec('SET ROLE service_role');
    assert.equal((await search()).total,25);
    await db.exec('RESET ROLE');
  } finally { await db.end(); }
});
