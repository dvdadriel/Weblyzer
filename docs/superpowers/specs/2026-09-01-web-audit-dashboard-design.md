# Web Audit Dashboard — Design Spec

**Tanggal:** 2026-09-01
**Status:** Disetujui, siap masuk fase perencanaan implementasi

## 1. Tujuan

Aplikasi web untuk memantau situs-situs milik sendiri dari empat sudut: bug fungsional,
error/warning browser, keamanan pasif, SEO, dan skor Lighthouse. Scan berjalan otomatis
tiap tengah malam, bisa juga dipicu manual — per situs, per kategori, atau per satu temuan
saja untuk memverifikasi perbaikan.

Aplikasi hanya melaporkan. Perbaikan dilakukan sendiri oleh pengguna di luar aplikasi.

## 2. Ruang lingkup

**Termasuk:**
- Multi-situs (target: 5–20 situs, hingga 200 halaman per situs)
- 6 jenis scan: crawl, bugs, console, security, lighthouse, seo
- Pelacakan siklus hidup temuan (open → fixed / ignored) lintas run
- Export Excel
- Penjadwalan tengah malam + trigger manual
- Notifikasi email saat scan terjadwal gagal atau menemukan masalah kritis baru
- Halaman konfigurasi model AI, jadwal, dan SMTP
- Single-user, tanpa autentikasi, berjalan di mesin sendiri

**Tidak termasuk (sengaja):**
- Autentikasi / multi-user — tambahkan saat benar-benar ada pengguna kedua
- Perbaikan otomatis atau pembuatan PR
- Pemindaian keamanan aktif (injeksi payload) — hanya pemeriksaan pasif
- Deploy cloud — Docker disiapkan, tapi target awal adalah mesin lokal

## 3. Keputusan arsitektur

### 3.1 Prinsip utama

**LLM tidak pernah menelusuri situs.** Penelusuran dilakukan Playwright, Lighthouse, dan
`fetch` — deterministik, nol token, hasil yang bisa diverifikasi. LLM hanya menerima JSON
temuan yang sudah ringkas, lalu mengelompokkan, memprioritaskan, dan menjelaskan cara
memperbaikinya.

Konsekuensinya: skor Lighthouse itu skor sungguhan, bukan tebakan model; biaya token
tinggal sebagian kecil dari pendekatan "suruh agent membaca HTML".

Pengecualian: tab SEO memang membutuhkan penalaran LLM sungguhan dan didelegasikan ke
plugin `claude-seo` yang sudah terpasang.

### 3.2 Tumpukan teknologi

| Bagian | Pilihan | Alasan |
|---|---|---|
| App | Next.js (App Router) | UI + API + job runner dalam satu proses, satu `npm start`, satu Dockerfile |
| Database | SQLite via **`node:sqlite` bawaan Node** | Satu penulis, satu mesin. Satu file, backup-nya `cp`. Nol dependensi native — Node 26 sudah menyertakan SQLite (WAL, prepared statement, RETURNING semuanya tersedia) |
| Crawl & bug | Playwright | Sudah menjalankan Chromium sungguhan; menangkap console, network, dan DOM sekaligus |
| Lighthouse | paket npm `lighthouse` | Deterministik, tidak butuh LLM |
| SEO | plugin `claude-seo` via CLI | Sudah terpasang dan terbukti (lihat `springair.co.id-audit/`) |
| AI | `spawn('claude'\|'gemini', ['-p', ...])` | Memakai langganan yang sudah ada — nol biaya API |
| Export | `exceljs` | |
| Scheduler | `node-cron` in-process | Tidak butuh cron sistem; jalur kode sama dengan trigger manual |
| Antrian | Tabel `jobs` di SQLite | Tidak butuh Redis untuk beban sebesar ini |

### 3.3 Diagram

