# Genius Kids Lab — Supabase

Panduan instalasi langkah demi langkah: [Deploy ke Vercel dan Supabase](INSTALL_VERCEL_SUPABASE.md).

Aplikasi pendamping 100 eksperimen sains berbahasa Indonesia. Akun, password, konfirmasi email, dan pemulihan akun menggunakan **Supabase Auth**. Backend Node.js menghubungkan antarmuka dengan Supabase dan membatasi operasi admin. Profil anak, progres, jurnal, dan foto kini tersinkron antarperangkat dalam akun yang sama. Tidak perlu koneksi PostgreSQL langsung atau SMTP di aplikasi.

## Konfigurasi Supabase

1. Buat project Supabase, lalu salin Project URL dan API keys dari Dashboard ke `.env` berdasarkan `.env.example`:

   ```bash
   npm ci
   cp .env.example .env
   ```

   Isi `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, dan `APP_URL` (lokal: `http://localhost:5173`). Pasangan key legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` juga didukung. Secret/service-role key hanya berada di server; jangan masukkan ke JavaScript frontend atau repository.

2. Buka **SQL Editor**, jalankan migrasi awal: [`20261002000000_init.sql`](supabase/migrations/20261002000000_init.sql). File ini mencakup Auth, admin, dan family sync dalam satu transaksi. SQL dapat dijalankan ulang tanpa menghapus data aplikasi. Untuk project baru yang sudah terhubung ke Supabase CLI, gunakan `supabase db push`. Jika project pernah memakai migrasi lama, ikuti bagian **Migrasi dari dua file SQL lama** di bawah.

   Setelah itu jalankan [`20261002010000_admin_only_registration.sql`](supabase/migrations/20261002010000_admin_only_registration.sql). Migrasi tambahan menolak akun baru tanpa `app_metadata.gkl_role` dari Admin API; akun lama tidak diubah.

   Terakhir, jalankan [`20261002020000_admin_directory.sql`](supabase/migrations/20261002020000_admin_directory.sql) untuk filter peran/status, pengurutan, dan pagination admin. Terapkan sebelum deployment kode terbaru; migrasi ini tidak mengubah data akun.

   Migrasi menambahkan tabel internal dengan RLS, fungsi pencarian pengguna dan rate limit yang hanya dapat dipanggil service role, izin sesi aplikasi, serta trigger proteksi admin terakhir. Akun tetap berada di `auth.users` yang dikelola Supabase; tidak ada tabel password aplikasi.

3. Di **Authentication → Providers / Sign In**, aktifkan Email. Nonaktifkan **Allow new users to sign up** di pengaturan Auth. Pendaftaran mandiri tersedia melalui API aplikasi yang memakai Admin API di server untuk membuat akun biasa langsung aktif. Pengaturan ini tetap dimatikan agar pendaftaran langsung ke Supabase tidak melewati validasi dan rate limit aplikasi; konfirmasi email akun lama tetap didukung. Atur minimum panjang password Supabase ke **12** agar batas yang sama berlaku juga pada request langsung ke Supabase.

4. Di **Authentication → URL Configuration**, atur **Site URL** sama dengan `APP_URL`, tanpa path/hash. Tambahkan origin lokal dan domain deployment ke **Redirect URLs**. Untuk production gunakan HTTPS. Preview Vercel membutuhkan `APP_URL` dan Redirect URL yang sesuai domain preview.

5. Di **Authentication → Email Templates**, gunakan tautan berikut. **Langkah ini wajib**: aplikasi memakai TokenHash, bukan callback OAuth/implicit bawaan.

   **Confirm signup**:

   ```html
   <h2>Selamat datang di Genius Kids Lab</h2>
   <p><a href="{{ .RedirectTo }}/#auth-confirm/email/{{ .TokenHash }}">Konfirmasi email Anda</a></p>
   ```

   **Reset password**:

   ```html
   <h2>Reset password Genius Kids Lab</h2>
   <p><a href="{{ .RedirectTo }}/#auth-confirm/recovery/{{ .TokenHash }}">Atur ulang password</a></p>
   ```

   API selalu mengisi `RedirectTo` dengan origin dari `APP_URL`. Pengguna menekan tombol konfirmasi di aplikasi sebelum token ditukarkan; ini juga mengurangi risiko pemindai email otomatis menghabiskan tautan. Atur masa berlaku OTP/email di pengaturan Supabase, misalnya 1.800 detik.

6. Untuk email sungguhan, konfigurasi **Custom SMTP di Dashboard Supabase** dan verifikasi domain pengirim. Layanan email bawaan memiliki batas pengiriman/penerima; jangan mengandalkannya untuk semua pengguna production. Sesuaikan rate limit Supabase untuk trafik melalui backend bersama. Aplikasi juga memiliki rate limit per IP/email yang disimpan di Supabase.

