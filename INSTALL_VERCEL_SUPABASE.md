# Panduan Instalasi Genius Kids Lab di Vercel dan Supabase

Panduan ini menggunakan Supabase untuk akun dan database, serta Vercel untuk website dan API Node.js. Jalankan langkah secara berurutan dari persiapan sampai pengujian deployment.

## 1. Persiapan

Siapkan:

- Akun [Supabase](https://supabase.com/dashboard), [Vercel](https://vercel.com), dan GitHub.
- Source code proyek ini di repository GitHub yang bisa diakses Vercel.
- Node.js versi 22 atau lebih baru dan npm di komputer untuk membuat admin dan menguji aplikasi.
- Layanan SMTP dan alamat pengirim terverifikasi untuk email pengguna production.

Jalankan terminal di folder yang berisi `package.json`:

```bash
npm ci
cp .env.example .env
```

Jika memakai PowerShell, gunakan `Copy-Item .env.example .env` untuk menyalin file. Jika `.env` sudah ada, edit file tersebut tanpa menimpanya.

File `.env` sudah dikecualikan oleh `.gitignore`. Jangan unggah file tersebut atau key rahasia ke GitHub. Sertakan source code lengkap, termasuk `api/`, `server/`, `supabase/`, `package-lock.json`, dan `vercel.json`; jangan hanya mengunggah folder `dist`.

## 2. Buat project Supabase dan ambil kredensial

1. Buka Dashboard Supabase dan pilih **New project**.
2. Pilih organisasi, isi nama project, buat password database yang kuat, dan pilih region yang sesuai pengguna.
3. Tunggu project siap.
4. Salin **Project URL** dari dialog **Connect** atau pengaturan API project.
5. Buka **Settings → API Keys**, lalu salin **Publishable key** dan **Secret key**.

Isi `.env` lokal dengan nilai project tersebut:

```dotenv
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_GANTI_DENGAN_KEY_ASLI
SUPABASE_SECRET_KEY=sb_secret_GANTI_DENGAN_KEY_ASLI
APP_URL=http://localhost:5173
PORT=5173
```

Semua nilai di atas adalah contoh. URL dan kedua key harus berasal dari project Supabase yang sama. Password database bukan nilai `SUPABASE_SECRET_KEY`.

Jika project menggunakan key legacy, aplikasi juga mendukung `SUPABASE_ANON_KEY` dan `SUPABASE_SERVICE_ROLE_KEY` sebagai pengganti pasangan publishable/secret. Pilih satu pasangan; hapus nilai placeholder pasangan lainnya agar tidak terbaca lebih dahulu oleh aplikasi.

Secret key atau service-role key hanya boleh dipakai oleh server. Jangan menaruhnya di JavaScript frontend atau direktori `dist`. Lihat [penjelasan API keys Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

## 3. Jalankan migrasi database

1. Di project Supabase, buka **SQL Editor → New query**.
2. Buka file [supabase/migrations/20261002000000_init.sql](supabase/migrations/20261002000000_init.sql) di komputer.
3. Salin **seluruh isi file**, dari `BEGIN;` sampai `COMMIT;`, ke SQL Editor.
4. Klik **Run** dan pastikan tidak ada error.
5. Jalankan juga seluruh isi [20261002010000_admin_only_registration.sql](supabase/migrations/20261002010000_admin_only_registration.sql) untuk menutup pendaftaran langsung.
6. Jalankan [20261002020000_admin_directory.sql](supabase/migrations/20261002020000_admin_directory.sql) untuk pencarian, filter, pengurutan, dan pagination admin. Untuk upgrade project yang sudah berjalan, cukup jalankan migrasi yang belum diterapkan sebelum deployment kode terbaru.
7. Periksa schema `public` melalui Table Editor. Tabel berikut harus tersedia:

   - `gkl_rate_limits`
   - `gkl_session_access`
   - `gkl_admin_guard`
   - `gkl_family_data`

Migrasi juga membuat fungsi RPC dan trigger untuk akses sesi, pengelolaan admin, dan sinkronisasi keluarga. Akun pengguna disimpan oleh Supabase di `auth.users` dan dapat dilihat melalui **Authentication → Users**.

Biarkan RLS serta izin tabel sesuai migrasi. Frontend mengakses data melalui backend aplikasi. Foto disimpan dalam snapshot JSON keluarga, sehingga instalasi versi ini tidak membutuhkan bucket Supabase Storage.

SQL gabungan dapat dijalankan ulang tanpa menghapus data aplikasi. Jika project sebelumnya menggunakan dua migrasi lama atau riwayat Supabase CLI, ikuti [petunjuk migrasi project lama di README](README.md#migrasi-dari-dua-file-sql-lama).

## 4. Konfigurasi Supabase Auth

### Email dan password

Di **Authentication → Sign In / Providers**, buka pengaturan Email:

- Aktifkan login Email. Nonaktifkan **Allow new users to sign up** di pengaturan Auth; pendaftaran mandiri berjalan melalui API aplikasi, yang membuat akun langsung aktif menggunakan Admin API di server. Pengaturan ini menutup pendaftaran langsung ke Supabase agar validasi dan rate limit aplikasi tetap berlaku.
- **Confirm email** boleh tetap aktif untuk alur Auth lain. Pendaftaran melalui aplikasi membuat akun dengan `email_confirm=true`, sehingga pengguna langsung dapat login tanpa tautan konfirmasi.
- Atur minimum panjang password menjadi **12 karakter**. Aplikasi menerima password sepanjang 12–128 karakter.

Nama menu dapat berbeda mengikuti pembaruan Dashboard Supabase.

### URL lokal

Di **Authentication → URL Configuration**, isi sementara:

| Pengaturan | Nilai untuk pengujian lokal |
| --- | --- |
| Site URL | `http://localhost:5173` |
| Redirect URLs | Tambahkan `http://localhost:5173` |

Setelah deployment Vercel tersedia, Site URL akan diganti ke domain production dan domain tersebut ditambahkan ke Redirect URLs. Aplikasi mengirim origin `APP_URL` sebagai tujuan email. Lihat [konfigurasi redirect Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

### Template email wajib

Buka **Authentication → Email Templates**. Aplikasi ini memproses `TokenHash` melalui route hash khusus. Terapkan template berikut agar tautan sesuai dengan implementasi aplikasi.

**Confirm signup:**

```html
<h2>Selamat datang di Genius Kids Lab</h2>
<p><a href="{{ .RedirectTo }}/#auth-confirm/email/{{ .TokenHash }}">Konfirmasi email Anda</a></p>
```

**Reset password:**

```html
<h2>Reset password Genius Kids Lab</h2>
<p><a href="{{ .RedirectTo }}/#auth-confirm/recovery/{{ .TokenHash }}">Atur ulang password</a></p>
```

Simpan kedua template. Pertahankan variabel `{{ .RedirectTo }}` dan `{{ .TokenHash }}` persis seperti contoh; jangan menggantinya dengan nilai manual atau tautan `{{ .ConfirmationURL }}` bawaan. Pengguna akan menekan tombol konfirmasi di aplikasi sebelum token ditukarkan.

Penjelasan variabel tersedia di [dokumentasi template email Supabase](https://supabase.com/docs/guides/auth/auth-email-templates).

### SMTP untuk email sungguhan

Di pengaturan **Authentication → Email / SMTP Settings**, aktifkan **Custom SMTP**, lalu isi host, port, username, password, alamat pengirim, dan nama pengirim sesuai penyedia email. Selesaikan verifikasi domain pengirim pada penyedia tersebut.

SMTP bawaan Supabase membatasi penerima ke anggota tim project dan memiliki batas kirim yang ketat. Gunakan Custom SMTP untuk pengiriman reset password kepada pengguna. Kredensial SMTP diatur di Supabase; tidak perlu menambahkannya ke `.env` aplikasi atau Vercel. Lihat [panduan Custom SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Pembaruan dari versi yang sudah menerapkan ketiga migrasi tidak memerlukan SQL tambahan untuk pendaftaran mandiri; deploy kode terbaru dengan konfigurasi Supabase yang sama.

## 5. Buat akun administrator

Tambahkan nilai berikut ke `.env` lokal, lalu ganti contoh dengan nama, email baru, dan password unik milik Anda:

```dotenv
ADMIN_NAME="Administrator"
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD="GANTI_DENGAN_PASSWORD_UNIK_12_SAMPAI_128_KARAKTER"
```

Jalankan:

```bash
npm run admin:create
```

Jika berhasil, terminal menampilkan pesan `Administrator Supabase dibuat`. Akun dibuat dengan email terkonfirmasi dan peran `app_metadata.gkl_role=admin`.

Hapus nilai `ADMIN_PASSWORD` dari `.env` setelah selesai. Variabel `ADMIN_*` hanya digunakan untuk bootstrap lokal dan tidak perlu dipasang di Vercel. Jangan masukkan perintah `admin:create` ke Build Command karena pembuatan admin hanya perlu dilakukan sekali untuk akun tersebut.

Email yang sudah terdaftar tidak ditimpa atau otomatis dipromosikan oleh script. Gunakan email baru untuk bootstrap. Untuk akun `wahib.chelsea@gmail.com` yang sudah terdaftar, jalankan [SQL pemulihan admin](supabase/admin/restore-wahib-admin.sql), lalu keluar dan login kembali. SQL hanya mengubah role akun yang sudah terkonfirmasi; password dan jurnal tetap utuh. Buka `https://geniuskids-lab.vercel.app/#admin` untuk mengelola pengguna. Jangan menjalankan script pemulihan ini untuk instalasi milik akun lain.

## 6. Uji aplikasi di komputer

Pastikan `.env` lokal masih memakai `APP_URL=http://localhost:5173`, lalu jalankan:

```bash
npm run dev
```

Buka `http://localhost:5173`, masuk dengan akun admin, lalu buka `http://localhost:5173/#admin`. Uji **Daftar akun** dari halaman login: akun harus langsung aktif dan dapat login tanpa persetujuan admin atau email konfirmasi. Uji juga **Tambah pengguna**, penolakan akses admin bagi pengguna biasa, dan lupa password.

Untuk memeriksa hasil build lokal, hentikan server dev dengan `Ctrl+C`, lalu jalankan:

```bash
npm run build
npm start
```

## 7. Deploy ke Vercel

### Impor repository

1. Pastikan source code terbaru sudah ada di GitHub.
2. Buka Vercel, pilih **Add New → Project**, lalu impor repository proyek ini.
3. Pilih **Root Directory** yang berisi `package.json`, `vercel.json`, `api/`, dan `server/`. Jika repository membungkus proyek dalam subfolder `genius-kids-lab`, pilih subfolder tersebut.
4. Cocokkan pengaturan berikut dengan [vercel.json](vercel.json):

| Pengaturan | Nilai |
| --- | --- |
| Framework Preset | `Other` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | Versi yang didukung Vercel dan memenuhi `>=22` di `package.json` |

Vercel menjalankan backend melalui `api/index.js`. Rewrite `/api/*` sudah disediakan dalam `vercel.json`; `npm start` hanya diperlukan untuk server lokal.

Alur impor tersedia di [dokumentasi deployment Vercel](https://vercel.com/docs/deployments). Pilihan runtime dapat diperiksa di [versi Node.js Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

### Isi environment variables

Tambahkan empat variabel berikut untuk environment **Production**:

| Nama | Nilai |
| --- | --- |
| `SUPABASE_URL` | Project URL Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key project yang sama |
| `SUPABASE_SECRET_KEY` | Secret key project yang sama; pilih tipe Secret jika tersedia |
| `APP_URL` | Origin production, misalnya `https://nama-project.vercel.app` |

Masukkan nilai tanpa pembungkus tanda kutip. Jika menggunakan pasangan key legacy, gunakan nama variabel pengganti pada langkah 2. Aplikasi tidak memerlukan `DATABASE_URL`, `PORT`, `ADMIN_PASSWORD`, atau variabel SMTP di Vercel.

Untuk deployment pertama, gunakan perkiraan domain project pada `APP_URL`, lalu klik **Deploy**. Setelah selesai, periksa domain production yang benar pada **Settings → Domains**. Jika domain berbeda dari perkiraan, perbarui `APP_URL` dan lakukan **Redeploy** sebelum menguji login.

Gunakan origin lengkap dengan `https://`, tanpa path seperti `/#login`. Buka aplikasi melalui domain yang sama dengan `APP_URL`: backend menolak permintaan perubahan data dari origin lain.

Perubahan environment variables hanya berlaku pada deployment baru. Setelah mengeditnya, buka **Deployments**, pilih deployment production, lalu **Redeploy**. Lihat [environment variables Vercel](https://vercel.com/docs/environment-variables).

## 8. Hubungkan URL production ke Supabase

Misalnya domain production yang benar adalah `https://nama-project.vercel.app`:

1. Pastikan `APP_URL` di Vercel bernilai `https://nama-project.vercel.app` dan deployment sudah menggunakan nilai tersebut.
2. Buka Supabase **Authentication → URL Configuration**.
3. Ganti **Site URL** menjadi `https://nama-project.vercel.app`.
4. Tambahkan `https://nama-project.vercel.app` ke **Redirect URLs**. Pertahankan `http://localhost:5173` jika pengujian lokal masih diperlukan.
5. Simpan, lalu minta email konfirmasi atau reset yang baru untuk menguji tujuan tautan.

`.env` di komputer tetap menggunakan URL lokal. Nilai `APP_URL` di Vercel menggunakan URL production; keduanya tidak harus sama.

Jika memakai custom domain, hubungkan domain di Vercel terlebih dahulu dan tunggu HTTPS aktif. Kemudian ubah `APP_URL`, Site URL, dan Redirect URLs ke domain itu serta redeploy. Gunakan satu domain utama untuk login.

Preview Vercel membutuhkan `APP_URL` khusus yang cocok dengan domain preview, empat variabel koneksi pada environment **Preview**, serta origin preview di Redirect URLs Supabase. Jangan menyalin `APP_URL` production ke preview yang diakses melalui domain berbeda. Untuk preview berulang, gunakan domain branch yang stabil dan sebaiknya project Supabase pengujian terpisah. Penambahan wildcard di Supabase tidak mengubah pemeriksaan origin oleh backend aplikasi.

## 9. Periksa hasil deployment

- [ ] Halaman utama, gambar, dan materi eksperimen tampil.
- [ ] Dalam browser tanpa sesi, `https://DOMAIN_ANDA/api/auth/me` mengembalikan JSON `{"user":null}`, bukan halaman HTML atau 404. Ini hanya pemeriksaan awal routing, bukan bukti migrasi database lengkap.
- [ ] Admin dapat login dan membuka `/#admin`; filter peran/status, urutan daftar, pagination, dan tombol muat ulang bekerja.
- [ ] Tambah pengguna memerlukan konfirmasi password; penghapusan memerlukan pengetikan email. Akun sendiri/admin aktif terakhir tetap dilindungi.
- [ ] Pengguna dapat mendaftar melalui **Daftar akun** (`/#register`) dan langsung login sebagai pengguna biasa. Email duplikat ditolak. Admin tetap dapat memakai **Tambah pengguna**; pendaftaran langsung ke Supabase tetap ditolak.
- [ ] Alur lupa password mengirim email ke domain production dan password baru dapat digunakan.
- [ ] Pengguna biasa tidak dapat membuka fungsi admin.
- [ ] Profil anak, progres, jurnal, dan foto tersinkron ketika login dengan akun yang sama pada perangkat kedua.
- [ ] Logout dan login ulang berfungsi; cookie autentikasi memiliki `HttpOnly` dan `Secure` pada HTTPS.
- [ ] Tidak ada error terkait konfigurasi atau Supabase di log function Vercel.

Pengujian otomatis tambahan tersedia dalam [TESTING.md](TESTING.md). Tes lokal memakai Supabase tiruan; pengiriman email dan integrasi live harus diperiksa pada deployment sungguhan.

## 10. Mengatasi masalah umum

| Masalah | Yang perlu diperiksa |
| --- | --- |
| Build gagal atau `package.json` tidak ditemukan | Root Directory, source code yang diunggah, `package-lock.json`, versi Node.js, dan build logs Vercel. |
| Halaman tampil tetapi `/api/auth/me` menghasilkan 404/HTML | Pastikan `api/`, `server/`, dan `vercel.json` ikut di-deploy dari root yang benar; deployment bukan hanya upload `dist`. |
| `Konfigurasi Supabase belum lengkap` / `Server belum dikonfigurasi` | Nama dan nilai empat environment variables, cakupan Production/Preview, lalu redeploy. |
| `Konfigurasi SUPABASE_URL ...` / `Konfigurasi APP_URL ...` / key `belum diisi` | Isi variabel yang disebutkan. URL harus berupa origin lengkap (`https://PROJECT.supabase.co` atau domain aplikasi), tanpa path, query, atau hash. Spasi luar dan tanda kutip pembungkus kini dibersihkan otomatis. Restart server lokal atau redeploy Vercel setelah perubahan. |
| `Layanan belum tersedia. Periksa konfigurasi Supabase atau coba lagi nanti.` | Pesan umum untuk exception backend. Perbarui kode agar kesalahan format URL ditampilkan secara spesifik. Jika masih muncul, periksa log function; pesan ini saja belum menentukan penyebabnya. |
| `Asal permintaan tidak diizinkan` | Origin tab browser harus sama dengan `APP_URL`, termasuk protokol dan port. Pastikan membuka domain utama, bukan URL deployment lain. |
| `Layanan Supabase belum tersedia` | Status project, kecocokan URL/key, seluruh migrasi SQL, dan log function Vercel. Pesan ini juga bisa menutupi error RPC/database. |
| Pembuatan akun oleh admin atau login gagal setelah database baru dibuat | Jalankan seluruh migrasi dan pastikan fungsi RPC serta trigger berhasil dibuat. |
| Email tidak terkirim / alamat tidak diizinkan | Custom SMTP, verifikasi pengirim, pembatasan penerima SMTP bawaan, folder spam, serta log Auth Supabase. |
| Tautan email menuju localhost/domain yang salah | `APP_URL` pada environment terkait, Site URL, Redirect URLs, dan variabel `RedirectTo` dalam template. Setelah perbaikan, minta email baru. |
| Tautan konfirmasi/reset tidak valid | Pastikan kedua template sesuai langkah 4; gunakan email terbaru dan token yang belum dipakai atau kedaluwarsa. |
| Email admin sudah digunakan | Script tidak menimpa akun lama. Gunakan email baru untuk bootstrap admin. |
| `Pembaruan database admin belum diterapkan` | Jalankan `supabase/migrations/20261002020000_admin_directory.sql` di SQL Editor project yang digunakan Vercel, lalu muat ulang halaman admin. |
| Login berhasil tetapi menu Admin tidak muncul | Role harus berada di `app_metadata.gkl_role=admin`, bukan `user_metadata` atau environment `ADMIN_EMAIL`. Untuk akun yang sudah ada, jalankan SQL pemulihan admin lalu keluar/login kembali. |
| Login lokal tidak bertahan | Gunakan `APP_URL=http://localhost:5173` untuk lokal; jangan mengaktifkan `NODE_ENV=production` atau variabel `VERCEL` pada HTTP lokal. |
| `Terlalu banyak percobaan` | Tunggu sebelum mencoba lagi dan periksa rate limit Auth Supabase. Aplikasi juga membatasi percobaan melalui database. |

## 11. Memperbarui aplikasi

Untuk source code, push perubahan ke branch production yang terhubung dengan Vercel agar deployment baru dibuat. Untuk perubahan environment variables, lakukan redeploy. Migrasi SQL baru harus diterapkan ke Supabase sesuai petunjuk rilis; proses build Vercel tidak menjalankan SQL atau membuat admin secara otomatis.