```
Browser ──► Next.js (UI + API routes)
                 │
                 ├── SQLite (data.db) — satu-satunya state
                 │
                 └── Job Runner (in-process, antrian di SQLite, paralel default 3)
                          │
       ┌──────────┬───────┴──────┬───────────┬──────────┐
       ▼          ▼              ▼           ▼          ▼
    crawl       bugs          console    security   lighthouse    seo
  Playwright  Playwright    Playwright  fetch+parse   npm lh    claude CLI
                          │
                          └──► ai.ts: JSON ringkas ──► spawn claude/gemini ──► laporan
```

### 3.4 Alternatif yang ditolak

- **UI + worker terpisah dengan antrian Redis** — dua service plus Redis untuk beban yang
  belum ada. Pisahkan nanti jika scan mengganggu responsivitas UI; `lib/queue.ts` sudah
  jadi modul tersendiri sehingga pemisahannya kecil.
- **Express + HTMX** — lebih ringan dan tanpa build step, tapi tabel temuan dengan filter,
  sort, dan baris yang bisa dibuka akan jauh lebih manual.
- **Postgres** — satu container lagi, satu backup lagi, satu titik gagal lagi, tanpa
  manfaat pada skala single-user.
- **Skill Claude Code untuk bugs/console/security** — pekerjaan itu deterministik, bukan
  pekerjaan LLM. Skill adalah instruksi untuk Claude Code, bukan komponen aplikasi.
  Yang dibutuhkan hanya file prompt `.md` untuk langkah peringkasan.
- **API key (SDK Anthropic/Google)** — ditunda. Jalur mundur bila login CLI di server
  ternyata mengganggu. Biayanya kecil karena LLM hanya meringkas JSON.

## 4. Scanner

Semua scanner mengembalikan array temuan dengan bentuk seragam, sehingga satu tabel
`findings` melayani semuanya.

| Scanner | Alat | Yang dideteksi |
|---|---|---|
| `crawl` | Playwright | Daftar URL dari sitemap + penelusuran link, status code, rantai redirect, waktu muat. Menjadi input scanner lain. |
| `bugs` | Playwright | 404/500, link internal & eksternal mati, gambar rusak, halaman kosong/blank, form tanpa action, redirect loop, halaman yatim |
| `console` | Playwright | `console.error`, `console.warn`, uncaught exception, promise rejection, request jaringan gagal, resource terblokir |
| `security` | fetch + parse | Header keamanan hilang (CSP, HSTS, X-Frame-Options, X-Content-Type-Options), cookie tanpa Secure/HttpOnly/SameSite, mixed content, file sensitif yang publik (`.env`, `.git/`, backup, listing direktori), library JS versi rentan, form tanpa token CSRF, sertifikat TLS hampir kedaluwarsa |
| `lighthouse` | npm `lighthouse` | 4 skor (performance, accessibility, best-practices, SEO) untuk mobile & desktop, plus daftar audit yang gagal |
| `seo` | `claude -p "/seo-audit <url>"` | Analisis SEO penuh via plugin `claude-seo` |

**Keamanan bersifat pasif saja.** Tanpa injeksi payload, tanpa fuzzing, tanpa brute force —
target adalah situs produksi milik sendiri dan pengujian aktif berisiko merusak data nyata.

### 4.1 Anggaran Lighthouse

Lighthouse menjalankan Chromium sungguhan, ±20 detik per halaman per strategi. Secara
serial, 4000 halaman berarti ~22 jam (mobile saja) atau ~44 jam (mobile+desktop) — tidak
muat dalam jendela semalam.

Solusinya paralelisme, bukan pemangkasan wajib. Dengan 6 worker, mobile saja, 4000 halaman
selesai dalam **~3,7 jam** — muat di 00:00–04:00. Biayanya RAM: tiap Chrome headless
±400–600MB, jadi 6 worker ≈ 3,5GB.

Karena itu cakupan menjadi **setelan per situs**, bukan keputusan permanen:

```sql
sites.lighthouse_mode      -- 'sample' (default) | 'full'
sites.lighthouse_strategy  -- 'mobile' (default) | 'both'
config.lighthouse_workers  -- default 6
```

