import type { NewFinding } from '../findings.ts'
import type { PageVisit } from '../scanners/visit.ts'

/** Peta URL halaman ke `pages.id`, agar temuan dapat merujuk barisnya. */
export type PageIdMap = Record<string, number>

const TEKS_MINIMAL = 50

/**
 * Menilai hasil kunjungan sebagai bug fungsional — hal yang rusak bagi
 * pengunjung. Fungsi murni: tidak menyentuh browser maupun database, sehingga
 * dapat diuji dengan objek biasa dan dipakai ulang untuk recheck satu halaman.
 */
export function analyzeBugs(visits: PageVisit[], pageIds: PageIdMap = {}): NewFinding[] {
  const findings: NewFinding[] = []

  for (const v of visits) {
    const pageId = pageIds[v.url] ?? null

    if (v.statusCode === 0) {
      // Redirect loop punya perbaikan yang sama sekali berbeda dari "server
      // mati", jadi dibedakan sejak awal alih-alih digabung jadi "gagal dimuat".
      if (v.error?.includes('ERR_TOO_MANY_REDIRECTS')) {
        findings.push({
          url: v.url,
          pageId,
          severity: 'critical',
          rule: 'redirect-loop',
          title: `Redirect berputar tanpa henti: ${v.url}`,
          detail: { error: v.error },
        })
      } else {
        findings.push({
          url: v.url,
          pageId,
          severity: 'critical',
          rule: 'http-error',
          title: `Halaman gagal dimuat: ${v.url}`,
          detail: { error: v.error ?? null },
        })
      }
    } else if (v.statusCode >= 400) {
      findings.push({
        url: v.url,
        pageId,
        severity: v.statusCode >= 500 ? 'critical' : 'high',
        rule: 'http-error',
        title: `HTTP ${v.statusCode} pada ${v.url}`,
        detail: { statusCode: v.statusCode, loadMs: v.loadMs },
      })
    } else if (v.error !== undefined) {
      // Statusnya sehat, jadi halamannya hidup — yang gagal adalah
      // penyelesaian navigasinya. Melaporkannya "tidak terjangkau" adalah
      // karangan, tapi mendiamkannya juga salah: sesuatu menggantung.
      findings.push({
        url: v.url,
        pageId,
        severity: 'medium',
        rule: 'load-timeout',
        title: `Halaman termuat tetapi tidak pernah selesai: ${v.url}`,
        detail: { statusCode: v.statusCode, loadMs: v.loadMs, error: v.error },
      })
    } else if (v.textLength < TEKS_MINIMAL && v.mediaCount === 0) {
      findings.push({
        url: v.url,
        pageId,
        severity: 'high',
        rule: 'blank-page',
        title: `Halaman termuat tetapi nyaris kosong: ${v.url}`,
        detail: { textLength: v.textLength, title: v.title, mediaCount: v.mediaCount },
      })
    }

    if (v.redirects.length >= 3) {
      findings.push({
        url: v.url,
        pageId,
        severity: 'low',
        rule: 'redirect-chain',
        title: `${v.redirects.length} redirect berantai menuju ${v.finalUrl}`,
        detail: { redirects: v.redirects, finalUrl: v.finalUrl },
      })
    }

    for (const r of v.resources) {
      if (r.status < 400) continue
      findings.push({
        url: v.url,
        pageId,
        // `key` wajib: tanpa ini sepuluh gambar rusak di satu halaman
        // menyatu menjadi satu temuan.
        key: r.url,
        severity: 'high',
        rule: 'broken-resource',
        title: `${r.resourceType} gagal dimuat (HTTP ${r.status}): ${r.url}`,
        detail: { resourceUrl: r.url, status: r.status, resourceType: r.resourceType },
      })
    }
  }

  return findings
}
