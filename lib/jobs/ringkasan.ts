import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { setAiStatus } from '../repos/runs.ts'
import { penyediaTerpilih } from '../ai/penyedia.ts'
import { jalankanAi } from '../ai/jalankan.ts'
import type { HasilAi } from '../ai/jalankan.ts'
import type { IdPenyedia } from '../ai/penyedia.ts'
import { susunPrompt, type TemuanRingkas } from '../ai/prompt.ts'

/**
 * Pemanggil AI bisa ditukar, dan itu untuk pengujian.
 *
 * Tanpa seam ini, menguji jalur gagal berarti mengandalkan `gemini` yang
 * kebetulan tidak punya GEMINI_API_KEY di mesin yang menjalankan test —
 * jaminan terpentingnya ("AI gagal tidak menyentuh temuan") jadi ikut mati
 * begitu seseorang memasang kunci itu. Jalur suksesnya pun tidak bisa diuji
 * sama sekali: satu pemanggilan nyata butuh tujuh detik dan jawabannya
 * berbeda tiap kali.
 */
export type PemanggilAi = (id: IdPenyedia, prompt: string) => Promise<HasilAi>

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
  panggil: PemanggilAi = jalankanAi,
): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  const penyedia = penyediaTerpilih(db)
  if (penyedia === null) {
    // `skipped`, bukan `failed`. Tidak ada penyedia yang dipilih adalah
    // keadaan yang sah dan sengaja; kegagalan adalah penyedia yang dipilih
    // lalu tidak menjawab. Menyamakannya membuat lencana peringatan di
    // dashboard menyala untuk konfigurasi yang benar-benar diinginkan.
    setAiStatus(db, job.run_id, 'skipped', null, null)
    return
  }

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
  const hasil = await panggil(penyedia, prompt)

  if (!hasil.ok) {
    // Pesan CLI disimpan apa adanya, dan job TIDAK dilempar.
    //
    // Pemindaiannya sendiri berhasil dan datanya benar; menggagalkan run
    // karena AI-nya gagal akan membuat dashboard menandai seluruh situs
    // "gagal", dan pemakainya menyimpulkan temuannya tidak bisa dipercaya.
    // Yang gagal cuma ringkasannya, dan `ai_status` yang menyampaikan itu.
    setAiStatus(db, job.run_id, 'failed', penyedia, hasil.galat)
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
  ).run(job.run_id, hasil.teks, penyedia, Math.ceil((prompt.length + hasil.teks.length) / 4))

  setAiStatus(db, job.run_id, 'ok', penyedia, null)
}