Mode `sample`: homepage + hingga 10 halaman yang di-pin (`pages.is_pinned`) + satu halaman
sampel per pola URL yang terdeteksi (halaman dengan bentuk path sama dibangun dari template
sama, sehingga skornya nyaris identik). Hasilnya ~15–25 halaman per situs, ±8 menit.

Mode `full`: seluruh halaman hasil crawl. Mekanismenya identik — `full` hanya berarti
daftar halaman tidak difilter. Bukan jalur kode terpisah.

Halaman mana pun tetap dapat dijalankan sesuai permintaan lewat tombol per-halaman.

**Kompensasi untuk mode `sample`:** scanner `crawl` mengukur waktu muat *semua* halaman
(murah). Halaman yang waktu muatnya menyimpang jauh dari halaman sepola dilaporkan sebagai
temuan, sehingga anomali tetap terlihat dan dapat di-pin.

**Jalur mundur bila paralel lokal terlalu berat:** PageSpeed Insights API — gratis, kuota
25.000 query/hari, komputasi di server Google. ~1–2 jam untuk 4000 halaman dengan CPU lokal
nyaris nol; syaratnya situs dapat diakses publik. Tidak dibangun sekarang; ditambahkan
hanya jika paralel lokal terbukti tidak memadai.

## 5. Model data

```sql
sites      id, name, base_url, sitemap_url, max_pages, enabled, created_at,
           lighthouse_mode, lighthouse_strategy

runs       id, site_id, type, status, started_at, finished_at, error,
           ai_status, ai_error, ai_model
           -- type:      crawl|bugs|console|security|lighthouse|seo|full
           -- status:    queued|running|done|failed|cancelled
           -- ai_status: ok|failed|skipped|not_needed

pages      id, site_id, url, status_code, last_seen_at, is_pinned

findings   id, site_id, page_id, category, severity, rule, title,
           detail_json, fingerprint, status, first_seen_run, last_seen_run
           -- UNIQUE(site_id, fingerprint)
           -- category: bugs|console|security|seo|lighthouse
           -- severity: critical|high|medium|low|info
           -- status:   open|fixed|ignored
           -- Temuan adalah entitas milik situs yang hidup lintas run, bukan milik satu
           -- run. Karena itu tidak ada kolom run_id; riwayatnya diwakili first_seen_run
           -- dan last_seen_run. Ini yang membuat rekonsiliasi menjadi upsert sederhana.

lighthouse id, run_id, page_id, strategy, perf, a11y, best_practices, seo, raw_json
           -- strategy: mobile|desktop
           -- skor tinggal di sini; audit Lighthouse yang gagal juga ditulis ke
           -- `findings` dengan category='lighthouse' agar ikut siklus fixed/ignored

reports    id, run_id, format, content, model_used, tokens_est

config     key, value    -- model AI, jadwal, batas paralel

jobs       id, run_id, type, payload_json, status, attempts, created_at, started_at
```

### 5.1 Fingerprint — mekanisme inti

`fingerprint = hash(url + rule + field detail yang menentukan identitas)`.

Ini yang membuat verifikasi perbaikan bekerja tanpa pencatatan manual:

- Fingerprint muncul lagi di run berikutnya → masih rusak, `last_seen_run` diperbarui
- Fingerprint tidak muncul → otomatis ditandai `fixed`
- Fingerprint baru → temuan baru, `first_seen_run` dicatat
- `ignored` bersifat lengket: temuan yang diabaikan tidak pernah kembali menjadi `open`

Dari sini muncul riwayat ("12 bug diperbaiki minggu ini") tanpa kerja tambahan.

### 5.2 Penyimpanan Lighthouse

Laporan Lighthouse mentah berukuran ~500KB. Yang disimpan permanen hanya versi ringkas:
skor plus audit yang gagal. JSON penuh hanya disimpan untuk run terakhir per halaman,
selebihnya dibuang saat run baru menggantikannya.

## 6. UI

### 6.1 Struktur folder

Komponen yang hanya dipakai satu halaman diletakkan di folder halaman itu. Komponen
dipindahkan ke `components/` hanya setelah halaman kedua benar-benar membutuhkannya —
tidak ada promosi "untuk jaga-jaga".

