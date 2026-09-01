import type { NewFinding } from '../findings.ts'
import type { PageVisit } from '../scanners/visit.ts'
import { stableKey } from './fingerprint-key.ts'
import type { PageIdMap } from './bugs.ts'

/**
 * Menilai hasil kunjungan sebagai error dan warning browser. Fungsi murni:
 * tidak menyentuh browser maupun database.
 *
 * Halaman yang gagal dimuat sengaja dilewati — konsolnya kosong atau berisi
 * kebisingan dari halaman error Chromium, bukan dari situs yang diaudit.
 * Kegagalannya sendiri sudah dilaporkan analyzer bug.
 */
export function analyzeConsole(visits: PageVisit[], pageIds: PageIdMap = {}): NewFinding[] {
  const findings: NewFinding[] = []

  for (const v of visits) {
    if (v.statusCode === 0) continue
    const pageId = pageIds[v.url] ?? null

    // Satu halaman kerap memancarkan pesan yang sama berkali-kali (loop render,
    // komponen berulang). Digabung di sini, per halaman, supaya satu pesan
    // menjadi satu temuan dengan riwayat yang utuh.
    const terlihat = new Set<string>()
    const tambah = (f: NewFinding): void => {
      const identitas = `${f.rule}\n${f.key ?? ''}`
      if (terlihat.has(identitas)) return
      terlihat.add(identitas)
      findings.push(f)
    }

    for (const err of v.pageErrors) {
      tambah({
        url: v.url,
        pageId,
        key: stableKey(err),
        severity: 'critical',
        rule: 'uncaught-exception',
        title: `Exception tidak tertangkap: ${err.slice(0, 120)}`,
        detail: { message: err },
      })
    }

    for (const entry of v.console) {
      // Chromium memancarkan pesan ini sendiri untuk setiap subresource yang
      // gagal. Aturan broken-resource sudah melaporkan fakta yang sama beserta
      // URL dan status-nya sebagai field terstruktur, sedangkan pesan ini bahkan
      // tidak menyebut URL-nya. Menyimpan keduanya berarti satu gambar rusak
      // muncul di dua tab.
      if (entry.text.startsWith('Failed to load resource')) continue
      tambah({
        url: v.url,
        pageId,
        key: stableKey(entry.text),
        severity: entry.level === 'error' ? 'high' : 'low',
        rule: entry.level === 'error' ? 'console-error' : 'console-warning',
        title: `console.${entry.level === 'error' ? 'error' : 'warn'}: ${entry.text.slice(0, 120)}`,
        detail: { text: entry.text },
      })
    }

    // Permintaan pihak ketiga (beacon analytics, pixel iklan) gagal atau
    // diblokir sesuai selera jaringan dan pemblokir, bukan karena ada yang
    // rusak di situs ini. Melaporkannya bukan cuma bising: statusnya berubah
    // antar run, sehingga temuan ditandai "sudah diperbaiki" tanpa ada yang
    // diperbaiki, dan riwayat open/fixed kehilangan artinya.
    let originHalaman: string | null = null
    try {
      originHalaman = new URL(v.url).origin
    } catch {
      originHalaman = null
    }

    for (const req of v.failedRequests) {
      if (originHalaman !== null) {
        let originReq: string
        try {
          originReq = new URL(req.url).origin
        } catch {
          continue
        }
        if (originReq !== originHalaman) continue
      }
      tambah({
        url: v.url,
        pageId,
        key: req.url,
        severity: 'medium',
        rule: 'failed-request',
        title: `Permintaan gagal (${req.failure}): ${req.url}`,
        detail: { requestUrl: req.url, failure: req.failure, resourceType: req.resourceType },
      })
    }
  }

  return findings
}
