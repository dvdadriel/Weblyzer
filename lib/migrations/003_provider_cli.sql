-- Provider ketiga: CLI `agy` di mesin server, admin-only.
--
-- ============================================================================
-- KENAPA INI BUKAN PEMBALIKAN DARI 002
-- ============================================================================
-- Migrasi 002 memindahkan AI dari CLI ke API key per user, dan alasannya masih
-- berlaku sepenuhnya: kredensial CLI milik MESIN, jadi sepuluh orang akan
-- berbagi satu akun dan tagihan pemilik instance menanggung semuanya.
--
-- Yang ditambahkan di sini tidak membatalkan itu, ia berdiri di sebelahnya
-- dengan aturan yang berbeda dan lebih ketat:
--
--   provider 'anthropic'  -> kunci per user, tagihan orangnya, siapa pun boleh
--   provider 'agy-cli'    -> kredensial mesin, tagihan pemilik, ADMIN SAJA
--
-- Polanya sama dengan aspek GEO dan Audit yang sudah ada (lihat
-- `bolehCliHost` di `lib/auth/pemilik.ts`): apa pun yang berjalan dengan
-- kredensial mesin dibatasi ke pemilik instance, karena tagihan dan sesi
-- ber-Bash di server bukan hal yang boleh dipicu orang tak dikenal.
--
-- ============================================================================
-- KENAPA TABELNYA DIBANGUN ULANG
-- ============================================================================
-- `ciphertext`, `iv`, dan `tag` di 002 semuanya NOT NULL, dan provider
-- 'agy-cli' TIDAK punya kunci untuk dienkripsi — kredensialnya ada di mesin,
-- bukan di database. SQLite tidak bisa melonggarkan NOT NULL lewat ALTER
-- TABLE, jadi tabelnya dibangun ulang.
--
-- Ini jauh lebih murah daripada rebuild `sites` di 002: `ai_kunci` tidak
-- direferensikan tabel mana pun, jadi tidak ada CASCADE yang perlu dijaga dan
-- `foreign_keys` tidak perlu dimatikan.
--
-- CHECK-nya yang menjadi penjaga sebenarnya: ia membuat keadaan tak sah
-- mustahil disimpan, alih-alih mengandalkan setiap pemanggil ingat aturannya.
-- Tanpa itu, provider 'agy-cli' dengan ciphertext sampah akan lolos ke
-- database dan gagal jauh kemudian di jalur dekripsi.

CREATE TABLE ai_kunci_baru (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT    NOT NULL DEFAULT 'anthropic',
  model            TEXT    NOT NULL,

  -- NULL hanya sah untuk provider yang kredensialnya bukan milik database.
  ciphertext       BLOB,
  iv               BLOB,
  tag              BLOB,

  terverifikasi_at TEXT,

  CHECK (provider IN ('anthropic', 'agy-cli')),

  -- Provider ber-API-key WAJIB punya ketiganya; provider CLI tidak boleh
  -- punya satu pun. Ditulis sebagai satu CHECK supaya keadaan setengah jalan
  -- (ciphertext ada tapi iv hilang) juga ikut ditolak.
  CHECK (
    (provider = 'anthropic'
      AND ciphertext IS NOT NULL AND iv IS NOT NULL AND tag IS NOT NULL)
    OR
    (provider = 'agy-cli'
      AND ciphertext IS NULL AND iv IS NULL AND tag IS NULL)
  )
);

INSERT INTO ai_kunci_baru (user_id, provider, model, ciphertext, iv, tag, terverifikasi_at)
  SELECT user_id, provider, model, ciphertext, iv, tag, terverifikasi_at
  FROM ai_kunci;

DROP TABLE ai_kunci;
ALTER TABLE ai_kunci_baru RENAME TO ai_kunci;
