import { fakeSupabase } from '../tests/fake-supabase.js';
import { createLocalServer } from '../server/http.js';

async function startDemo() {
  console.log('Starting fake Supabase for demo...');
  const mock = await fakeSupabase({ confirmEmail: false });

  // Inject mock environment variables so the real server uses them
  Object.assign(process.env, mock.env);

  console.log('Creating demo user...');
  await mock.createUser({
    email: 'demo@example.com',
    password: 'Password1234!',
    user_metadata: { name: 'Demo User' },
    app_metadata: { gkl_role: 'admin' }
  });

  console.log('--------------------------------------------------');
  console.log('Demo user created!');
  console.log('Email: demo@example.com');
  console.log('Password: Password1234!');
  console.log('Role: admin');
  console.log('--------------------------------------------------');

  const server = createLocalServer();
  const port = process.env.PORT || 5173;
  server.listen(port, '127.0.0.1', () => {
    console.log(`Genius Kids Lab (Demo Mode): http://localhost:${port}`);
  });
}

startDemo().catch(console.error);
