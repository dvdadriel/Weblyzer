import { test, expect } from 'vitest'
import { perluDikirim, subjek, susunPesan, type HasilSitus } from '../lib/notifikasi/pesan.ts'
import { bacaKonfigurasi } from '../lib/notifikasi/email.ts'

const bersih = (nama: string): HasilSitus => ({ nama, gagal: [], baru: 0, beres: 0, terbuka: 5 })

/* ── kapan email dikirim ─────────────────────────────────────────────────── */

/**
 * Email tiap malam untuk tiga situs adalah 365 email setahun yang isinya
 * "tidak ada yang berubah", dan kotak masuk seperti itu berhenti dibaca — lalu
 * email yang benar-benar penting ikut tidak terbaca.
 */
test('tidak ada perubahan berarti tidak ada email', () => {
  expect(perluDikirim([bersih('A'), bersih('B')])).toBe(false)
  expect(perluDikirim([])).toBe(false)
})

test('kegagalan, temuan baru, dan temuan beres masing-masing memicu email', () => {
  expect(perluDikirim([{ ...bersih('A'), gagal: ['scan'] }])).toBe(true)
  expect(perluDikirim([{ ...bersih('A'), baru: 1 }])).toBe(true)
  // Kabar baik juga kabar: "tiga temuan beres" adalah alasan sah untuk
  // mengirim, bukan hanya kerusakan.
  expect(perluDikirim([{ ...bersih('A'), beres: 3 }])).toBe(true)
})

test('satu situs berubah sudah cukup memicu email untuk seluruhnya', () => {
  expect(perluDikirim([bersih('A'), { ...bersih('B'), baru: 2 }, bersih('C')])).toBe(true)
})

/* ── subjek ──────────────────────────────────────────────────────────────── */

/**
 * Kegagalan lebih dulu: situs yang gagal dipindai membuat SELURUH angkanya
 * tidak bisa dipercaya, bukan cuma menambah satu masalah. Urutan yang sama
 * dengan kartu dashboard.
 */
test('subjek menyebut kegagalan lebih dulu', () => {
  const s = subjek([
    { ...bersih('A'), baru: 4 },
    { ...bersih('B'), gagal: ['scan', 'lighthouse'] },
  ])
  expect(s.indexOf('gagal')).toBeLessThan(s.indexOf('baru'))
  expect(s).toContain('1 situs gagal')
  expect(s).toContain('4 temuan baru')
})

test('subjek menghitung situs yang gagal, bukan langkah yang gagal', () => {
  // Satu situs yang kedua langkahnya gagal tetap satu situs. "2 situs gagal"
  // untuk satu situs adalah angka yang salah unit.
  const s = subjek([{ ...bersih('A'), gagal: ['scan', 'lighthouse'] }])
  expect(s).toContain('1 situs gagal')
})

test('nol tidak pernah muncul di subjek', () => {
  const s = subjek([{ ...bersih('A'), baru: 2 }])
  expect(s).not.toMatch(/0 /)
  expect(s).toBe('Weblyzer: 2 temuan baru')
})

test('subjek tetap sah walau dipanggil pada hasil yang tidak perlu dikirim', () => {
  // `perluDikirim` adalah penjaganya, tapi fungsi ini tidak boleh bergantung
  // pada pemanggil yang tertib — subjek kosong akan menghasilkan email tanpa
  // judul kalau kelak ada pemanggil kedua.
  expect(subjek([bersih('A')])).not.toBe('')
  expect(subjek([])).toContain('Weblyzer')
})

/* ── isi ─────────────────────────────────────────────────────────────────── */

/**
 * Melaporkan "3 temuan terbuka" untuk situs yang crawl-nya gagal berarti
 * menyodorkan angka kemarin sebagai angka hari ini — §2.2 dalam bentuk email.
 */
test('angka situs yang gagal TIDAK dilaporkan', () => {
  const p = susunPesan([{ nama: 'A', gagal: ['scan'], baru: 0, beres: 0, terbuka: 99 }], 'x')
  expect(p.teks).toContain('GAGAL')
  expect(p.teks).not.toContain('99')
  expect(p.teks).toMatch(/tidak diketahui/)
})

