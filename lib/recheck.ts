import type { DatabaseSync } from 'node:sqlite'
import { fingerprintOf, type NewFinding } from './findings.ts'
import { getSite } from './repos/sites.ts'
import { visit } from './scanners/visit.ts'
import { probeSite } from './scanners/probe.ts'
import { analyzeBugs } from './analyzers/bugs.ts'
import { analyzeConsole } from './analyzers/console.ts'
import { analyzeSecurity } from './analyzers/security.ts'
import { BISA_RECHECK } from './kategori.ts'

/** Daftarnya di `lib/kategori.ts` supaya client component bisa membacanya
 *  tanpa menarik Playwright ke bundle browser. */
const BISA = BISA_RECHECK

export type HasilRecheck =
  | { keadaan: 'beres' }
  | { keadaan: 'masih-ada' }
  | { keadaan: 'tak-terjangkau'; pesan: string }
  | { keadaan: 'tak-didukung'; pesan: string }

type BarisTemuan = {
  id: number
  site_id: number
  category: string
  rule: string
  fingerprint: string
  status: string
  url: string | null
}

/**
 * Memeriksa ulang satu temuan dengan mengunjungi kembali halamannya.
 *
 * TIDAK memakai `reconcile`, dan itu bukan pilihan gaya. `reconcile` menandai
 * seluruh temuan `open` di kategori itu sebagai `fixed` lebih dulu, lalu
 * memasukkan ulang yang masih ada — benar untuk pemindaian penuh, dan
 * bencana untuk data satu halaman: 33 temuan lain di kategori yang sama akan
 * mengaku beres padahal tak pernah diperiksa. Yang dilakukan di sini bedah
 * satu baris.
 *
 * Tidak ada run yang dibuat. Memeriksa satu temuan bukan memindai situs, dan
 * mencatatnya sebagai run akan membuat "dipindai 15:20" di kaki tabel
 * berbohong tentang kesegaran 33 baris lainnya.
 */
export async function recheck(db: DatabaseSync, findingId: number): Promise<HasilRecheck> {
  const t = db
    .prepare(
      `SELECT f.id, f.site_id, f.category, f.rule, f.fingerprint, f.status, p.url AS url
       FROM findings f LEFT JOIN pages p ON p.id = f.page_id
       WHERE f.id = ?`,
    )
    .get(findingId) as BarisTemuan | undefined

  if (!t) throw new Error(`Temuan ${findingId} tidak ditemukan`)

  if (!BISA.has(t.category)) {
    // Lighthouse sengaja tidak didukung di sini: satu pengukuran ulang yang
    // jujur berarti mengukur dua kali lalu mengiris hasilnya (~22 detik), dan
    // mesin itu sudah ada sebagai job Lighthouse penuh. Menirunya di sini
    // berarti dua jalur yang harus sama-sama benar soal flapping.
    return {
      keadaan: 'tak-didukung',
      pesan: `Kategori ${t.category} belum bisa diperiksa per temuan. Jalankan Scan ${t.category}.`,
    }
  }

  const site = getSite(db, t.site_id)
  if (!site) throw new Error(`Situs ${t.site_id} tidak ditemukan`)

  // Temuan tanpa halaman bersifat menyeluruh (header server, file terekspos,
  // sertifikat TLS). Yang diperiksa adalah akar situsnya.
  const target = t.url ?? site.base_url

  const visits = await visit(site.base_url, { hanya: [target] })
  const v = visits[0]

  if (!v || v.statusCode === 0) {
    // Halaman tak terjangkau BUKAN halaman yang sudah beres. Menandainya
    // `fixed` di sini adalah versi satu-baris dari bug yang sudah tiga kali
    // muncul di proyek ini: nol temuan karena tak ada yang diperiksa,
    // dilaporkan sebagai nol temuan karena tak ada yang rusak.
    return {
      keadaan: 'tak-terjangkau',
      pesan: v?.error ?? `${target} tidak bisa dibuka — statusnya tidak diketahui`,
    }
  }

  const probe = t.category === 'security' ? await probeSite(site.base_url) : null
  const dihasilkan = nilai(t.category, visits, probe)

  const adaLagi = dihasilkan.some(
    (f) => fingerprintOf(f.url, f.rule, f.key ?? '') === t.fingerprint,
  )

  if (adaLagi) return { keadaan: 'masih-ada' }

  // Satu baris, dan hanya bila memang masih terbuka. Temuan yang `ignored`
  // tidak diubah: `reconcile` memperlakukan `ignored` sebagai lengket, dan
  // pemeriksaan ulang tidak boleh menjadi pintu belakang yang melanggarnya.
  db.prepare("UPDATE findings SET status = 'fixed' WHERE id = ? AND status = 'open'").run(t.id)
  return { keadaan: 'beres' }
}

function nilai(
  category: string,
  visits: Parameters<typeof analyzeBugs>[0],
  probe: Awaited<ReturnType<typeof probeSite>> | null,
): NewFinding[] {
  switch (category) {
    case 'bugs':
      return analyzeBugs(visits, {})
    case 'console':
      return analyzeConsole(visits, {})
    case 'security':
      return analyzeSecurity(visits, probe ?? { exposed: [], directoryListing: [], tls: null }, {})
    default:
      return []
  }
}
