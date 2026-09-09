import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { listPages } from '../repos/pages.ts'
import { reconcile } from '../findings.ts'
import { jalankanClaudeSeo, BATAS_MS } from '../claude-seo/jalankan.ts'
import { promptGeo, promptAudit } from '../claude-seo/prompt.ts'
import { bacaTemuan } from '../claude-seo/parse.ts'

export const ASPEK = ['geo', 'audit'] as const
export type Aspek = (typeof ASPEK)[number]

export function adalahAspek(k: string): k is Aspek {
  return (ASPEK as readonly string[]).includes(k)
}

/**
 * Menjalankan satu aspek claude-seo dan merekonsiliasi hasilnya.
 *
 * Kategori temuannya `geo` atau `audit` — TERPISAH dari empat kategori
 * deterministik. Itu keputusan yang menjaga §2.1 tetap berlaku di tempat ia
 * masih bisa dijamin: kalau claude-seo berubah pikiran antar run, yang bergerak
 * hanya kategorinya sendiri, dan angka di tab SEO tetap berarti apa yang
 * selama ini ia berarti.
 *
 * Kegagalan claude-seo MENGGAGALKAN job, tidak merekonsiliasi nol temuan.
 * Ini §2.2: nol temuan dari pemindaian yang gagal akan menandai seluruh temuan
 * lama sebagai sudah diperbaiki. Berbeda dari ringkasan AI, yang boleh gagal
 * tanpa menggagalkan apa pun karena ia tidak menghasilkan temuan.
 */
export async function claudeSeoHandler(job: Job, db: DatabaseSync): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  const aspek = String(job.payload.aspek ?? '')
  if (!adalahAspek(aspek)) throw new Error(`Aspek tidak dikenal: ${aspek}`)

  // Nama aturan yang sudah dipakai, diberikan ke model supaya masalah yang
  // sama tetap punya identitas yang sama. Tanpa ini dua analisis berurutan
  // atas situs yang tidak berubah menandai seluruh temuan lama "sudah
  // diperbaiki" — terukur pada isleep.co.id: 10 beres, 12 baru, nol bertahan.
  //
  // `ignored` ikut dikutip, bukan hanya `open`. Justru yang diabaikan paling
  // penting namanya bertahan: kalau namanya bergeser, keputusan "jangan
  // tampilkan ini lagi" hilang dan temuannya kembali muncul sebagai baru.
  const sebelumnya = db
    .prepare(
      `SELECT rule, title FROM findings
       WHERE site_id = ? AND category = ? AND status IN ('open', 'ignored')
       ORDER BY CASE severity
                  WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
                  WHEN 'low' THEN 3 ELSE 4 END, rule`,
    )
    .all(site.id, aspek) as { rule: string; title: string }[]

  const prompt =
    aspek === 'geo'
      ? promptGeo(site.name, site.base_url, sebelumnya)
      : promptAudit(site.name, site.base_url, site.max_pages, sebelumnya)

  const hasil = await jalankanClaudeSeo(prompt, site.id, BATAS_MS[aspek])
  if (!hasil.ok) throw new Error(`claude-seo ${aspek} gagal: ${hasil.galat}`)

  // Halaman yang sudah tersimpan dipakai untuk mencocokkan URL dari model ke
  // baris pages, supaya temuannya bisa ditautkan ke halaman yang benar. Situs
  // yang belum pernah dipindai tetap boleh — temuannya jadi tingkat situs.
  const halaman = new Map(listPages(db, site.id).map((p) => [p.url, p.id]))

  const dibaca = bacaTemuan(hasil.teks, halaman, site.base_url)
  if (!dibaca.ok) throw new Error(`claude-seo ${aspek}: ${dibaca.galat}`)

  // Mode LUNAK, bukan tegas. Absennya sebuah temuan dari analisis model bisa
  // berarti beres, bisa berarti model berubah pikiran, bisa berarti ia diminta
  // tidak mengulang apa yang sudah dilaporkan kategori lain — dan ketiganya
  // tidak bisa dibedakan dari luar. Menandainya beres seketika membuat `fixed`
  // berarti "berhenti dilaporkan", yang terukur terjadi: enam temuan audit
  // ditandai beres semata karena dedup lintas kategori mulai bekerja.
  reconcile(db, site.id, job.run_id, aspek, dibaca.temuan, 'lunak')
}
