import { test, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { adaDemo, situsDemo, temuanDemo, hitungKategori, skorDemo, adalahKategori } from '../lib/demo.ts'
import { KATEGORI } from '../lib/kategori.ts'

/**
 * Baris `import` saja, tanpa komentar dan tanpa string.
 *
 * Versi pertama test ini memeriksa seluruh berkas dengan regex dan gagal pada
 * KOMENTARNYA sendiri — `TabelDemo.tsx` menjelaskan kenapa ia tidak mengimpor
 * `ubahStatusTemuan`, dan penjelasan itu memuat namanya. Yang perlu dijamin
 * adalah dependensinya, bukan kosakata di dalamnya.
 */
function impor(berkas: string): string {
  return readFileSync(join(process.cwd(), berkas), 'utf8')
    .split('\n')
    .filter((l) => /^\s*import\b/.test(l))
    .join('\n')
}

/**
 * Yang dijaga di sini bukan tampilan halaman demo, tapi satu janji: ia tidak
 * bisa menulis, dan tidak bisa menyentuh `data.db`.
 *
 * Halaman demo dimaksudkan untuk di-deploy publik. Satu jalur tulis yang
 * tertinggal di sana bukan bug tampilan — ia database situs sungguhan yang
 * bisa diubah orang asing.
 */

const ADA = adaDemo()

test('lapisan demo tidak pernah menyebut DB_PATH maupun data.db', () => {
  // Diperiksa di SUMBERNYA, bukan lewat perilaku. Perilaku diuji dengan
  // `demo.db` yang kebetulan ada; yang harus dijamin adalah tidak ada jalan
  // bagi berkas ini untuk diarahkan ke tempat lain — termasuk lewat env yang
  // salah pasang di server produksi.
  const src = readFileSync(join(process.cwd(), 'lib/demo.ts'), 'utf8')
  // Kode saja: komentar berkas itu menjelaskan kenapa `data.db` tidak boleh
  // disentuh, dan penjelasan itu memuat namanya.
  const kode = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n')
  expect(kode).not.toMatch(/process\.env/)
  expect(kode).not.toMatch(/data\.db/)
  expect(kode).toContain("'demo.db'")
})

test('lapisan demo tidak mengimpor getDb maupun server action', () => {
  // `getDb()` menyimpan koneksi bersama ke DB_PATH. Berbagi jalur itu berarti
  // satu salah konfigurasi sudah cukup untuk membuat halaman publik membaca —
  // atau menulis — data sungguhan.
  expect(impor('lib/demo.ts')).not.toMatch(/from '\.\/db\.ts'/)
  expect(impor('lib/demo.ts')).not.toMatch(/getDb/)
  expect(readFileSync(join(process.cwd(), 'lib/demo.ts'), 'utf8')).toMatch(/readOnly:\s*true/)
})

test('komponen tabel demo tidak mengimpor satu pun server action', () => {
  // `TabelTemuan` mengimpor `ubahStatusTemuan` dan `periksaTemuan`. Salinan
  // demo-nya ada justru supaya keduanya tidak ikut — kalau import ini muncul,
  // duplikasinya kehilangan seluruh alasannya.
  const src = impor('components/TabelDemo.tsx')
  expect(src).not.toMatch(/app\/actions/)
  expect(src).not.toMatch(/ubahStatusTemuan|periksaTemuan|jalankanScan/)
})

test('halaman demo tidak mengimpor server action maupun lapisan tulis', () => {
  const src = impor('app/demo/page.tsx')
  expect(src).not.toMatch(/actions/)
  expect(src).not.toMatch(/TombolScan|PengaturanSitus|HapusSitus|TambahSitus/)
  expect(src).not.toMatch(/ui\/db|lib\/db\.ts/)
})

/**
 * Dua kegagalan senyap sekaligus, dan keduanya terjadi sungguhan.
 *
 * `demo.db` dibuat dengan `journal_mode = WAL` (bawaan `openDb`). Setelah Nike
 * ditambahkan, seluruh datanya duduk di `demo.db-wal` sebesar 342 KB sementara
 * `demo.db` sendiri tidak berubah satu byte pun — dan `demo.db-wal`
 * di-gitignore. Commit-nya akan mengirim versi dua situs, dan deployment tidak
 * akan pernah punya Nike. `git status` diam karena berkas utamanya memang
 * identik.
 *
 * Kedua: mode WAL menuntut SQLite menulis `-shm` bahkan untuk pembacaan. Di
 * bundle Vercel yang read-only itu tidak mungkin, jadi halaman demo bisa gagal
 * membaca berkasnya sendiri di produksi sementara lolos di lokal.
 *
 * `DELETE` menutup keduanya: satu berkas, tanpa sampingan, dan bisa dibaca
 * tanpa menulis apa pun.
 */
test.skipIf(!ADA)('demo.db tidak dalam mode WAL dan tidak punya berkas sampingan', () => {
  const db = new DatabaseSync(join(process.cwd(), 'demo.db'), { readOnly: true })
  const mode = (db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode
  db.close()
  expect(mode.toLowerCase()).not.toBe('wal')

  for (const sampingan of ['demo.db-wal', 'demo.db-shm']) {
    expect(existsSync(join(process.cwd(), sampingan))).toBe(false)
  }
})

/**
 * `readOnly: true` bukan sekadar niat — ia harus benar-benar menolak tulis.
 * Diuji langsung pada berkas demonya, bukan pada database sementara, karena
 * yang perlu dijamin adalah berkas INI yang di-deploy.
 */
test.skipIf(!ADA)('demo.db menolak tulis', () => {
  const db = new DatabaseSync(join(process.cwd(), 'demo.db'), { readOnly: true })
  expect(() => db.exec("UPDATE findings SET status = 'ignored'")).toThrow(/readonly/i)
  expect(() => db.exec('CREATE TABLE x (a)')).toThrow(/readonly/i)
  db.close()
})

test.skipIf(!ADA)('demo memuat tiga situs dengan temuan', () => {
  const s = situsDemo()
  expect(s.length).toBeGreaterThanOrEqual(3)
  // Nama keduanya disebut, bukan cuma dihitung: demo yang kehilangan salah
  // satunya masih lolos pemeriksaan jumlah kalau ada situs lain tersisa.
  const nama = s.map((x) => x.nama)
  expect(nama).toContain('Weblyzer')
  expect(nama).toContain('Apple')
  expect(nama).toContain('Nike')
  for (const x of s) expect(x.terbuka).toBeGreaterThan(0)
})

test.skipIf(!ADA)('demo TIDAK memuat situs bisnis mana pun', () => {
  // Ini yang paling penting di seluruh berkas ini. Data sungguhan memuat
  // cookie sesi tanpa Secure, versi server, dan 302 URL situs Massindo —
  // peta serangan lengkap. Demo yang dibundel harus terbukti bersih dari itu.
  const s = situsDemo()
  const terlarang = /springair|comforta|isleep|massindo/i
  for (const x of s) {
    expect(x.nama).not.toMatch(terlarang)
    expect(x.base_url).not.toMatch(terlarang)
  }
})

test.skipIf(!ADA)('tidak ada temuan demo yang menyebut situs bisnis', () => {
  const terlarang = /springair|comforta|isleep|massindo|belajarrails/i
  for (const s of situsDemo()) {
    for (const k of KATEGORI) {
      for (const t of temuanDemo(s.id, k)) {
        expect(t.title).not.toMatch(terlarang)
        expect(t.url ?? '').not.toMatch(terlarang)
        expect(t.detail_json).not.toMatch(terlarang)
      }
    }
  }
})

/**
 * Penjaga untuk kalau `demo.db` di-regenerate.
 *
 * Crawl Apple pertama menyeret satu temuan `redirect-chain` yang judulnya
 * memuat `?ssi=4AAABoISLkZIB...` — state identifier alur sign-in Apple. Bukan
 * kredensial kami, tapi opaque, panjang, dan tidak ada nilainya untuk demo.
 * Temuan itu dihapus; test ini memastikan yang seperti itu tidak kembali tanpa
 * ada yang menyadarinya.
 */
/**
 * HTTP 429 adalah rate limit yang CRAWL KAMI SENDIRI sebabkan — Nike
 * membatasi kami, dan URL-nya halaman challenge bot. Melaporkannya sebagai
 * "resource rusak" menyalahkan situs untuk perilaku alat ukurnya sendiri.
 *
 * Delapan temuan seperti itu dibuang dari demo. Preseden §2.1: prefetch RSC
 * Next.js yang dibatalkan juga dibuang karena artefak, bukan cacat. Test ini
 * menjaganya tidak kembali kalau `demo.db` diregenerasi.
 */
test.skipIf(!ADA)('tidak ada temuan demo yang sebenarnya artefak rate-limit', () => {
  const db = new DatabaseSync(join(process.cwd(), 'demo.db'), { readOnly: true })
  const n = (
    db.prepare("SELECT COUNT(*) c FROM findings WHERE title LIKE '%429%'").get() as { c: number }
  ).c
  db.close()
  expect(n).toBe(0)
})

test.skipIf(!ADA)('tidak ada data demo yang memuat parameter mirip kredensial', () => {
  const db = new DatabaseSync(join(process.cwd(), 'demo.db'), { readOnly: true })
  for (const pola of ['%ssi=%', '%sid=%', '%token=%', '%session=%', '%secret%', '%api_key%', '%apikey%']) {
    const t = (
      db
        .prepare('SELECT COUNT(*) c FROM findings WHERE title LIKE ? OR detail_json LIKE ?')
        .get(pola, pola) as { c: number }
    ).c
    const u = (
      db.prepare('SELECT COUNT(*) c FROM pages WHERE url LIKE ?').get(pola) as { c: number }
    ).c
    expect({ pola, temuan: t, halaman: u }).toEqual({ pola, temuan: 0, halaman: 0 })
  }
  db.close()
})

test.skipIf(!ADA)('hitungan kategori menyebut ketujuh kategori, termasuk yang nol', () => {
  // Kategori yang nol harus ADA sebagai nol, bukan hilang: tab tanpa angka
  // berarti "tidak ada temuan", dan tab yang tidak dirender berarti "tidak
  // tahu" — pembedaan §2.2 yang sama.
  const h = hitungKategori(situsDemo()[0]!.id)
  expect(Object.keys(h).sort()).toEqual([...KATEGORI].sort())
  for (const k of KATEGORI) expect(typeof h[k]).toBe('number')
})

test.skipIf(!ADA)('temuan demo hanya yang terbuka', () => {
  // Demo memperlihatkan keadaan sekarang. `fixed` dan `ignored` adalah riwayat
  // yang butuh penjelasan panjang untuk dibaca benar, dan halaman ini tidak
  // punya tempat untuk itu.
  const db = new DatabaseSync(join(process.cwd(), 'demo.db'), { readOnly: true })
  const total = (
    db.prepare("SELECT COUNT(*) c FROM findings WHERE status = 'open'").get() as { c: number }
  ).c
  db.close()

  let dihitung = 0
  for (const s of situsDemo()) for (const k of KATEGORI) dihitung += temuanDemo(s.id, k).length
  expect(dihitung).toBe(total)
})

test.skipIf(!ADA)('skor Lighthouse ada untuk setidaknya satu situs', () => {
  const adaSkor = situsDemo().some((s) => skorDemo(s.id).length > 0)
  expect(adaSkor).toBe(true)
})

test('kategori tak dikenal ditolak', () => {
  expect(adalahKategori('bugs')).toBe(true)
  expect(adalahKategori('geo')).toBe(true)
  // Query param datang dari URL dan bisa berisi apa saja.
  expect(adalahKategori('../../etc/passwd')).toBe(false)
  expect(adalahKategori('')).toBe(false)
  expect(adalahKategori('BUGS')).toBe(false)
})

/**
 * Kontradiksi yang benar-benar muncul di layar dan tertangkap hanya karena
 * saya melihatnya: catatan di atas berbunyi "tidak dijalankan", dan tabel di
 * bawahnya berbunyi "pemindaian berjalan dan tidak menemukan apa pun". Dua
 * kalimat yang saling membantah — §2.2 dilanggar di tempat paling terlihat.
 */
test('keadaan kosong TabelDemo tidak dipakai untuk kategori yang tidak dijalankan', () => {
  const halaman = readFileSync(join(process.cwd(), 'app/demo/page.tsx'), 'utf8')
  const tabel = readFileSync(join(process.cwd(), 'components/TabelDemo.tsx'), 'utf8')

  // TabelDemo memang mengklaim pemindaian berjalan saat kosong — itu benar
  // untuk kategori aturan, dan justru itu sebabnya ia tidak boleh dirender
  // untuk kategori yang tidak dijalankan.
  expect(tabel).toMatch(/Pemindaian berjalan/)
  expect(halaman).toMatch(/tidakDijalankan/)
  expect(halaman).toMatch(/sumberKategori\(kategori\) === 'claude-seo'/)
})