Dokumentasi acuan: [email templates Supabase](https://supabase.com/docs/guides/auth/auth-email-templates), [pengelolaan sesi](https://supabase.com/docs/guides/auth/sessions), dan [Admin API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).

## Migrasi dari dua file SQL lama

Migrasi Auth `20261001000000` dan family sync `20261001010000` telah digabung menjadi `20261002000000_init.sql`.

- **Pernah menjalankan SQL manual:** jalankan seluruh file gabungan di SQL Editor, termasuk jika sebelumnya baru menjalankan Auth. Tabel dan data yang ada tetap dipertahankan; fungsi dan trigger diperbarui.
- **Memakai Supabase CLI:** jalankan file gabungan di SQL Editor terlebih dahulu. Setelah berhasil, periksa `supabase migration list` pada project yang sesuai. Untuk setiap versi lama yang tercatat di remote, hapus catatan versi tersebut dengan perintah yang sesuai di bawah, lalu tandai versi gabungan sudah diterapkan:

  ```bash
  # Hanya untuk versi lama yang tercatat di remote:
  supabase migration repair 20261001000000 --status reverted
  supabase migration repair 20261001010000 --status reverted
  # Setelah seluruh SQL gabungan berhasil dijalankan:
  supabase migration repair 20261002000000 --status applied
  supabase migration list
  ```

`migration repair` hanya mengubah riwayat migrasi, bukan menjalankan atau membatalkan SQL. Lihat [dokumentasi riwayat migrasi Supabase](https://supabase.com/docs/guides/deployment/database-migrations). Setelah riwayat sesuai, migrasi berikutnya dapat diterapkan dengan `supabase db push`.

## Buat admin dan jalankan

Isi `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` di `.env`. Gunakan email baru dan password unik 12–128 karakter:

```bash
npm run admin:create
npm run dev
```

Buka http://localhost:5173. Hapus `ADMIN_PASSWORD` dari `.env` setelah selesai. Bootstrap membuat akun Supabase dengan email terkonfirmasi dan `app_metadata.gkl_role=admin`. Email yang sudah ada tidak ditimpa. Untuk akun yang sudah ada, peran harus diperbarui melalui operasi admin tepercaya; alamat email saja tidak memberikan akses admin.

Node.js 22+ diperlukan. Untuk hasil build:

```bash
npm run build
npm start
```

## Deploy Vercel

- Framework **Other**, build command `npm run build`, output directory `dist`.
- Isi environment `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_URL` di Vercel. Tidak perlu `DATABASE_URL` atau environment SMTP lama.
- Jalankan SQL, konfigurasi Auth/email templates, dan bootstrap admin sebelum pengujian.
- Backend `api/index.js` menerima `/api/*` melalui rewrite. Service worker tidak menyimpan API; respons API menggunakan `no-store`.
- Periksa login, email konfirmasi/reset sungguhan, cookie, dan admin pada domain deployment.

## Akun dan admin

Halaman `/#register`, `/#login`, `/#forgot-password`, `/#reset-password`, dan `/#admin` tersedia. Pengguna dapat memilih **Daftar akun** dari login, mengisi nama, email, password 12–128 karakter, dan konfirmasi password. `POST /api/auth/register` membuat akun dengan `app_metadata.gkl_role=user` dan `email_confirm=true`, sehingga langsung aktif tanpa persetujuan admin atau klik tautan email. Setelah berhasil, pengguna diarahkan ke login dengan email terisi. Email sudah dipakai ditolak tanpa mengubah akun lama. Endpoint memvalidasi origin, membatasi percobaan per IP/email, dan mengabaikan peran/metadata/status dari browser. Admin dapat mencari pengguna dengan pagination, menyaring peran/status, mengurutkan berdasarkan nama atau waktu pendaftaran, membuat akun, mengubah nama/email/peran, serta menonaktifkan/mengaktifkan akun. Statistik menunjukkan seluruh akun (total, aktif, nonaktif, admin aktif), tidak hanya hasil filter. Tombol **Muat ulang** mempertahankan filter dan **Reset filter** mengembalikan tampilan awal. Halaman otomatis disesuaikan jika hasil pencarian berkurang. Akun yang dibuat admin langsung terkonfirmasi; admin bertanggung jawab menyerahkan password awal kepada pemilik akun.

Form **Tambah pengguna** menyediakan konfirmasi password, tombol lihat/sembunyikan, dan petunjuk panjang password. Form tetap terbuka dengan data yang diisi jika terjadi error seperti email duplikat. Penghapusan memerlukan pengetikan email akun; API juga memvalidasi `confirmEmail`. Peran/status akun sendiri dan admin aktif terakhir dilindungi di form maupun backend.

Form login menampilkan petunjuk huruf besar/kecil, tombol **Lihat / Sembunyikan**, dan indikator Caps Lock. Form password baru mencantumkan batas 12–128 karakter. Tautan **Lupa password?** membawa email dari form login; setelah permintaan berhasil, tersedia panduan memeriksa email/spam dan tombol **Kirim ulang tautan**. Pengiriman email tetap menggunakan konfigurasi Supabase di atas.

Peran aplikasi dibaca dari **app_metadata.gkl_role** yang hanya dapat diubah oleh server tepercaya, bukan `user_metadata`. API memverifikasi pengguna melalui Supabase Auth pada setiap request yang membutuhkan akun, kemudian memeriksa izin sesi di database. Sesi Supabase menggunakan cookie HttpOnly, SameSite=Lax, dan Secure pada HTTPS/production. Refresh token dikelola SDK di server; token dan secret tidak dikirim melalui JSON API ke frontend.

Trigger database mencabut izin sesi aplikasi saat password/email/peran/status berubah; akun tidak memperoleh kembali akses dari sesi lama ketika diaktifkan ulang. Supabase mengelola token Auth, dan perubahan izin ini berlaku untuk API aplikasi. Admin tidak dapat menghapus/menonaktifkan/menurunkan peran sendiri. Trigger juga menolak penghapusan admin aktif terakhir, termasuk lewat Supabase Dashboard; buat admin pengganti sebelum menghapusnya. Tabel internal memiliki RLS tanpa akses pengguna biasa, dan RPC hanya diberikan ke service role.

### Pembaruan pendaftaran mandiri

Jika ketiga migrasi di atas sudah diterapkan, cukup deploy kode terbaru; tidak perlu migrasi SQL tambahan. Tetap nonaktifkan **Allow new users to sign up** di Supabase. Backend menggunakan secret/service-role key yang sudah ada untuk membuat akun terkonfirmasi dengan peran `user`. Admin tidak perlu menambahkan atau menyetujui akun tersebut. Akun lama, termasuk yang dinonaktifkan, tidak diubah.

## Pulihkan admin yang sudah terdaftar

Untuk akun `wahib.chelsea@gmail.com`, jalankan [`supabase/admin/restore-wahib-admin.sql`](supabase/admin/restore-wahib-admin.sql) di SQL Editor project production yang sama dengan Vercel. Script hanya mempromosikan akun yang sudah ada dan terkonfirmasi, mempertahankan password, metadata lain, dan jurnal. Script berhenti jika akun tidak ditemukan, belum terkonfirmasi, atau sedang dinonaktifkan. Email tidak dijadikan pengecualian admin dalam kode aplikasi.

Setelah hasil SQL menunjukkan `role = admin`, keluar dan login kembali di `https://geniuskids-lab.vercel.app`, lalu buka `https://geniuskids-lab.vercel.app/#admin`. Perubahan peran mencabut izin sesi lama. Pengguna dapat mendaftar sendiri melalui **Daftar akun**. Admin tetap dapat membuat akun melalui **Tambah pengguna**.

Urutan penerapan: jalankan migrasi tambahan, pulihkan admin, nonaktifkan **Allow new users to sign up** di Supabase, lalu deploy kode terbaru ke Vercel. Push GitHub tidak menjalankan SQL Supabase secara otomatis. Pembuatan akun lewat Dashboard tanpa metadata role juga ditolak oleh trigger; gunakan form daftar aplikasi untuk akun biasa, halaman admin untuk pengelolaan akun, atau `npm run admin:create` untuk bootstrap.

## Sinkronisasi profil, progres, jurnal, dan foto

Masuk dengan akun yang sama pada perangkat kedua. Data akan diunduh dari Supabase saat aplikasi dibuka. Setiap perubahan disimpan lokal dahulu dan dikirim otomatis setelah jeda singkat; status **✓ Tersinkron ke akun** berarti server telah mengakui versi tersebut. Klik ikon sinkronisasi di header untuk melihat status, waktu terakhir tersimpan, mengunduh cadangan, atau **Sinkronkan sekarang**.

- Yang ikut disinkronkan: maksimal lima profil anak (nama/usia), checklist bahan/langkah, persetujuan keamanan, status misi/lencana, isi jurnal, hasil percobaan, serta foto terkompresi. Profil yang sedang dipilih tetap mengikuti perangkat.
- Perangkat mengambil perubahan saat dibuka, kembali fokus/online, dan setiap 30 detik ketika halaman aktif. Ini memakai pemeriksaan berkala, bukan Supabase Realtime. Form yang sedang diedit tidak diganti oleh hasil refresh.
- Jika internet terputus saat aplikasi sudah terbuka, perubahan disimpan dalam antrean lokal dan dicoba lagi otomatis saat online. Draf yang sudah disimpan tetap ada setelah reload; pembukaan ulang/login membutuhkan internet untuk verifikasi sesi. Tunggu status tersinkron sebelum pindah perangkat atau membersihkan data browser.
- Jika dua perangkat mengubah versi yang sama, server menolak penimpaan diam-diam. Dialog konflik menyediakan **Unduh versi perangkat**, **Unduh versi lain**, dan pilihan versi. Pemilihan mengganti seluruh data keluarga, bukan menggabungkan kolom secara otomatis. Unduh kedua cadangan bila perubahan keduanya diperlukan, lalu gabungkan secara manual. Perubahan tab lain juga dideteksi.
- Kapasitas snapshot keluarga **3 MiB**. Foto disimpan sebagai data raster terkompresi dalam JSON privat (bukan bucket publik); per foto maksimal 750.000 karakter base64 (sekitar 550 KB). Batas unggah sumber 5 MB; aplikasi mengecilkan gambar ke maksimal 900 × 900 piksel. Saat batas tercapai, data tetap lokal; ekspor cadangan dan kurangi foto sebelum sinkronisasi dapat dilanjutkan. Setiap kolom jurnal maksimal 10.000 karakter.
- `gkl_family_data` hanya diakses melalui API pemilik akun. RLS menolak akses tabel langsung dari role anon/authenticated; RPC hanya untuk server dan memeriksa kecocokan sesi/pemilik. UI admin tidak memberikan akses ke jurnal keluarga lain. Header identitas pemilik juga mencegah tab lama mengirim jurnal ke akun berbeda setelah cookie login berganti.
- Menghapus akun Supabase menghapus data cloud keluarga melalui foreign-key cascade. Salinan lokal pada perangkat pengguna tetap ada. Ekspor cadangan berkala; materi eksperimen sendiri tetap publik.

Struktur menggunakan satu snapshot JSON per keluarga dengan nomor revisi. Pembandingan revisi dan penyimpanan berlangsung atomik; pengiriman ulang data yang sama setelah respons hilang tidak membuat konflik palsu. Ini cocok untuk ukuran data keluarga saat ini; foto berjumlah besar memerlukan penyimpanan objek terpisah pada pengembangan berikutnya.

## Perpindahan dari versi sebelumnya

Data lokal akun Supabase versi sebelumnya dibaca otomatis dan masuk antrean sinkronisasi. Jika akun sudah memiliki data cloud yang berbeda, aplikasi menampilkan pilihan versi terlebih dahulu. Cadangan lama tanpa akun tetap bisa diunduh melalui Area orang tua. Jangan membersihkan browser sebelum sinkronisasi berhasil.

Jika versi PostgreSQL sebelumnya sudah dipakai, **ekspor jurnal sebelum berpindah**: ID Supabase berbeda dari ID akun lama. Akun/password versi sebelumnya tidak otomatis dimigrasikan. Buat akun Supabase dan pulihkan file cadangan melalui Area orang tua. Tabel database lama tidak dihapus oleh migrasi ini. Data sebelum fitur akun masih bisa diunduh melalui **Unduh cadangan versi lama** bila tersedia di browser. Pemulihan JSON mengganti data akun yang sedang login dan kemudian disinkronkan ke perangkat lain setelah konfirmasi.

## Struktur dan pengujian

- `server/supabase.js`: SDK Supabase, cookie request, dan client admin khusus server.
- `server/api.js`: autentikasi dan manajemen pengguna.
- `supabase/migrations/`: RLS, RPC, akses sesi, proteksi admin, dan snapshot keluarga.
- `sync.js`, `family-data.js`: antrean lokal, pemeriksaan revisi, resolusi konflik, dan validasi data bersama.
- `auth.js`, `app.js`, `style.css`: antarmuka akun/admin, eksperimen, dan jurnal.
- `tests/fake-supabase.js`: layanan Auth/REST tiruan khusus pengujian; bukan pengganti Supabase production.

```bash
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Tes menggunakan SDK Supabase asli melawan layanan tiruan lokal serta SQL migrasi di PGlite. Tidak membutuhkan kredensial project dan tidak membuktikan konfigurasi layanan Supabase live. Lihat `TESTING.md` untuk cakupan dan pemeriksaan deployment.
