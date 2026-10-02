// Isolated test server; never included in the production build.
import { createHandler } from '../server/api.js';
import { createLocalServer } from '../server/http.js';
import { fakeSupabase } from './fake-supabase.js';
const fake = await fakeSupabase({ appUrl: 'http://127.0.0.1:5179', confirmEmail: true });
await fake.createUser({ email:'admin@example.test', password:'browser-admin-password', user_metadata:{ name:'Admin Uji' }, app_metadata:{ gkl_role:'admin' } });
await fake.createUser({email:'sync@example.test',password:'browser-sync-password',user_metadata:{name:'Keluarga Sync'}});
await fake.createUser({email:'browser@example.test',password:'browser-family-password',user_metadata:{name:'Keluarga Browser'}});
await fake.createUser({email:'second@example.test',password:'second-family-password',user_metadata:{name:'Keluarga Kedua'}});
const handler = createHandler({ env: fake.env });
const server = createLocalServer((req,res) => {
  if (req.url === '/api/test-outbox' && req.method === 'GET') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(fake.outbox)); return; }
  return handler(req,res);
});
server.listen(5179,'127.0.0.1', () => console.log('UI test server ready'));
const close = () => server.close(async () => { await fake.close(); process.exit(0); });
process.on('SIGTERM',close); process.on('SIGINT',close);
