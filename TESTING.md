# Verifikasi Supabase — versi 2.2

Cakupan pengujian otomatis:

Verifikasi pendaftaran mandiri pada 5 Oktober 2026: **34 tes API/SQL/unit lulus**, **7 alur browser lulus**, dan **build berhasil**. Browser memakai Chromium lokal melalui `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Tampilan pendaftaran 390 px diperiksa tanpa overflow. Pengujian menggunakan Supabase tiruan, bukan project production.

- `npm test`: pengujian API melalui **SDK Supabase asli**, layanan HTTP Auth/REST tiruan, dan migrasi SQL di PGlite.
- `npm run test:ui`: alur browser Chromium dengan server Supabase tiruan.
- `npm run build`: frontend, font, dan aset berada di `dist`; SDK server, secret, migrasi, serta test tidak disalin ke direktori publik.

## Cakupan API/SQL

Tes mencakup validasi/CSRF, cookie HttpOnly/Secure, pendaftaran mandiri dengan akun langsung aktif, penolakan email duplikat tanpa mengubah akun lama, pembatasan percobaan pendaftaran per IP/email, dan pembuatan akun oleh admin, normalisasi email, penolakan eskalasi peran dari metadata pengguna, proteksi admin, pencarian literal, CRUD/status/peran, larangan perubahan destruktif akun sendiri, proteksi admin terakhir di SQL, konfirmasi dan recovery OTP sekali pakai, token kedaluwarsa, refresh sesi, pencabutan izin sesi saat password/status berubah, logout, rate limit, penolakan akses RPC/tabel internal bagi role anon/authenticated, serta penanganan kegagalan koneksi Supabase.

Sinkronisasi diuji untuk privasi per akun, kecocokan header pemilik/sesi, revisi atomik, retry idempoten, penolakan revisi usang, cascade saat akun dihapus, antrean offline setelah reload, edit saat upload masih berjalan, konflik antar-tab, refresh tanpa menimpa form, validasi foto/ukuran, migrasi data lokal lama, dan jurnal Unicode yang terpecah antar-chunk HTTP.

Migrasi pembatasan pendaftaran diuji untuk penolakan insert akun tanpa metadata server, termasuk metadata pengguna yang memalsukan role. SQL pemulihan akun owner diuji agar hanya mempromosikan akun tujuan, mempertahankan password/jurnal/metadata lain, mencabut sesi lama, dan aman dijalankan ulang.

Migrasi gabungan juga dijalankan ulang pada database berisi akun, sesi, rate limit, dan snapshot keluarga untuk memastikan data serta izin sesi tetap utuh.

## Cakupan browser

- Petunjuk password, tombol lihat/sembunyikan terpisah untuk password dan konfirmasi, serta indikator Caps Lock.
- Email dari login gagal terbawa ke lupa password; kegagalan jaringan dapat dicoba ulang, panduan email tampil setelah sukses, dan tautan bisa diminta ulang.
- Pendaftaran mandiri di ponsel: konfirmasi password, retry setelah error jaringan, email duplikat, pesan sukses dan email terisi di login, lalu masuk tanpa persetujuan admin/email konfirmasi. Login akun yang disediakan admin tetap diuji.
- Pencatatan jurnal, logout, dan pemisahan jurnal dua akun di browser yang sama.
- Lupa password → email tiruan → konfirmasi tautan → password baru → login ulang; jurnal tetap tersedia.
- Penolakan admin bagi pengguna biasa, pembuatan/pencarian/edit/penonaktifan/penghapusan pengguna.
- Filter peran/status, urutan nama, reset filter, retry setelah error jaringan, konfirmasi password, email duplikat, dan pengetikan email sebelum hapus.
- SQL direktori admin diuji dengan 25 akun: filter sebelum pagination, statistik global, urutan stabil, batas halaman, pencarian literal, serta penolakan RPC bagi anon/authenticated.
- Login ponsel 390 px dan admin 360 px tanpa overflow halaman; tombol tambah pengguna tetap tampil.
- Dua konteks browser terpisah: nama/usia profil, status misi selesai, jurnal, dan foto muncul pada perangkat kedua; draf offline bertahan ketika perangkat pertama membuat perubahan berbeda.
- Dialog konflik menyediakan unduhan kedua versi; pemilihan versi lokal tersimpan ke cloud dan dapat dibaca lagi dari perangkat pertama.
- Tidak ada error JavaScript pada alur akun, admin, dan sinkronisasi.
- Screenshot dialog konflik diperiksa secara visual.

## Jalankan ulang

```bash
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Node.js 22+ dan izin membuka port localhost diperlukan. Browser memakai port 5179. Jika Chromium sudah tersedia, gunakan `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome npm run test:ui`. Tidak memerlukan `.env` atau kredensial production.

## Batas pengujian

Fixture menirukan kontrak HTTP Auth/REST untuk menguji SDK, API, UI, dan SQL. Fixture bukan server Supabase/GoTrue sungguhan. Pengujian ini tidak membuktikan pengiriman email, konfigurasi URL/template, kebijakan password Supabase, perilaku refresh multi-tab serentak, atau konkurensi multi-instance pada layanan live.

Project URL dan key Supabase belum tersedia, sehingga koneksi project live dan deployment Vercel belum diuji. Setelah konfigurasi:

1. Jalankan migrasi gabungan `supabase/migrations/20261002000000_init.sql` (Auth, admin, dan family sync) di project Supabase; jalankan juga migrasi `20261002010000_admin_only_registration.sql`, jalankan migrasi `20261002020000_admin_directory.sql`, nonaktifkan **Allow new users to sign up**, lalu pastikan pendaftaran mandiri menghasilkan akun aktif berperan user, pembuatan akun oleh admin/login berjalan dan user biasa tidak bisa mengakses RPC internal/admin.
2. Terapkan email templates dari README, Site URL, Redirect URLs, minimum password 12 karakter, dan Custom SMTP Supabase.
3. Uji email konfirmasi/reset nyata, termasuk tautan yang sudah dipakai dan kedaluwarsa, lalu uji refresh setelah masa berlaku JWT.
4. Uji pencabutan akses dari browser kedua setelah perubahan password/peran/status; jangan memakai Supabase secret di frontend.
5. Verifikasi routing Vercel, cookie Secure pada HTTPS, dan pengecualian API dari cache service worker.
6. Uji sinkronisasi pada dua perangkat sungguhan dan konflik dengan salah satu perangkat offline.
7. Uji PWA, Chrome Android/Safari iPhone, backup/impor jurnal, profil anak, foto, serta sertifikat.

Implementasi PostgreSQL/SMTP langsung sebelumnya telah diganti; hasil pengujian versi tersebut tidak dipakai sebagai bukti integrasi Supabase live.
