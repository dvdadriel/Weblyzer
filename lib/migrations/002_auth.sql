-- Weblyzer berhenti menjadi alat satu orang di satu mesin.
--
-- Spec 2026-09-01 menyatakan dengan sengaja "single-user, tanpa autentikasi"
-- dan "autentikasi/multi-user — tambahkan saat benar-benar ada pengguna
-- kedua". Ini saat itu.
--
-- ============================================================================
-- KENAPA `sites` DIBANGUN ULANG, BUKAN DI-ALTER
-- ============================================================================
-- `base_url` punya `UNIQUE` global dari 001_init.sql. Di multi-user itu
-- menolak user kedua yang memantau situs yang sama, dengan galat SQLite yang
-- terbaca seperti kerusakan. SQLite tidak bisa membuang constraint lewat
-- ALTER TABLE, jadi satu-satunya jalan adalah bangun-copy-drop-rename.
--
-- `foreign_keys` DIMATIKAN sepanjang rebuild. Tanpa itu `DROP TABLE sites`
-- meng-CASCADE ke `runs`, `pages`, dan `findings` — dan menghapus seluruh
-- riwayat open/fixed yang justru menjadi inti alat ini. Itu satu baris yang
-- membedakan migrasi dari kehilangan data permanen.
--
-- PRAGMA foreign_keys adalah no-op di dalam transaksi, jadi migrasi ini keluar
-- dari transaksi milik `lib/db.ts` (COMMIT di baris pertama), mengurus
-- transaksinya sendiri, lalu membuka transaksi baru di akhir supaya COMMIT
-- milik `db.ts` punya pasangan. `db.ts` sudah menangani pola ini — lihat
-- komentar ROLLBACK di sana — dan ia juga menjalankan `foreign_key_check`
-- setelah setiap migrasi, yang menangkap referensi menggantung andai rebuild
-- ini salah.
COMMIT;

PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  -- NULL berarti akun ini hanya bisa masuk lewat OAuth. Halaman masuk
  -- mengatakan itu apa adanya alih-alih menolak passwordnya sebagai "salah",
  -- yang akan jadi jalan buntu tanpa ujung bagi orangnya.
  password_hash TEXT,
  role          TEXT    NOT NULL DEFAULT 'user',
  -- locale dan theme sudah ada di sini walau dipakai fase 2 dan 3. Satu
  -- migrasi untuk satu perubahan skema lebih murah daripada tiga.
  locale        TEXT    NOT NULL DEFAULT 'id',
  theme         TEXT    NOT NULL DEFAULT 'system',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (role IN ('user', 'admin')),
  CHECK (locale IN ('id', 'en')),
  CHECK (theme IN ('system', 'light', 'dark'))
);

CREATE TABLE oauth_akun (
  provider         TEXT    NOT NULL,
  provider_user_id TEXT    NOT NULL,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (provider, provider_user_id)
);

CREATE TABLE ai_kunci (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT    NOT NULL DEFAULT 'anthropic',
  model            TEXT    NOT NULL,
  ciphertext       BLOB    NOT NULL,
  iv               BLOB    NOT NULL,
  tag              BLOB    NOT NULL,
  -- NULL = belum lolos validasi. Gerbang "harus konfigurasikan AI modelnya
  -- dulu, sudah oke baru bisa gunakan" adalah tepat satu pemeriksaan atas
  -- kolom ini.
  terverifikasi_at TEXT
);

CREATE TABLE sites_baru (
  id                  INTEGER PRIMARY KEY,
  name                TEXT    NOT NULL,
  base_url            TEXT    NOT NULL,
  sitemap_url         TEXT,
  max_pages           INTEGER NOT NULL DEFAULT 200,
  lighthouse_mode     TEXT    NOT NULL DEFAULT 'sample',
  lighthouse_strategy TEXT    NOT NULL DEFAULT 'mobile',
  enabled             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  -- Kepemilikan dinyatakan HANYA di sini. `findings`, `runs`, `pages`,
  -- `lighthouse`, dan `reports` semuanya sudah ON DELETE CASCADE dari
  -- `sites`, jadi menghapus user membawa serta seluruh jejaknya tanpa satu
  -- baris kode tambahan.
  user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
  -- Guest bukan akun: tidak ada barisnya di `users`, tidak ada tabel session.
  -- Yang ada cuma cookie bertanda tangan, dan kolom ini yang memasangkannya.
  guest_id            TEXT
);

-- `id` ikut dibawa. Wajib: `runs.site_id`, `pages.site_id`, dan
-- `findings.site_id` menunjuk ke nilai-nilai ini.
INSERT INTO sites_baru (id, name, base_url, sitemap_url, max_pages,
                        lighthouse_mode, lighthouse_strategy, enabled, created_at)
  SELECT id, name, base_url, sitemap_url, max_pages,
         lighthouse_mode, lighthouse_strategy, enabled, created_at
  FROM sites;

DROP TABLE sites;

ALTER TABLE sites_baru RENAME TO sites;

-- Dua indeks partial, bukan satu constraint gabungan. SQLite memperlakukan
-- setiap NULL sebagai nilai yang berbeda, jadi UNIQUE(user_id, guest_id,
-- base_url) tidak akan menahan apa pun pada baris yang salah satu kolomnya
-- NULL — yaitu semua baris.
CREATE UNIQUE INDEX idx_situs_user  ON sites(user_id, base_url)  WHERE user_id  IS NOT NULL;
CREATE UNIQUE INDEX idx_situs_guest ON sites(guest_id, base_url) WHERE guest_id IS NOT NULL;
CREATE INDEX idx_situs_pemilik ON sites(user_id, guest_id);

COMMIT;

PRAGMA foreign_keys = ON;

BEGIN;