test('situs yang berhasil melaporkan jumlah terbuka dan perubahannya', () => {
  const p = susunPesan([{ nama: 'Springair', gagal: [], baru: 3, beres: 1, terbuka: 42 }], 'x')
  expect(p.teks).toContain('Springair — 42 terbuka')
  expect(p.teks).toContain('+3 baru')
  expect(p.teks).toContain('-1 beres')
})

test('situs tanpa perubahan disebut begitu, bukan dibiarkan ambigu', () => {
  const p = susunPesan([bersih('A')], 'x')
  expect(p.teks).toContain('tidak ada perubahan')
})

/**
 * Batasan yang paling mudah disalahpahami, jadi ditulis di setiap email:
 * tidak ada email berarti tidak ada perubahan, BUKAN berarti jadwalnya jalan.
 */
test('setiap email menjelaskan arti tidak adanya email', () => {
  const p = susunPesan([{ ...bersih('A'), baru: 1 }], 'x')
  expect(p.teks).toMatch(/BUKAN berarti jadwalnya berjalan/)
  expect(p.teks).toContain('terakhir dipindai')
})

test('waktu pemindaian ikut di isi email', () => {
  const p = susunPesan([{ ...bersih('A'), baru: 1 }], '2026-09-08 00:14')
  expect(p.teks).toContain('2026-09-08 00:14')
})

/* ── konfigurasi dari environment ────────────────────────────────────────── */

test('environment kosong berarti fitur dimatikan, bukan galat', () => {
  expect(bacaKonfigurasi({}).ada).toBe(false)
  expect(bacaKonfigurasi({ WEBLYZER_SMTP_URL: '   ' }).ada).toBe(false)
})

/**
 * Orang yang mengisi dua dari tiga variabel bermaksud menyalakan notifikasi.
 * Mendiamkannya membuatnya menunggu email yang tidak akan pernah datang.
 */
test('konfigurasi setengah terisi adalah galat yang menyebut apa yang kurang', () => {
  const h = bacaKonfigurasi({
    WEBLYZER_SMTP_URL: 'smtps://a:b@smtp.test:465',
    WEBLYZER_MAIL_FROM: 'a@test',
  })
  expect(h.ada).toBe('rusak')
  if (h.ada !== 'rusak') return
  expect(h.galat).toContain('WEBLYZER_MAIL_TO')
  expect(h.galat).not.toContain('WEBLYZER_SMTP_URL')
})

test('konfigurasi lengkap dibaca dan dipangkas', () => {
  const h = bacaKonfigurasi({
    WEBLYZER_SMTP_URL: '  smtps://u:p@smtp.test:465  ',
    WEBLYZER_MAIL_FROM: ' weblyzer@test ',
    WEBLYZER_MAIL_TO: ' saya@test ',
  })
  expect(h.ada).toBe(true)
  if (h.ada !== true) return
  expect(h.nilai).toEqual({
    url: 'smtps://u:p@smtp.test:465',
    dari: 'weblyzer@test',
    ke: 'saya@test',
  })
})

test('skema URL diperiksa lebih dulu, bukan diserahkan ke pengiriman', () => {
  // Pesan galat dari nodemailer muncul saat pengiriman — yaitu tengah malam,
  // di log yang tidak dibaca.
  const h = bacaKonfigurasi({
    WEBLYZER_SMTP_URL: 'smtp.test:465',
    WEBLYZER_MAIL_FROM: 'a@test',
    WEBLYZER_MAIL_TO: 'b@test',
  })
  expect(h.ada).toBe('rusak')
  if (h.ada !== 'rusak') return
  expect(h.galat).toMatch(/smtps?:\/\//)
})

test('smtp:// tanpa TLS diterima, untuk relay lokal', () => {
  const h = bacaKonfigurasi({
    WEBLYZER_SMTP_URL: 'smtp://localhost:1025',
    WEBLYZER_MAIL_FROM: 'a@test',
    WEBLYZER_MAIL_TO: 'b@test',
  })
  expect(h.ada).toBe(true)
})
