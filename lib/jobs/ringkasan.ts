import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { setAiStatus } from '../repos/runs.ts'
import { bacaRahasia } from '../auth/rahasia.ts'
import { bacaKunci, kunciSiap, type Kunci } from '../ai/kunci.ts'
import { jalankanAi, BATAS_KELUARAN } from '../ai/jalankan.ts'
import type { HasilAi } from '../ai/jalankan.ts'
import { jalankanAgy } from '../ai/agy.ts'
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
export type PemanggilAi = (kunci: Kunci, prompt: string) => Promise<HasilAi>

/**
 * Menyalurkan prompt ke provider yang dipilih pemilik situs.
 *
 * Seluruh konfigurasi dibawa dalam satu objek `Kunci`, bukan sebagai
 * `(apiKey, model)` seperti dulu, dan itu bukan kerapian belaka: dengan dua
 * provider, argumen `apiKey` bernilai NULL adalah keadaan yang sah, dan
 * memisahkan "kunci mana" dari "provider mana" berarti keduanya bisa
 * berselisih di jalur pemanggilan. Providernya harus dibaca dari baris yang
 * sama dengan modelnya.
 */
async function panggilBawaan(kunci: Kunci, prompt: string): Promise<HasilAi> {
  if (kunci.provider === 'agy-cli') {
    return jalankanAgy(kunci.model, prompt, BATAS_KELUARAN)
  }
  if (kunci.apiKey === null) {
    // Mustahil selama CHECK di migrasi 003 berlaku, dan tetap diperiksa: ini
    // jalur job tengah malam, dan gagal di sini harus berupa satu baris
    // `ai_error` yang bisa dibaca — bukan TypeError tanpa konteks.
    return { ok: false, galat: `Provider ${kunci.provider} tersimpan tanpa API key.` }
  }
  return jalankanAi(kunci.apiKey, kunci.model, prompt)
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
): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  // Proses pemindaian berjalan lepas dari request dan tidak punya session,
  // jadi kuncinya diambil dari pemilik situs. Itulah salah satu sebab kunci
  // disimpan di database dan bukan hanya di memori sesi.
  const pemilik = site.user_id
  if (pemilik === null || !kunciSiap(db, pemilik)) {
    // `skipped`, bukan `failed`. Tidak ada kunci yang siap adalah keadaan yang
    // sah dan sengaja: situs guest tidak pernah punya, dan user yang belum
    // mengonfigurasi model memang belum meminta ringkasan. Kegagalan adalah
    // kunci yang sudah siap lalu tidak menjawab. Menyamakannya membuat lencana
    // peringatan di dashboard menyala untuk konfigurasi yang benar-benar
    // diinginkan.
    setAiStatus(db, job.run_id, 'skipped', null, null)
    return
  }

  const kunci = bacaKunci(db, bacaRahasia(), pemilik)
  if (!kunci) {
    // `kunciSiap` sudah lolos tapi barisnya hilang: hanya mungkin kalau ada
    // yang menghapusnya di antara dua kueri. Bukan kegagalan AI.
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
  const hasil = await panggil(kunci, prompt)

  if (!hasil.ok) {
    // Pesan galatnya disimpan apa adanya, dan job TIDAK dilempar.
    //
    // Pemindaiannya sendiri berhasil dan datanya benar; menggagalkan run
    // karena AI-nya gagal akan membuat dashboard menandai seluruh situs
    // "gagal", dan pemakainya menyimpulkan temuannya tidak bisa dipercaya.
    // Yang gagal cuma ringkasannya, dan `ai_status` yang menyampaikan itu.
    setAiStatus(db, job.run_id, 'failed', kunci.model, hasil.galat)
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
  ).run(job.run_id, hasil.teks, kunci.model, Math.ceil((prompt.length + hasil.teks.length) / 4))

  setAiStatus(db, job.run_id, 'ok', kunci.model, null)
}