```
app/
  layout.tsx                    shell + sidebar daftar situs
  page.tsx                      dashboard: kartu per situs, skor terakhir, temuan terbuka

  sites/
    page.tsx                    kelola situs
    SiteForm.tsx
    SiteTable.tsx

  sites/[siteId]/
    layout.tsx                  header situs + navigasi tab
    page.tsx                    ringkasan situs
    RunButton.tsx

    bugs/       page.tsx, BugTable.tsx, BugRow.tsx, RecheckButton.tsx
    console/    page.tsx, ConsoleTable.tsx
    security/   page.tsx, SecurityTable.tsx
    seo/        page.tsx, SeoReport.tsx
    lighthouse/ page.tsx, ScoreGrid.tsx, PageScoreRow.tsx
    runs/       page.tsx, [runId]/page.tsx

  config/
    page.tsx                    model AI, jadwal, batas paralel, SMTP
    ModelForm.tsx
    NotifyForm.tsx

  api/
    sites/route.ts
    runs/route.ts               POST mulai scan, GET status
    runs/[id]/route.ts          GET detail, DELETE batalkan
    findings/[id]/route.ts      PATCH status, POST recheck
    export/route.ts             GET .xlsx

components/                     hanya yang dipakai >= 2 halaman
  ui/                           Button, Table, Badge, Dialog
  SeverityBadge.tsx
  RunStatus.tsx
  EmptyState.tsx

lib/
  db.ts                         better-sqlite3 + migrasi
  queue.ts                      antrian job berbasis SQLite
  scanners/                     crawl.ts bugs.ts console.ts security.ts
                                lighthouse.ts seo.ts
  ai.ts                         spawn claude/gemini
  export.ts                     exceljs
  notify.ts                     nodemailer
  scheduler.ts                  node-cron
  theme.ts                      token warna & tipografi (vintage terminal)

prompts/                        bugs.md console.md security.md
data.db
```

Tab hidup di `sites/[siteId]/layout.tsx` sehingga menjadi URL sungguhan
(`/sites/3/bugs`) — bisa di-bookmark, tombol back berfungsi, refresh tidak melempar
kembali ke tab pertama. Tanpa state tab sama sekali.

### 6.2 Alur setiap tab

Keempat tab temuan memakai pola identik:

1. Tombol **[Scan]** dan **[Scan halaman tertentu…]**
2. Tabel temuan, bisa difilter menurut severity dan status
3. Klik baris → detail beserta saran perbaikan dari AI
4. Aksi per baris: **Recheck** (jalankan ulang satu aturan untuk satu URL) dan **Ignore**
5. Tombol **Export Excel**

Tab Lighthouse berbeda: menampilkan grid skor per halaman, bukan tabel temuan.

### 6.3 Arah visual — Vintage Terminal

Proyek ini juga menjadi karya portfolio, sehingga tampilannya tidak boleh terbaca sebagai
dashboard template. Arah yang dipilih: **vintage terminal** — monospace, border bergaya
ASCII, palet earth-tone 70-an di atas latar cream.

Pilihan ini bukan sekadar gaya: monospace membuat angka rata otomatis per kolom, yang
justru menguntungkan tabel skor Lighthouse dan hitungan temuan.

**Palet dasar** (colorhunt `1d4533-f7eae0-f9d2ba-5e3122`):

```
#F7EAE0  cream       latar utama
#1D4533  hijau tua   teks utama, garis, chrome
#5E3122  cokelat tua teks sekunder, penekanan
#F9D2BA  peach       permukaan terangkat, baris ter-highlight
```

**Perluasan semantik.** Empat warna dasar tidak menyediakan urutan severity yang dapat
dibedakan sekilas — dan itu justru pekerjaan utama layar ini. Palet diperluas ke tetangga
retro yang selaras, bukan merah/kuning/hijau generik:

```
critical  #A63A24  rust
high      #C77B3C  amber terbakar
medium    #B8A032  mustard
low       #6B7F4E  olive
fixed     #1D4533  hijau tua (dari palet dasar)
ignored   #9B8579  taupe redup
```

