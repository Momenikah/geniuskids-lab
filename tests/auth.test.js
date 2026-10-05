import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler } from '../server/api.js';
import { fakeSupabase } from './fake-supabase.js';
let fake, server, base, adminCookie, userCookie, userId;
const secret = 'strong-test-password-123';
async function request(path, { method='GET', body, cookie, origin=fake.env.APP_URL, csrf=true }={}) {
  const response = await fetch(`${base}/api/${path}`, { method,
    headers: { 'Content-Type':'application/json', ...(origin ? { Origin:origin } : {}), ...(csrf ? { 'X-Requested-With':'GeniusKidsLab' } : {}), ...(cookie ? { Cookie:cookie } : {}) },
    ...(body !== undefined ? { body:JSON.stringify(body) } : {}) });
  const cookies = response.headers.getSetCookie();
  return { status:response.status, data:await response.json(), cookie:cookies.map(v=>v.split(';')[0]).join('; '), cookies, cache:response.headers.get('cache-control') };
}
const login = (email, password=secret) => request('auth/login', { method:'POST', body:{ email,password } });
before(async () => {
  fake = await fakeSupabase();
  await fake.createUser({ email:'admin@example.test', password:secret, user_metadata:{ name:'Admin' }, app_metadata:{ gkl_role:'admin' } });
  server = http.createServer(createHandler({ env:fake.env }));
  await new Promise((resolve,reject)=>{ server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async ()=>{ if(server) await new Promise(resolve=>server.close(resolve)); if(fake) await fake.close(); });
test('self-registration creates an active ordinary account without email or admin approval', async () => {
  const result = await request('auth/me'); assert.equal(result.data.user,null); assert.match(result.cache,/no-store/);
  fake.setConfirmEmail(true);
  const outboxLength = fake.outbox.length;
  try {
    const created = await request('auth/register', {method:'POST', body:{
      email:' SELF@EXAMPLE.TEST ', name:'  Self Service  ', password:secret,
      role:'admin', app_metadata:{gkl_role:'admin'}, user_metadata:{gkl_role:'admin'}, email_confirm:false, active:false,
    }});
    assert.equal(created.status,201,JSON.stringify(created.data));
    assert.match(created.data.message,/langsung aktif/);
    assert.equal(created.data.access_token,undefined);
    const stored = (await fake.db.query("SELECT * FROM auth.users WHERE email='self@example.test'")).rows[0];
    assert.deepEqual(stored.raw_app_meta_data,{gkl_role:'user'});
    assert.deepEqual(stored.raw_user_meta_data,{name:'Self Service'});
    assert.ok(stored.email_confirmed_at);
    assert.equal(fake.outbox.length,outboxLength);
    const loggedIn = await login('self@example.test');
    assert.equal(loggedIn.status,200);
    assert.equal(loggedIn.data.user.active,true);
    assert.equal(loggedIn.data.user.role,'user');
    assert.equal((await request('auth/me',{cookie:loggedIn.cookie})).data.user.id,stored.id);
    assert.equal((await request('admin/users',{cookie:loggedIn.cookie})).status,403);
    const duplicate = await request('auth/register',{method:'POST',body:{email:'SELF@example.test',name:'Replacement',password:'replacement-password'}});
    assert.equal(duplicate.status,409);
    assert.equal((await login('self@example.test')).status,200);
    assert.equal((await fake.db.query('SELECT raw_user_meta_data FROM auth.users WHERE id=$1',[stored.id])).rows[0].raw_user_meta_data.name,'Self Service');
  } finally { fake.setConfirmEmail(false); }
});
test('registration rejects invalid fields and requests without origin protection', async () => {
  const body={email:'invalid@example.test',name:'Name',password:secret};
  for (const options of [{origin:'https://evil.example'}, {csrf:false}]) {
    assert.equal((await request('auth/register',{method:'POST',body,...options})).status,403);
  }
  for (const invalid of [{name:''},{name:' '.repeat(3)},{name:'a'.repeat(81)},{email:'invalid'}, {password:'short'}, {password:'x'.repeat(129)}]) {
    assert.equal((await request('auth/register',{method:'POST',body:{...body,...invalid}})).status,400);
  }
  assert.equal((await request('auth/register')).status,404);
  assert.equal((await fake.db.query("SELECT id FROM auth.users WHERE email='invalid@example.test'")).rows.length,0);
});
test('existing family login sets HttpOnly cookies and preserves user role', async () => {
  await fake.createUser({email:'family@example.test',password:secret,user_metadata:{name:'Keluarga Uji'}});
  const result=await login(' FAMILY@EXAMPLE.TEST ');
  assert.equal(result.status,200,JSON.stringify(result.data)); assert.equal(result.data.user.role,'user'); assert.equal(result.data.user.email,'family@example.test');
  assert.ok(result.cookies.some(cookie=>cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax')));
  assert.equal(result.data.access_token,undefined); userCookie=result.cookie; userId=result.data.user.id;
  assert.equal((await request('auth/me',{cookie:userCookie})).data.user.id,userId);
});
test('admin routes reject anonymous and ordinary users; invalid login is denied', async () => {
  assert.equal((await request('admin/users')).status,401);
  assert.equal((await request('admin/users',{cookie:userCookie})).status,403);
  for (const cookie of [undefined, userCookie]) {
    assert.equal((await request('admin/users',{method:'POST',cookie,body:{name:'Denied',email:'denied@example.test',password:secret,role:'admin'}})).status,cookie ? 403 : 401);
  }
  assert.equal((await fake.db.query("SELECT id FROM auth.users WHERE email='denied@example.test'")).rows.length,0);
  assert.equal((await request(`admin/users/${userId}`,{method:'DELETE',body:{},cookie:userCookie})).status,403);
  assert.equal((await login('family@example.test','wrong')).status,401);
  const result=await login('admin@example.test'); assert.equal(result.status,200); adminCookie=result.cookie;
});
test('admin create, literal search, role changes, disable, reenable and delete use Supabase', async () => {
  const result=await request('admin/users',{method:'POST',cookie:adminCookie,body:{name:'Managed Family',email:'managed@example.test',password:secret,role:'user'}});
  assert.equal(result.status,201,JSON.stringify(result.data)); const id=result.data.user.id;
  const session=await login('managed@example.test'); assert.equal(session.status,200);
  assert.equal((await request('admin/users?q=managed',{cookie:adminCookie})).data.total,1);
  assert.equal((await request('admin/users?q=%25',{cookie:adminCookie})).data.total,0);
  const next={name:'Updated',email:'managed@example.test',role:'user',active:false};
  assert.equal((await request(`admin/users/${id}`,{method:'PATCH',cookie:adminCookie,body:next})).status,200);
  const filtered=await request('admin/users?role=user&status=inactive&sort=name&q=managed&page=99',{cookie:adminCookie});
  assert.equal(filtered.status,200); assert.equal(filtered.data.total,1); assert.equal(filtered.data.page,1);
  assert.equal(filtered.data.users[0].id,id);
  for (const query of ['role=owner','status=banned','sort=random']) {
    assert.equal((await request(`admin/users?${query}`,{cookie:adminCookie})).status,400);
  }
  assert.equal((await request('auth/me',{cookie:session.cookie})).data.user,null);
  assert.equal((await login(next.email)).status,401);
  assert.equal((await request(`admin/users/${id}`,{method:'PATCH',cookie:adminCookie,body:{...next,active:true,role:'admin'}})).data.user.role,'admin');
  // Old sessions cannot revive when an account is reactivated.
  assert.equal((await request('auth/me',{cookie:session.cookie})).data.user,null);
  for (const body of [{},{confirmEmail:'wrong@example.test'}]) {
    assert.equal((await request(`admin/users/${id}`,{method:'DELETE',cookie:adminCookie,body})).status,400);
    assert.equal((await request('admin/users?q=managed',{cookie:adminCookie})).data.total,1);
  }
  assert.equal((await request(`admin/users/${id}`,{method:'DELETE',cookie:adminCookie,body:{confirmEmail:'managed@example.test'}})).status,200);
});
test('self protection and database-level last-admin guard', async () => {
  const me=(await request('auth/me',{cookie:adminCookie})).data.user;
  assert.equal((await request(`admin/users/${me.id}`,{method:'DELETE',cookie:adminCookie,body:{}})).status,400);
  assert.equal((await request(`admin/users/${me.id}`,{method:'PATCH',cookie:adminCookie,body:{name:me.name,email:me.email,role:'user',active:true}})).status,400);
  await assert.rejects(fake.db.query('DELETE FROM auth.users WHERE id=$1',[me.id]), /gkl_last_admin/);
});
test('legacy unconfirmed account can still confirm with a one-time token', async () => {
  const account=await fake.createUser({email:'confirm@example.test',user_metadata:{name:'Confirm'},password:secret},false);
  fake.sendEmail(account,'email');
  const unconfirmed=await login('confirm@example.test'); assert.equal(unconfirmed.status,401); assert.match(unconfirmed.data.error,/Konfirmasi email/);
  const token=fake.outbox.at(-1).token;
  const verified=await request('auth/verify',{method:'POST',body:{type:'email',token}});
  assert.equal(verified.status,200,JSON.stringify(verified.data)); assert.equal(verified.data.user.email,'confirm@example.test');
  assert.equal((await request('auth/verify',{method:'POST',body:{type:'email',token}})).status,400);
});
test('recovery email, OTP verification, password update and revocation of all app sessions', async () => {
  const known=await request('auth/forgot-password',{method:'POST',body:{email:'family@example.test'}});
  const unknown=await request('auth/forgot-password',{method:'POST',body:{email:'unknown@example.test'}});
  assert.deepEqual(known.data,unknown.data); const token=fake.outbox.at(-1).token;
  const verified=await request('auth/verify',{method:'POST',body:{type:'recovery',token}}); assert.equal(verified.status,200);
  assert.equal((await request('auth/reset-password',{method:'POST',body:{password:'new-test-password-long'},cookie:verified.cookie})).status,200);
  assert.equal((await request('auth/me',{cookie:userCookie})).data.user,null);
  assert.equal((await login('family@example.test')).status,401);
  assert.equal((await login('family@example.test','new-test-password-long')).status,200);
  assert.equal((await request('auth/verify',{method:'POST',body:{type:'recovery',token}})).status,400);
  assert.equal((await request('auth/reset-password',{method:'POST',body:{password:secret}})).status,401);
});
test('expired email token is rejected and SDK refresh keeps an allowed session', async () => {
  await request('auth/forgot-password',{method:'POST',body:{email:'family@example.test'}});
  const token=fake.outbox.at(-1).token; fake.otps.get(token).expires=0;
  assert.equal((await request('auth/verify',{method:'POST',body:{type:'recovery',token}})).status,400);
  const fresh=await login('family@example.test','new-test-password-long');
  const cookie=fresh.cookie.split('; ').find(v=>v.startsWith('gkl-supabase-auth='));
  assert.ok(cookie,'Test session fits in one cookie');
  const encoded=cookie.slice(cookie.indexOf('=')+1);
  const stored=JSON.parse(Buffer.from(encoded.slice('base64-'.length),'base64url').toString()); stored.expires_at=1;
  const stale=`gkl-supabase-auth=base64-${Buffer.from(JSON.stringify(stored)).toString('base64url')}`;
  const refreshed=await request('auth/me',{cookie:stale}); assert.equal(refreshed.data.user.id,userId); assert.ok(refreshed.cookie);
});
test('Supabase RPCs and internal tables are denied to anonymous and authenticated roles', async () => {
  for (const role of ['anon','authenticated']) {
    await fake.db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(fake.db.query("SELECT public.gkl_list_users('',1)"), /permission denied/);
      await assert.rejects(fake.db.query('SELECT * FROM public.gkl_session_access'), /permission denied/);
    } finally { await fake.db.exec('RESET ROLE'); }
  }
});
test('logout revokes the current session and failed logins are rate limited', async () => {
  assert.equal((await request('auth/logout',{method:'POST',body:{},cookie:adminCookie})).status,200);
  assert.equal((await request('auth/me',{cookie:adminCookie})).data.user,null);
  for(let i=0;i<10;i++) assert.equal((await login('rate@example.test','wrong')).status,401);
  assert.equal((await login('rate@example.test','wrong')).status,429);
});

test('user_metadata cannot grant admin and production cookies are Secure', async () => {
  await fake.db.query("UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data || '{\"gkl_role\":\"admin\",\"role\":\"admin\"}'::jsonb WHERE id=$1",[userId]);
  fake.env.NODE_ENV='production';
  try {
    const result=await login('family@example.test','new-test-password-long');
    assert.equal(result.data.user.role,'user');
    assert.ok(result.cookies.some(cookie=>cookie.includes('Secure')));
    assert.equal((await request('admin/users',{cookie:result.cookie})).status,403);
  } finally { delete fake.env.NODE_ENV; }
});
test('Supabase outage is reported as unavailable instead of an anonymous session', async () => {
  let payload;
  const handler=createHandler({ clients:()=>({client:{auth:{getUser:async()=>({error:{status:0,code:'network_error'}})}},admin:{}}) });
  const res={setHeader(){},end(value){payload=JSON.parse(value);}};
  await handler({url:'/api/auth/me',method:'GET',headers:{}},res);
  assert.equal(res.statusCode,503); assert.match(payload.error,/Supabase/);
});

test('family snapshots are private, versioned, idempotent, and removed with the account',async()=>{
  const parent=await login('family@example.test','new-test-password-long');
  const other=await login('confirm@example.test');
  const call=async(session,id,body)=>{
    const response=await fetch(`${base}/api/family`,{method:body?'POST':'GET',headers:{Cookie:session.cookie,'Content-Type':'application/json',Origin:fake.env.APP_URL,'X-Requested-With':'GeniusKidsLab','X-GKL-User':id},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  };
  assert.equal((await call(parent,userId)).data.revision,0);
  const data={version:1,profiles:[{id:'child',name:'Anak',age:8,entries:{1:{safe:true,done:true,observation:'Private journal',photo:'data:image/png;base64,aGVsbG8='}}}]};
  const saved=await call(parent,userId,{revision:0,data});assert.equal(saved.status,200);assert.equal(saved.data.revision,1);
  const retried=await call(parent,userId,{revision:0,data});assert.equal(retried.data.revision,1);
  const stale=structuredClone(data);stale.profiles[0].name='Stale';assert.equal((await call(parent,userId,{revision:0,data:stale})).status,409);
  assert.equal((await call(other,other.data.user.id)).data.data,null);
  assert.equal((await call(other,userId,{revision:1,data:stale})).status,401);
  assert.equal((await call(parent,userId,{revision:1,data:{version:1,profiles:[]}})).status,400);
  assert.equal((await call(parent,userId)).data.data.profiles[0].name,'Anak');
  for(const role of ['anon','authenticated']){
    await fake.db.exec(`SET ROLE ${role}`);
    try{await assert.rejects(fake.db.query('SELECT * FROM public.gkl_family_data'),/permission denied/);await assert.rejects(fake.db.query('SELECT public.gkl_read_family($1,$2)',[userId,crypto.randomUUID()]),/permission denied/)}finally{await fake.db.exec('RESET ROLE')}
  }
  await fake.db.query('DELETE FROM auth.users WHERE id=$1',[userId]);
  assert.equal((await fake.db.query('SELECT * FROM public.gkl_family_data WHERE user_id=$1',[userId])).rows.length,0);
});

test('registration rate limits email and IP before creating an account', async () => {
  const { digest } = await import('../server/security.js');
  for (const [key, limit, address] of [
    ['register:email:limited@example.test',10,'limited@example.test'],
    ['register:ip:127.0.0.1',20,'ip-limited@example.test'],
  ]) {
    for(let i=0;i<limit;i++) await fake.db.query('SELECT public.gkl_rate_limit($1,$2)',[digest(key),limit]);
    const response=await request('auth/register',{method:'POST',body:{email:address,name:'Limited',password:secret}});
    assert.equal(response.status,429);
    assert.equal((await fake.db.query('SELECT id FROM auth.users WHERE email=$1',[address])).rows.length,0);
  }
});
