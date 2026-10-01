import { createAdminClient, unwrap } from '../server/supabase.js';
import { email, name, password } from '../server/security.js';
const admin = createAdminClient();
unwrap(await admin.auth.admin.createUser({
  email: email(process.env.ADMIN_EMAIL), password: password(process.env.ADMIN_PASSWORD), email_confirm: true,
  user_metadata: { name: name(process.env.ADMIN_NAME || 'Administrator') }, app_metadata: { gkl_role: 'admin' },
}));
console.log('Administrator Supabase dibuat. Hapus ADMIN_PASSWORD dari environment setelah selesai.');