Semua wajib lolos kontras WCAG AA di atas cream. Aksesibilitas tidak dikompromikan demi
gaya. Severity juga **tidak boleh dibedakan warna saja** — dipasangkan dengan penanda
tekstual (`[!!]`, `[! ]`, `[ok]`) agar tetap terbaca oleh pengguna buta warna dan tetap
jelas saat di-print atau di-screenshot hitam-putih.

**Aturan pelaksanaan:**

- Monospace berkualitas dengan x-height tinggi (mis. JetBrains Mono / IBM Plex Mono)
- Border bergaya ASCII dipakai **struktural** — memisahkan wilayah nyata — bukan hiasan
- **Tanpa** efek scanline/CRT sungguhan: menurunkan kontras dan merusak keterbacaan
- Satu aksen bergerak saja (kursor underscore berkedip pada status scan berjalan),
  dihormati `prefers-reduced-motion`
- Panjang baris dibatasi agar teks mono tetap nyaman dibaca

Fase implementasi UI **wajib** melewati skill `impeccable` dan `frontend-design`, dengan
arah di atas sebagai titik awal, bukan sebagai eksplorasi terbuka.

Prioritas tetap: kepadatan data tinggi dan status yang mudah dipindai — layar ini dibuka
untuk menjawab satu pertanyaan, "apa yang rusak sekarang".

## 7. Eksekusi job

- Antrian ada di tabel `jobs`. Runner mengambil pekerjaan `queued` tiap beberapa detik.
- Paralelisme dibatasi, default 3, dapat diatur di `config`.
- Restart aplikasi: job `running` ditandai `failed` dengan alasan "interrupted" dan dapat
  dijalankan ulang. Tidak ada yang hilang diam-diam.
- Scan terjadwal (`node-cron`, 00:00) dan trigger manual memasukkan job yang **identik**.
  Tidak ada jalur kode terpisah untuk mode terjadwal.
- Trigger tersedia pada tiga tingkat: seluruh situs (`full`), satu kategori, atau satu
  temuan (recheck).

## 8. Konfigurasi model AI

Model bukan abstraksi provider — cukup entri perintah:

```json
{ "claude": { "cmd": "claude",  "args": ["-p"] },
  "gemini": { "cmd": "gemini",  "args": ["-p"] } }
```

Halaman config memilih model aktif, mengatur jadwal, dan batas paralel. Menambah CLI baru
berarti menambah satu baris, bukan satu adapter.

## 9. Deploy

Target awal: **mesin sendiri**, dijalankan lewat Docker sehingga pemindahan ke server
nanti hanya `docker run`. Volume yang dipersistenkan: `data.db` dan direktori kredensial
CLI.

Vercel/Netlify tidak dapat dipakai — timeout serverless, disk non-persisten, tidak ada
Chrome. Jika kelak butuh jalan 24/7, Oracle Cloud Always Free (4 core ARM, 24GB RAM)
mencukupi dan gratis permanen.

**Friksi yang diketahui:** `claude` dan `gemini` CLI memerlukan login interaktif satu
kali. Di server headless dilakukan lewat SSH (`claude setup-token`), token tersimpan di
volume. Jika ini terlalu mengganggu, jalur mundurnya adalah API key khusus untuk langkah
peringkasan AI.

## 10. Penanganan error

- Kegagalan scanner bersifat lokal: satu halaman yang gagal dicatat sebagai temuan
  `severity: info, rule: scan-error` dan scan lanjut ke halaman berikutnya.
