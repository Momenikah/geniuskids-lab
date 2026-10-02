import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/api.js';
import { createAdminClient } from '../server/supabase.js';
import { checkOrigin } from '../server/security.js';

const valid = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  APP_URL: 'https://app.example.test',
};
async function me(env) {
  let data;
  const res = { setHeader() {}, end(value) { data = JSON.parse(value); } };
  await createHandler({ env })({ url: '/api/auth/me', method: 'GET', headers: {} }, res);
  return { status: res.statusCode, data };
}

test('quoted and padded dashboard values no longer produce the generic 503', async () => {
  const env = Object.fromEntries(Object.entries(valid).map(([key, value]) => [key, `  "${value}"\n`]));
  assert.deepEqual(await me(env), { status: 200, data: { user: null } });
  const admin = createAdminClient(env);
  assert.equal(admin.supabaseKey, valid.SUPABASE_SECRET_KEY);
  checkOrigin({ headers: { origin: valid.APP_URL, 'x-requested-with': 'GeniusKidsLab' } }, env);
  assert.throws(() => checkOrigin({ headers: { origin: 'https://evil.example', 'x-requested-with': 'GeniusKidsLab' } }, env), { status: 403 });
});

test('invalid Supabase URLs identify the setting without disclosing its value', async () => {
  for (const url of ['example.supabase.co', 'not-a-url-secret', 'ftp://example.test', 'https://user:private@example.test', 'https://example.test/rest/v1', 'https://example.test/?key=private']) {
    const result = await me({ ...valid, SUPABASE_URL: url });
    assert.equal(result.status, 503);
    assert.match(result.data.error, /SUPABASE_URL tidak valid/);
    assert.ok(!result.data.error.includes(url));
  }
});

test('missing configuration identifies each required variable', async () => {
  for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
    const result = await me({ ...valid, [key]: '  ' });
    assert.equal(result.status, 503);
    assert.ok(result.data.error.includes(key));
    assert.match(result.data.error, /belum diisi/);
  }
});

test('legacy keys still work when preferred keys are blank', async () => {
  assert.deepEqual(await me({ ...valid, SUPABASE_PUBLISHABLE_KEY: ' ', SUPABASE_SECRET_KEY: '',
    SUPABASE_ANON_KEY: valid.SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY: valid.SUPABASE_SECRET_KEY }),
  { status: 200, data: { user: null } });
});

test('invalid APP_URL returns a specific configuration error before accessing Supabase', async () => {
  let data;
  const res = { setHeader() {}, end(value) { data = JSON.parse(value); } };
  await createHandler({ env: { ...valid, APP_URL: 'app.example.test' }, clients() { assert.fail('must validate origin first'); } })(
    { url: '/api/auth/login', method: 'POST', headers: { origin: valid.APP_URL } }, res);
  assert.equal(res.statusCode, 503);
  assert.match(data.error, /APP_URL tidak valid/);
});
