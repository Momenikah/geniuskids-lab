const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let user = null, startupError = '';
let recoveryEmail = '';
export const currentUser = () => user;
export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api/${path}`, { method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GeniusKidsLab' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch { throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('API belum tersedia. Jalankan aplikasi melalui server Node.js.'); }
  if (!response.ok) {
    if (response.status === 401 && user) { user = null; location.replace('/#login'); location.reload(); }
    throw new Error(data.error || 'Permintaan gagal. Coba lagi.');
  }
  return data;
}
export async function initAuth() {
  try { user = (await api('auth/me')).user; } catch (error) { startupError = error.message; }
}
function enterLab() { location.replace('/#home'); location.reload(); }
function message(form, text, success = false) {
  const node = form.querySelector('[data-message]');
  node.textContent = text;
  node.className = `form-message ${success ? 'success' : 'error'}`;
  node.setAttribute('role', success ? 'status' : 'alert');
}
async function submit(form, action) {
  const button = form.querySelector('button[type="submit"]'), label = button.textContent;
  button.disabled = true; button.textContent = 'Memproses…';
  message(form, '');
  try { await action(); } catch (error) { message(form, error.message); }
  finally { button.disabled = false; button.textContent = button.dataset.label || label; }
}
function passwordField(name, label, fresh = false) {
  const hint = name === 'confirmPassword' ? 'Ulangi password yang sama persis.' : fresh
    ? 'Gunakan 12–128 karakter. Pilih frasa panjang yang unik dan mudah Anda ingat.'
    : 'Password membedakan huruf besar dan kecil. Pastikan tidak ada spasi tambahan.';
  return `<div class="password-field"><label for="${name}">${label}</label><div class="password-control"><input id="${name}" name="${name}" type="password" autocomplete="${fresh ? 'new-password' : 'current-password'}" ${fresh ? 'minlength="12"' : ''} maxlength="128" required aria-describedby="${name}-hint" placeholder="${name === 'confirmPassword' ? 'Ulangi password' : fresh ? 'Minimal 12 karakter' : 'Masukkan password'}"><button class="password-toggle" type="button" data-toggle-password="${name}" aria-controls="${name}" aria-label="Tampilkan ${label.toLowerCase()}" aria-pressed="false">Lihat</button></div><p class="password-hint" id="${name}-hint">${hint}</p><p class="password-caps" id="${name}-caps" role="status" hidden>Caps Lock aktif.</p></div>`;
}
function bindPasswordFields(form) {
  form.querySelectorAll('[data-toggle-password]').forEach(button => {
    const input = form.elements[button.dataset.togglePassword];
    const label = input.labels[0].textContent.toLowerCase();
    button.onclick = () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.textContent = visible ? 'Sembunyikan' : 'Lihat';
      button.setAttribute('aria-label', `${visible ? 'Sembunyikan' : 'Tampilkan'} ${label}`);
      button.setAttribute('aria-pressed', String(visible));
    };
    const caps = form.querySelector(`#${input.id}-caps`);
    const updateCaps = event => { caps.hidden = !event.getModifierState?.('CapsLock'); };
    input.addEventListener('keydown', updateCaps);
    input.addEventListener('keyup', updateCaps);
    input.addEventListener('blur', () => { caps.hidden = true; });
  });
}
export function renderAuthPage(page) {
  if (page === 'register') {
    history.replaceState(null, '', '/#login');
    page = 'login';
  }
  const forgot = page === 'forgot-password', reset = page === 'reset-password';
  const heading = forgot ? 'Lupa password?' : reset ? 'Buat password baru' : 'Selamat datang kembali';
  const description = forgot ? 'Masukkan email akun Anda. Kami akan mengirimkan tautan untuk mengatur ulang password.' : reset ? 'Gunakan password baru dengan minimal 12 karakter.' : 'Masuk dan lanjutkan penemuan bersama si kecil.';
  document.title = `${heading} · Genius Kids Lab`;
  $('#app').innerHTML = `<main class="auth-layout"><section class="auth-story"><a class="auth-brand" href="#login"><img src="/assets/logo.png" alt="Genius Kids"><span>LAB<span class="branddot">•</span></span></a><div><p class="eyebrow">RASA INGIN TAHU DIMULAI DI SINI</p><h1>Ide kecil.<br>Penemuan <em>besar.</em></h1><p>Temani si kecil bertanya, mencoba, dan menemukan dunia sains yang seru.</p><img class="auth-illustration" src="/assets/workshop.webp" alt="Anak bereksperimen dengan kertas"><div class="auth-facts"><span>100 misi sains</span><span>10 dunia eksplorasi</span></div></div><small>Genius Kids Lab · Belajar dengan mencoba</small></section><section class="auth-form-area"><div class="auth-card"><p class="eyebrow">AKUN ORANG TUA</p><h2>${heading}</h2><p class="muted">${description}</p><form id="auth-form">${reset ? '' : '<label>Alamat email<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="nama@email.com"></label>'}${forgot ? '' : `${passwordField('password', reset ? 'Password baru' : 'Password', reset)}${reset ? passwordField('confirmPassword', 'Konfirmasi password', true) : '<a class="forgot-link" href="#forgot-password">Lupa password?</a>'}`}<p data-message class="form-message error" role="alert">${esc(startupError)}</p>${forgot ? '<div class="recovery-help" hidden><strong>Langkah berikutnya</strong><p>Buka email dari Genius Kids Lab, lalu pilih tautan reset untuk membuat password baru.</p><p>Belum menerima email? Periksa folder spam dan alamat email di atas. Jika meminta ulang, gunakan tautan dari email terbaru.</p></div>' : ''}<button type="submit" class="button big">${forgot ? 'Kirim tautan reset' : reset ? 'Simpan password baru' : 'Masuk ke lab'} <span aria-hidden="true">→</span></button></form><p class="auth-switch">${forgot || reset ? '<a href="#login">← Kembali ke login</a>' : 'Belum punya akun? Hubungi administrator untuk pendaftaran.'}</p><p class="auth-note">Akun digunakan oleh orang tua atau pendamping. Profil anak, progres, dan jurnal tersinkron privat ke akun saat online.</p></div></section></main>`;
  const form = $('#auth-form');
  bindPasswordFields(form);
  if (forgot) {
    form.elements.email.value = user?.email || recoveryEmail || '';
    form.elements.email.addEventListener('input', () => {
      form.querySelector('.recovery-help').hidden = true;
      message(form, '');
      const button = form.querySelector('button[type="submit"]');
      delete button.dataset.label;
      if (!button.disabled) button.textContent = 'Kirim tautan reset →';
    });
  }
  const forgotLink = form.querySelector('.forgot-link');
  if (forgotLink) forgotLink.addEventListener('click', () => { recoveryEmail = form.elements.email.value.trim(); });
  form.onsubmit = event => {
    event.preventDefault();
    submit(form, async () => {
      const values = Object.fromEntries(new FormData(form));
      if ((reset) && values.password !== values.confirmPassword) throw new Error('Konfirmasi password belum cocok.');
      if (reset) {
        const data = await api('auth/reset-password', { method: 'POST', body: values });
        user = null; form.reset(); message(form, data.message, true);
        form.querySelectorAll('.password-field').forEach(field => { field.hidden = true; });
        form.querySelector('button[type="submit"]').hidden = true;
        // Remove the used token from the address bar without hiding the success message.
        history.replaceState(null, '', '/#reset-password');
      } else if (forgot) {
        const data = await api('auth/forgot-password', { method: 'POST', body: values });
        recoveryEmail = values.email.trim();
        message(form, data.message, true);
        form.querySelector('.recovery-help').hidden = false;
        form.querySelector('button[type="submit"]').dataset.label = 'Kirim ulang tautan →';
      } else {
        await api('auth/login', { method: 'POST', body: values });
        enterLab();
      }
    });
  };
}