- Kegagalan CLI AI (timeout, tidak terautentikasi, kuota habis, keluar dengan error)
  menandai run sebagai `done` dengan `ai_status = 'failed'`. Temuan deterministik tetap
  tersimpan lengkap — kebenaran ada di data deterministik, dan lapisan kenyamanan di
  atasnya tidak boleh punya kuasa membatalkan fakta.

  Kegagalan AI **wajib terlihat tanpa perlu membuka tab terkait**, muncul di tiga tempat:

  1. **Dashboard** — kartu situs menampilkan lencana ⚠ bila run terakhir `ai_status = failed`
  2. **Riwayat run** — status dibedakan: "Selesai" vs "Selesai (AI gagal)"
  3. **Detail run** — `ai_error` ditampilkan mentah, tanpa disaring. Pesan asli CLI
     ("credit balance too low", "not authenticated") jauh lebih berguna daripada
     "terjadi kesalahan"

  Disertai tombol **[Jalankan ulang ringkasan AI]** yang hanya mengulang langkah AI atas
  data yang sudah tersimpan — tanpa scan ulang.

  `skipped` bila ringkasan AI dimatikan di config; `not_needed` untuk run yang memang tidak
  melibatkan AI (mis. `crawl` saja), agar tidak terbaca sebagai kegagalan.

### 10.1 Notifikasi email

Scan terjadwal berjalan saat tidak ada yang menonton, jadi kegagalannya harus sampai ke
luar aplikasi.

Dikirim lewat `nodemailer` + SMTP (kredensial di `config`, bukan di kode). Dipicu **hanya
oleh run terjadwal**, tidak oleh trigger manual — saat memicu manual kamu sudah melihat
layarnya.

Satu email ringkasan per situs per scan tengah malam, dikirim bila salah satu terjadi:

- Run `failed` (situs tidak terjangkau, scanner crash)
- `ai_status = 'failed'`
- Ada temuan `critical` baru (fingerprint yang belum pernah terlihat)

Isi email: nama situs, status run, jumlah temuan baru per severity, daftar temuan
`critical` baru, pesan `ai_error` bila ada, dan tautan langsung ke halaman detail run.
Teks biasa dengan HTML sederhana — bukan template pemasaran.

Bila semua bersih dan tidak ada yang baru, **tidak ada email**. Notifikasi yang selalu
datang akan berhenti dibaca.

Kegagalan pengiriman email dicatat sebagai peringatan dan tidak pernah menggagalkan run.
- Situs yang tidak dapat dijangkau menghentikan run lebih awal dengan status `failed` dan
  pesan yang jelas — bukan 200 kegagalan per halaman.
- Timeout jaringan dan batas ukuran halaman ditetapkan agar satu halaman rusak tidak
  menggantung antrian.

## 11. Strategi pengujian

- **Scanner** — dites terhadap fixture HTML lokal yang disajikan dari disk, bukan situs
  live. Tiap aturan punya satu fixture positif dan satu negatif.
- **Fingerprint** — tes utama: dua run atas fixture yang sama menghasilkan fingerprint
  identik; temuan yang diperbaiki berpindah ke `fixed`; temuan `ignored` tidak pernah
  kembali `open`.
- **Antrian** — job yang terputus dapat dijalankan ulang; batas paralel dipatuhi.
- **Export** — file xlsx yang dihasilkan dapat dibuka kembali dan berisi jumlah baris yang
  benar.
- **AI** — CLI di-mock. Yang diuji adalah pembentukan prompt dan penguraian hasil, bukan
  keluaran model.

Tanpa E2E terhadap situs eksternal: lambat, rapuh, dan bergantung pada pihak ketiga.

## 12. Fase implementasi

Pembagian kerja fase implementasi akan dikoordinasikan dengan `ruflo` untuk memecah
pekerjaan yang independen menjadi task paralel.

1. **Fondasi** — Next.js, skema SQLite + migrasi, antrian, manajemen situs
2. **Scanner deterministik** — crawl, bugs, console, security (+ fixture pengujian)
3. **Lighthouse** — runner, penganggaran halaman, penyimpanan skor
4. **Lapisan AI** — spawn CLI, file prompt, peringkasan, konfigurasi model
5. **SEO** — integrasi plugin `claude-seo`
6. **UI** — tema vintage terminal via `impeccable` + `frontend-design`
7. **Export, scheduler, notifikasi email, Docker**

Fase 2–5 sebagian besar independen dan cocok dikerjakan paralel.
```
