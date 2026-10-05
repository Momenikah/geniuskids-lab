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
  const register = page === 'register';
  const forgot = page === 'forgot-password', reset = page === 'reset-password';
  const heading = register ? 'Buat akun orang tua' : forgot ? 'Lupa password?' : reset ? 'Buat password baru' : 'Selamat datang kembali';
  const description = register ? 'Daftar mandiri dan langsung mulai menjelajah. Akun aktif tanpa menunggu persetujuan admin.' : forgot ? 'Masukkan email akun Anda. Kami akan mengirimkan tautan untuk mengatur ulang password.' : reset ? 'Gunakan password baru dengan minimal 12 karakter.' : 'Masuk dan lanjutkan penemuan bersama si kecil.';
  document.title = `${heading} · Genius Kids Lab`;
  $('#app').innerHTML = `<main class="auth-layout"><section class="auth-story"><a class="auth-brand" href="#login"><img src="/assets/logo.png" alt="Genius Kids"><span>LAB<span class="branddot">•</span></span></a><div><p class="eyebrow">RASA INGIN TAHU DIMULAI DI SINI</p><h1>Ide kecil.<br>Penemuan <em>besar.</em></h1><p>Temani si kecil bertanya, mencoba, dan menemukan dunia sains yang seru.</p><img class="auth-illustration" src="/assets/workshop.webp" alt="Anak bereksperimen dengan kertas"><div class="auth-facts"><span>100 misi sains</span><span>10 dunia eksplorasi</span></div></div><small>Genius Kids Lab · Belajar dengan mencoba</small></section><section class="auth-form-area"><div class="auth-card"><p class="eyebrow">AKUN ORANG TUA</p><h2>${heading}</h2><p class="muted">${description}</p><form id="auth-form">${register ? '<label>Nama orang tua<input name="name" type="text" autocomplete="name" required maxlength="80" placeholder="Nama Anda"></label>' : ''}${reset ? '' : '<label>Alamat email<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="nama@email.com"></label>'}${forgot ? '' : `${passwordField('password', reset ? 'Password baru' : 'Password', reset || register)}${reset || register ? passwordField('confirmPassword', 'Konfirmasi password', true) : '<a class="forgot-link" href="#forgot-password">Lupa password?</a>'}`}<p data-message class="form-message error" role="alert">${esc(startupError)}</p>${forgot ? '<div class="recovery-help" hidden><strong>Langkah berikutnya</strong><p>Buka email dari Genius Kids Lab, lalu pilih tautan reset untuk membuat password baru.</p><p>Belum menerima email? Periksa folder spam dan alamat email di atas. Jika meminta ulang, gunakan tautan dari email terbaru.</p></div>' : ''}<button type="submit" class="button big">${register ? 'Daftar akun' : forgot ? 'Kirim tautan reset' : reset ? 'Simpan password baru' : 'Masuk ke lab'} <span aria-hidden="true">→</span></button></form><p class="auth-switch">${forgot || reset ? '<a href="#login">← Kembali ke login</a>' : register ? 'Sudah punya akun? <a href="#login">Masuk ke lab</a>' : 'Belum punya akun? <a href="#register">Daftar akun</a>'}</p><p class="auth-note">Akun digunakan oleh orang tua atau pendamping. Profil anak, progres, dan jurnal tersinkron privat ke akun saat online.</p></div></section></main>`;
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
      if ((reset || register) && values.password !== values.confirmPassword) throw new Error('Konfirmasi password belum cocok.');
      if (register) {
        const data = await api('auth/register', { method: 'POST', body: { name: values.name, email: values.email, password: values.password } });
        history.replaceState(null, '', '/#login');
        renderAuthPage('login');
        const loginForm = $('#auth-form');
        loginForm.elements.email.value = values.email.trim().toLowerCase();
        message(loginForm, data.message, true);
        loginForm.elements.password.focus();
      } else if (reset) {
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
let adminPage = 1, adminQuery = '', adminRole = 'all', adminStatus = 'all', adminSort = 'newest', renderVersion = 0;
function filterOptions(options, selected) {
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}
export async function renderAdmin(shell, notice = '') {
  const version = ++renderVersion;
  if (user?.role !== 'admin') { shell('<div class="empty"><h1>Akses terbatas</h1><p>Halaman ini hanya tersedia untuk administrator.</p><a class="button" href="#home">Kembali ke beranda</a></div>', 'parent', 'Akses terbatas'); return; }
  shell(`<div class="page-heading"><div><p class="eyebrow">ADMINISTRASI</p><h1>Kelola pengguna</h1><p>Atur akun dan akses keluarga di Genius Kids Lab.</p></div><div class="admin-toolbar"><button id="refresh-users" class="button secondary">Muat ulang</button><button id="create-user" class="button">＋ Tambah pengguna</button></div></div>
    <div id="admin-stats" class="stats admin-stats" aria-label="Ringkasan seluruh pengguna" aria-busy="true"></div>
    <form id="user-search" class="admin-search admin-filters">
      <label class="admin-query">Cari pengguna<input name="q" type="search" aria-label="Cari nama atau email pengguna" placeholder="Cari nama atau email…" value="${esc(adminQuery)}" maxlength="100"></label>
      <label>Peran<select name="role" aria-label="Filter peran">${filterOptions([['all','Semua peran'],['user','Pengguna'],['admin','Administrator']],adminRole)}</select></label>
      <label>Status<select name="status" aria-label="Filter status">${filterOptions([['all','Semua status'],['active','Aktif'],['inactive','Nonaktif']],adminStatus)}</select></label>
      <label>Urutan<select name="sort" aria-label="Urutkan pengguna">${filterOptions([['newest','Terbaru'],['oldest','Terlama'],['name','Nama A–Z']],adminSort)}</select></label>
      <div class="admin-filter-actions"><button type="submit" class="button secondary">Cari</button><button type="button" id="clear-filters" class="button secondary">Reset filter</button></div>
    </form>
    <p id="admin-message" class="form-message success" role="status">${esc(notice)}</p>
    <section class="panel admin-list" aria-label="Daftar pengguna"><div id="user-list" aria-live="polite" aria-busy="true"><p class="admin-loading">Memuat pengguna…</p></div></section>`, 'parent', 'Kelola pengguna');
  const search = $('#user-search');
  const applyFilters = () => {
    const values = new FormData(search);
    adminQuery = values.get('q').trim(); adminRole = values.get('role'); adminStatus = values.get('status'); adminSort = values.get('sort');
    adminPage = 1; renderAdmin(shell);
  };
  search.onsubmit = event => { event.preventDefault(); applyFilters(); };
  search.querySelectorAll('select').forEach(select => { select.onchange = applyFilters; });
  $('#clear-filters').onclick = () => { adminQuery = ''; adminRole = adminStatus = 'all'; adminSort = 'newest'; adminPage = 1; renderAdmin(shell); };
  $('#refresh-users').onclick = () => renderAdmin(shell);
  $('#create-user').onclick = () => userDialog(null, shell);
  try {
    const params = new URLSearchParams({ q: adminQuery, page: adminPage, role: adminRole, status: adminStatus, sort: adminSort });
    const data = await api(`admin/users?${params}`);
    if (version !== renderVersion || location.hash !== '#admin') return;
    adminPage = data.page;
    $('#admin-stats').setAttribute('aria-busy', 'false');
    $('#admin-stats').innerHTML = [[data.stats.total, 'Total pengguna'], [data.stats.active, 'Akun aktif'], [data.stats.inactive, 'Akun nonaktif'], [data.stats.admins, 'Admin aktif']].map(([count, label]) => `<div class="admin-stat"><strong>${count}</strong><p>${label}</p></div>`).join('');
    const protectedAccount = target => target.id === user.id || (target.role === 'admin' && target.active && data.stats.admins <= 1);
    $('#user-list').setAttribute('aria-busy', 'false');
    $('#user-list').innerHTML = `${data.users.length ? `<div class="table-scroll" role="region" aria-label="Tabel pengguna" tabindex="0"><table class="users-table"><thead><tr><th scope="col">Pengguna</th><th scope="col">Peran</th><th scope="col">Status</th><th scope="col">Bergabung</th><th scope="col">Tindakan</th></tr></thead><tbody>${data.users.map(u => `<tr><td><b>${esc(u.name)} ${u.id === user.id ? '<small>(Anda)</small>' : ''}</b><span class="user-email">${esc(u.email)}</span></td><td data-label="Peran"><span class="role-pill ${u.role === 'admin' ? 'administrator' : ''}">${u.role === 'admin' ? 'Administrator' : 'Pengguna'}</span></td><td data-label="Status"><span class="status-pill ${u.active ? 'active' : ''}">${u.active ? 'Aktif' : 'Nonaktif'}</span></td><td data-label="Bergabung">${new Date(u.createdAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}</td><td><div class="user-actions"><button class="button secondary small" data-edit="${u.id}">Edit<span class="sr-only"> ${esc(u.name)}</span></button><button class="button danger-ghost small" data-delete="${u.id}" ${protectedAccount(u) ? 'disabled title="Akun sendiri atau admin aktif terakhir tidak dapat dihapus"' : ''}>Hapus<span class="sr-only"> ${esc(u.name)}</span></button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><h2>Pengguna tidak ditemukan</h2><p>Ubah pencarian atau reset filter untuk melihat pengguna lainnya.</p></div>'}
      <div class="admin-pagination"><span>${data.total ? (data.page - 1) * data.pageSize + 1 : 0}–${Math.min(data.page * data.pageSize, data.total)} dari ${data.total} pengguna · Halaman ${data.page} dari ${data.pages}</span><div><button class="button secondary small" id="prev-page" ${data.page <= 1 ? 'disabled' : ''}>← Sebelumnya</button> <button class="button secondary small" id="next-page" ${data.page >= data.pages ? 'disabled' : ''}>Berikutnya →</button></div></div>`;
    $('#prev-page').onclick = () => { adminPage--; renderAdmin(shell); };
    $('#next-page').onclick = () => { adminPage++; renderAdmin(shell); };
    document.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => {
      const target = data.users.find(u => u.id === button.dataset.edit);
      userDialog(target, shell, protectedAccount(target));
    });
    document.querySelectorAll('[data-delete]').forEach(button => button.onclick = () => deleteUserDialog(data.users.find(u => u.id === button.dataset.delete), shell));
  } catch (error) {
    if (version !== renderVersion || location.hash !== '#admin' || !$('#user-list')) return;
    $('#admin-stats').setAttribute('aria-busy', 'false');
    $('#user-list').setAttribute('aria-busy', 'false');
    $('#user-list').innerHTML = `<div class="empty"><h2>Data belum dapat dimuat</h2><p>${esc(error.message)}</p><button class="button" id="retry-users">Coba lagi</button></div>`;
    $('#retry-users').onclick = () => renderAdmin(shell);
  }
}
function adminDialog(markup, onSubmit) {
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'user-dialog'; dialog.setAttribute('aria-labelledby', 'user-dialog-title');
  dialog.innerHTML = markup;
  document.body.append(dialog);
  let busy = false;
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); });
  dialog.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => { if (!busy) dialog.close(); }; });
  const form = dialog.querySelector('form');
  form.onsubmit = event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    dialog.querySelectorAll('[data-close]').forEach(button => { button.disabled = true; });
    submit(form, () => onSubmit(form, dialog)).finally(() => {
      busy = false;
      dialog.querySelectorAll('[data-close]').forEach(button => { button.disabled = false; });
    });
  };
  dialog.showModal();
  return form;
}
function userDialog(target, shell, protectRole = false) {
  const self = target?.id === user.id;
  const form = adminDialog(`<form id="user-form"><div class="panel-head"><h2 id="user-dialog-title">${target ? 'Edit pengguna' : 'Tambah pengguna'}</h2><button type="button" class="small ghost" data-close aria-label="Tutup">✕</button></div>
    <label>Nama<input name="name" required maxlength="80" autocomplete="off" value="${esc(target?.name || '')}"></label>
    <label>Email<input name="email" type="email" required maxlength="254" autocomplete="off" value="${esc(target?.email || '')}"></label>
    ${target ? '' : `${passwordField('password', 'Password awal', true)}${passwordField('confirmPassword', 'Konfirmasi password', true)}<p class="muted">Akun langsung aktif. Sampaikan password awal kepada pemilik akun melalui saluran pribadi.</p>`}
    <label for="user-role">Peran</label><select id="user-role" name="role" aria-describedby="role-help" ${protectRole ? 'disabled' : ''}><option value="user" ${target?.role !== 'admin' ? 'selected' : ''}>Pengguna</option><option value="admin" ${target?.role === 'admin' ? 'selected' : ''}>Administrator</option></select>
    <p class="muted" id="role-help">Administrator dapat membuat, mengubah, dan menghapus akun pengguna.</p>
    ${target ? `<label class="checkline"><input name="active" type="checkbox" ${target.active ? 'checked' : ''} ${protectRole ? 'disabled' : ''}> Akun aktif</label><p class="muted">Mengubah email, peran, atau menonaktifkan akun akan mengakhiri sesi pengguna. ${protectRole ? 'Peran dan status akun sendiri atau admin aktif terakhir dilindungi.' : ''}</p>` : ''}
    <p data-message class="form-message" role="alert"></p><div class="form-actions"><button type="submit" class="button">${target ? 'Simpan perubahan' : 'Buat pengguna'}</button><button type="button" class="button secondary" data-close>Batal</button></div></form>`, async (form, dialog) => {
    const values = Object.fromEntries(new FormData(form));
    if (!target && values.password !== values.confirmPassword) throw new Error('Konfirmasi password belum cocok.');
    delete values.confirmPassword;
    values.role = protectRole ? target.role : values.role;
    if (target) values.active = protectRole ? target.active : form.elements.active.checked;
    const data = await api(`admin/users${target ? `/${target.id}` : ''}`, { method: target ? 'PATCH' : 'POST', body: values });
    if (self && target.email !== data.user.email) { location.replace('/#login'); location.reload(); return; }
    if (self) user = data.user;
    dialog.close();
    if (location.hash !== '#admin') return;
    if (!target) { adminPage = 1; adminQuery = ''; adminRole = adminStatus = 'all'; adminSort = 'newest'; }
    renderAdmin(shell, target ? `Perubahan ${data.user.email} berhasil disimpan.` : `Akun ${data.user.email} berhasil dibuat.`);
  });
  bindPasswordFields(form);
}
function deleteUserDialog(target, shell) {
  const form = adminDialog(`<form><div class="panel-head"><h2 id="user-dialog-title">Hapus pengguna?</h2><button type="button" class="small ghost" data-close aria-label="Tutup">✕</button></div>
    <p>Akun <strong>${esc(target.name)}</strong> (${esc(target.email)}) beserta profil dan jurnal keluarga di cloud akan dihapus permanen. Salinan lokal pada perangkat pengguna tetap ada.</p>
    <p>Untuk menghentikan akses sementara, gunakan <strong>Edit → Akun aktif</strong>.</p>
    <label>Ketik email pengguna<input name="confirmEmail" type="email" required autocomplete="off" spellcheck="false" placeholder="${esc(target.email)}"></label>
    <p data-message class="form-message" role="alert"></p><div class="form-actions"><button type="submit" class="button danger-ghost" disabled>Hapus permanen</button><button type="button" class="button secondary" data-close>Batal</button></div></form>`, async (form, dialog) => {
    const confirmEmail = form.elements.confirmEmail.value.trim().toLowerCase();
    if (confirmEmail !== target.email.toLowerCase()) throw new Error('Alamat email belum cocok.');
    await api(`admin/users/${target.id}`, { method: 'DELETE', body: { confirmEmail } });
    dialog.close();
    if (location.hash === '#admin') renderAdmin(shell, `Akun ${target.email} berhasil dihapus.`);
  });
  form.elements.confirmEmail.oninput = () => {
    form.querySelector('[type="submit"]').disabled = form.elements.confirmEmail.value.trim().toLowerCase() !== target.email.toLowerCase();
  };
}
