import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { setAiStatus } from '../repos/runs.ts'
import { konfigurasiEfektif, type Konfigurasi, type Hasil } from '../ai/konfigurasi.ts'
import { jalankanAi, BATAS_KELUARAN } from '../ai/jalankan.ts'
import type { HasilAi } from '../ai/jalankan.ts'
import { jalankanCli } from '../ai/cli.ts'
import { jalankanOpenai } from '../ai/openai.ts'
import { susunPrompt, type TemuanRingkas } from '../ai/prompt.ts'

/**
 * Pemanggil AI bisa ditukar, dan itu untuk pengujian.
 *
 * Tanpa seam ini, menguji jalur gagal berarti mengandalkan API key sungguhan
 * yang kebetulan ada di mesin yang menjalankan test — jaminan terpentingnya
 * ("AI gagal tidak menyentuh temuan") jadi ikut mati begitu seseorang
 * memasang kunci itu. Jalur suksesnya pun tidak bisa diuji sama sekali: satu
 * pemanggilan nyata butuh beberapa detik, menghabiskan token, dan jawabannya
 * berbeda tiap kali.
 */
export type PemanggilAi = (cfg: Konfigurasi, prompt: string) => Promise<HasilAi>

/**
 * Menyalurkan prompt ke jalur yang dipilih di `.env`.
 *
 * Satu `switch` yang lengkap atas `jalur`, jadi jalur baru tidak bisa
 * ditambahkan tanpa memutuskan bagaimana ia dipanggil — TypeScript yang
 * menagihnya lewat `never` di bawah.
 */
export async function panggilBawaan(cfg: Konfigurasi, prompt: string): Promise<HasilAi> {
  switch (cfg.jalur) {
    case 'anthropic':
      return jalankanAi(cfg.apiKey, cfg.model, prompt)
    case 'openai':
      return jalankanOpenai(cfg, prompt, BATAS_KELUARAN)
    case 'cli':
      return jalankanCli(cfg.cli, cfg.model, prompt, BATAS_KELUARAN)
    default: {
      const belum: never = cfg
      throw new Error(`Jalur AI tidak tertangani: ${JSON.stringify(belum)}`)
    }
  }
}

/**
 * Meringkas temuan terbuka satu situs dengan AI, lalu menyimpan hasilnya.
 *
 * ATURAN KERAS: keluaran AI tidak pernah menjadi temuan.
 *
 * Temuan direkonsiliasi lewat fingerprint dan punya riwayat `open`/`fixed`,
 * sedangkan teks AI berbeda pada setiap pemanggilan walau datanya identik.
 * Memasukkan teks itu ke tabel `findings` berarti setiap ringkasan baru
 * menandai ringkasan sebelumnya "sudah diperbaiki" — persis kelas bug yang
 * sudah empat kali muncul di proyek ini (beacon analytics, peringatan WebGPU,
 * `errors-in-console`, prefetch RSC yang dibatalkan).
 *
 * Karena itu ringkasan disimpan di `reports`, satu baris per run, dengan label
 * jelas bahwa ini tulisan model. Statusnya di `runs.ai_status` sama sekali
 * tidak menyentuh status temuan.
 */
export async function ringkasanHandler(
  job: Job,
  db: DatabaseSync,
  panggil: PemanggilAi = panggilBawaan,
  // Diinjeksikan dengan alasan yang sama dengan `panggil`: kalau dibaca dari
  // `process.env` di dalam, seluruh jaminan berkas ini ikut bergantung pada
  // isi `.env` di mesin yang menjalankan test — lolos di laptop yang belum
  // mengonfigurasi AI, gagal di laptop yang sudah.
  cfg: Hasil = konfigurasiEfektif(db),
): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  // `skipped`, bukan `failed`. AI yang tidak dikonfigurasi adalah keadaan yang
  // sah dan sengaja: pemindaiannya sendiri tidak butuh AI sama sekali.
  // Kegagalan adalah konfigurasi yang sudah ada lalu tidak menjawab.
  // Menyamakan keduanya membuat lencana peringatan di dashboard menyala untuk
  // pilihan yang memang diinginkan.
  if (!cfg.siap) {
    setAiStatus(db, job.run_id, 'skipped', null, null)
    return
  }
  const konf = cfg.konfigurasi

  const temuan = db
    .prepare(
      `SELECT f.category, f.severity, f.rule, f.title, p.url AS url
       FROM findings f
       LEFT JOIN pages p ON p.id = f.page_id
       WHERE f.site_id = ? AND f.status = 'open'
       ORDER BY CASE f.severity
                  WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
                  WHEN 'low' THEN 3 ELSE 4 END, f.rule`,
    )
    .all(siteId) as unknown as TemuanRingkas[]

  const prompt = susunPrompt({ nama: site.name, baseUrl: site.base_url, temuan })
  const hasil = await panggil(konf, prompt)

  if (!hasil.ok) {
    // Pesan galatnya disimpan apa adanya, dan job TIDAK dilempar.
    //
    // Pemindaiannya sendiri berhasil dan datanya benar; menggagalkan run
    // karena AI-nya gagal akan membuat dashboard menandai seluruh situs
    // "gagal", dan pemakainya menyimpulkan temuannya tidak bisa dipercaya.
    // Yang gagal cuma ringkasannya, dan `ai_status` yang menyampaikan itu.
    setAiStatus(db, job.run_id, 'failed', konf.model, hasil.galat)
    return
  }

  // Ditulis ulang, bukan ditumpuk: satu run punya satu ringkasan, dan menekan
  // tombol jalankan ulang dua kali seharusnya menghasilkan satu baris.
  db.prepare('DELETE FROM reports WHERE run_id = ?').run(job.run_id)
  db.prepare(
    `INSERT INTO reports (run_id, format, content, model_used, tokens_est)
     VALUES (?, 'markdown', ?, ?, ?)`,
    // `tokens_est` kasar dan sengaja: empat karakter per token cukup untuk
    // menjawab "apakah prompt ini membengkak", dan tokenizer yang benar
    // berarti dependensi baru untuk angka yang tidak dipakai menghitung apa pun.
  ).run(job.run_id, hasil.teks, konf.model, Math.ceil((prompt.length + hasil.teks.length) / 4))

  setAiStatus(db, job.run_id, 'ok', konf.model, null)
}