export function renderConfirmation() {
  const [, type, token] = location.hash.slice(1).split('/');
  const recovery = type === 'recovery';
  const valid = ['email', 'recovery'].includes(type) && /^[a-f0-9]{32,128}$/i.test(token || '');
  document.title = 'Konfirmasi email · Genius Kids Lab';
  $('#app').innerHTML = `<main class="auth-form-area confirmation-page"><section class="auth-card"><a class="auth-brand" href="#login"><img src="/assets/logo.png" alt="Genius Kids"></a><p class="eyebrow">AKUN ORANG TUA</p><h1>${recovery ? 'Pulihkan akses ke lab' : 'Konfirmasi email Anda'}</h1><p>${valid ? (recovery ? 'Lanjutkan untuk membuat password baru bagi akun Anda.' : 'Tekan tombol berikut untuk mengonfirmasi email dan mulai menjelajah.') : 'Tautan tidak valid. Silakan minta email baru.'}</p><form id="confirm-form"><p data-message class="form-message" role="alert"></p><button type="submit" class="button big" ${valid ? '' : 'disabled'}>${recovery ? 'Lanjutkan reset password' : 'Konfirmasi email'}</button></form><p class="auth-switch"><a href="${recovery ? '#forgot-password' : '#login'}">${recovery ? 'Minta tautan baru' : 'Kembali ke login'}</a></p></section></main>`;
  const form = $('#confirm-form');
  form.onsubmit = event => { event.preventDefault(); submit(form, async () => {
    await api('auth/verify', { method: 'POST', body: { type, token } });
    history.replaceState(null, '', recovery ? '/#reset-password' : '/#home');
    location.reload();
  }); };
}

export function accountPanel() {
  return `<section class="panel account-panel"><div><p class="eyebrow">AKUN ORANG TUA</p><h2>${esc(user.name)}</h2><p>${esc(user.email)} · ${user.role === 'admin' ? 'Administrator' : 'Pengguna'}</p></div><div class="form-actions">${user.role === 'admin' ? '<a href="#admin" class="button">Kelola pengguna</a>' : ''}<a href="#forgot-password" class="button secondary">Reset password</a><button id="logout" class="button secondary">Keluar</button></div></section>`;
}
export function bindLogout(notify,beforeLogout=async()=>true) {
  if (!$('#logout')) return;
  $('#logout').onclick = async () => {
    const button = $('#logout'); button.disabled = true;
    try { if(!await beforeLogout()){button.disabled=false;return} await api('auth/logout', { method: 'POST', body: {} }); location.replace('/#login'); location.reload(); }
    catch (error) { notify(error.message); button.disabled = false; }
  };
}
let adminPage = 1, adminQuery = '', renderVersion = 0;
export async function renderAdmin(shell) {
  const version = ++renderVersion;
  if (user?.role !== 'admin') { shell('<div class="empty"><h1>Akses terbatas</h1><p>Halaman ini hanya tersedia untuk administrator.</p><a class="button" href="#home">Kembali ke beranda</a></div>', 'parent', 'Akses terbatas'); return; }
  shell(`<div class="page-heading"><div><p class="eyebrow">ADMINISTRASI</p><h1>Kelola pengguna</h1><p>Atur akun dan akses keluarga di Genius Kids Lab.</p></div><button id="create-user" class="button">＋ Tambah pengguna</button></div><div id="admin-stats" class="stats"></div><form id="user-search" class="admin-search"><label class="search"><input name="q" type="search" aria-label="Cari nama atau email pengguna" placeholder="Cari nama atau email…" value="${esc(adminQuery)}" maxlength="100"></label><button type="submit" class="button secondary">Cari</button></form><p id="admin-message" class="form-message" role="status"></p><section class="panel admin-list"><div id="user-list" aria-live="polite">Memuat pengguna…</div></section>`, 'parent', 'Kelola pengguna');
  $('#user-search').onsubmit = e => { e.preventDefault(); adminQuery = new FormData(e.target).get('q'); adminPage = 1; renderAdmin(shell); };
  $('#create-user').onclick = () => userDialog(null, shell);
  try {
    const data = await api(`admin/users?q=${encodeURIComponent(adminQuery)}&page=${adminPage}`);
    if (version !== renderVersion || location.hash !== '#admin') return;
    $('#admin-stats').innerHTML = [[data.stats.total, 'Total pengguna'], [data.stats.active, 'Akun aktif'], [data.stats.admins, 'Admin aktif']].map(([count, label]) => `<div class="admin-stat"><strong>${count}</strong><p>${label}</p></div>`).join('');
    $('#user-list').innerHTML = `${data.users.length ? `<div class="table-scroll"><table class="users-table"><thead><tr><th scope="col">Pengguna</th><th scope="col">Peran</th><th scope="col">Status</th><th scope="col">Bergabung</th><th scope="col">Tindakan</th></tr></thead><tbody>${data.users.map(u => `<tr><td><b>${esc(u.name)} ${u.id === user.id ? '<small>(Anda)</small>' : ''}</b><span class="user-email">${esc(u.email)}</span></td><td>${u.role === 'admin' ? 'Administrator' : 'Pengguna'}</td><td><span class="status-pill ${u.active ? 'active' : ''}">${u.active ? 'Aktif' : 'Nonaktif'}</span></td><td>${new Date(u.createdAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}</td><td><div class="user-actions"><button class="button secondary small" data-edit="${u.id}">Edit<span class="sr-only"> ${esc(u.name)}</span></button><button class="button danger-ghost small" data-delete="${u.id}" ${u.id === user.id ? 'disabled title="Akun sendiri tidak dapat dihapus"' : ''}>Hapus<span class="sr-only"> ${esc(u.name)}</span></button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><h2>Pengguna tidak ditemukan</h2><p>Coba nama atau alamat email yang lain.</p></div>'}<div class="admin-pagination"><span>${data.total} pengguna · Halaman ${data.page} dari ${Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div><button class="button secondary small" id="prev-page" ${adminPage <= 1 ? 'disabled' : ''}>← Sebelumnya</button> <button class="button secondary small" id="next-page" ${adminPage * data.pageSize >= data.total ? 'disabled' : ''}>Berikutnya →</button></div></div>`;
    $('#prev-page').onclick = () => { adminPage--; renderAdmin(shell); };
    $('#next-page').onclick = () => { adminPage++; renderAdmin(shell); };
    document.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => userDialog(data.users.find(u => u.id === button.dataset.edit), shell));
    document.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => {
      const target = data.users.find(u => u.id === button.dataset.delete);
      if (!confirm(`Hapus akun ${target.email} secara permanen? Sesi dan tautan resetnya juga akan dihapus. Data keluarga di Supabase ikut dihapus. Salinan lokal pada perangkat pengguna tidak dihapus.`)) return;
      button.disabled = true;
      try { await api(`admin/users/${target.id}`, { method: 'DELETE', body: {} }); if (data.users.length === 1 && adminPage > 1) adminPage--; renderAdmin(shell); }
      catch (error) { if ($('#admin-message')) $('#admin-message').textContent = error.message; button.disabled = false; }
    });
  } catch (error) {
    if (version !== renderVersion || !$('#user-list')) return;
    $('#user-list').innerHTML = `<div class="empty"><h2>Data belum dapat dimuat</h2><p>${esc(error.message)}</p><button class="button" id="retry-users">Coba lagi</button></div>`;
    $('#retry-users').onclick = () => renderAdmin(shell);
  }
}
function userDialog(target, shell) {
  const dialog = document.createElement('dialog'); dialog.className = 'user-dialog'; dialog.setAttribute('aria-labelledby', 'user-dialog-title');
  const self = target?.id === user.id;
  dialog.innerHTML = `<form id="user-form"><div class="panel-head"><h2 id="user-dialog-title">${target ? 'Edit pengguna' : 'Tambah pengguna'}</h2><button type="button" class="small ghost" data-close aria-label="Tutup">✕</button></div><label>Nama<input name="name" required maxlength="80" autocomplete="off" value="${esc(target?.name || '')}"></label><label>Email<input name="email" type="email" required maxlength="254" autocomplete="off" value="${esc(target?.email || '')}"></label>${target ? '' : '<label>Password awal<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" placeholder="Minimal 12 karakter"></label>'}<label>Peran<select name="role" ${self ? 'disabled' : ''}><option value="user" ${target?.role !== 'admin' ? 'selected' : ''}>Pengguna</option><option value="admin" ${target?.role === 'admin' ? 'selected' : ''}>Administrator</option></select></label>${target ? `<label class="checkline"><input name="active" type="checkbox" ${target.active ? 'checked' : ''} ${self ? 'disabled' : ''}> Akun aktif</label><p class="muted">Mengubah email, peran, atau menonaktifkan akun akan mengakhiri sesi pengguna. ${self ? 'Peran dan status akun sendiri tidak dapat diubah.' : ''}</p>` : ''}<p data-message class="form-message" role="alert"></p><div class="form-actions"><button type="submit" class="button">${target ? 'Simpan perubahan' : 'Buat pengguna'}</button><button type="button" class="button secondary" data-close>Batal</button></div></form>`;
  document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = () => dialog.close());
  const form = dialog.querySelector('form');
  form.onsubmit = e => { e.preventDefault(); submit(form, async () => {
    const values = Object.fromEntries(new FormData(form));
    values.role = self ? 'admin' : values.role;
    if (target) values.active = self ? true : form.elements.active.checked;
    const data = await api(`admin/users${target ? `/${target.id}` : ''}`, { method: target ? 'PATCH' : 'POST', body: values });
    if (self && target.email !== data.user.email) { location.replace('/#login'); location.reload(); return; }
    if (self) user = data.user;
    dialog.close(); renderAdmin(shell);
  }); };
  dialog.showModal();
}
