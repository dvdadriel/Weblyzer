import type { NewFinding, Severity } from '../findings.ts'
import type { PageVisit } from '../scanners/visit.ts'
import type { ProbeResult } from '../scanners/probe.ts'
import type { PageIdMap } from './bugs.ts'

type AturanHeader = {
  nama: string
  severity: Severity
  /** Hanya bermakna pada https. */
  httpsSaja: boolean
  penjelasan: string
}

const HEADER: AturanHeader[] = [
  {
    nama: 'content-security-policy',
    severity: 'medium',
    httpsSaja: false,
    penjelasan: 'membatasi sumber skrip dan gaya yang boleh dimuat',
  },
  {
    nama: 'strict-transport-security',
    severity: 'medium',
    httpsSaja: true,
    penjelasan: 'memaksa browser tetap memakai https',
  },
  {
    nama: 'x-frame-options',
    severity: 'medium',
    httpsSaja: false,
    penjelasan: 'mencegah halaman disematkan di situs lain',
  },
  {
    nama: 'x-content-type-options',
    severity: 'low',
    httpsSaja: false,
    penjelasan: 'mencegah browser menebak tipe konten',
  },
  {
    nama: 'referrer-policy',
    severity: 'low',
    httpsSaja: false,
    penjelasan: 'membatasi URL yang dibocorkan ke situs tujuan',
  },
]

function punyaHeader(v: PageVisit, nama: string): boolean {
  if (v.responseHeaders[nama] !== undefined) return true
  // CSP dengan frame-ancestors menggantikan X-Frame-Options.
  if (nama === 'x-frame-options') {
    return (v.responseHeaders['content-security-policy'] ?? '').includes('frame-ancestors')
  }
  return false
}

/** Nama cookie saja, tanpa nilainya — nilai cookie itu kredensial. */
function namaCookie(setCookie: string): string {
  return setCookie.split('=')[0]?.trim() ?? '(tanpa nama)'
}

function punyaFlag(setCookie: string, flag: string): boolean {
  return setCookie
    .split(';')
    .some((bagian) => bagian.trim().toLowerCase().startsWith(flag.toLowerCase()))
}

/**
 * Menilai hasil kunjungan dan probe sebagai temuan keamanan pasif. Fungsi murni:
 * tidak menyentuh browser, jaringan, maupun database.
 *
 * Header dan cookie dinilai hanya pada halaman akar. Keduanya bersifat
 * server-wide, jadi menilainya per halaman berarti satu masalah menjadi 141
 * temuan dan tabnya langsung tidak terpakai. Mixed content sebaliknya dinilai
 * per halaman, karena setiap halaman memuat resource yang berbeda.
 *
 * File terbuka dibaca dari `probe.exposed`, BUKAN dari kode status. Terbukti
 * hidup: springair.co.id membalas 200 untuk /.env dan /.DS_Store dengan
 * homepage biasa; membaca status akan menghasilkan dua critical palsu.
 */
export function analyzeSecurity(
  visits: PageVisit[],
  probe: ProbeResult,
  pageIds: PageIdMap = {},
): NewFinding[] {
  const findings: NewFinding[] = []
  const akar = visits[0]

  if (akar !== undefined) {
    const pageId = pageIds[akar.url] ?? null
    const https = akar.url.startsWith('https://')

    for (const aturan of HEADER) {
      if (aturan.httpsSaja && !https) continue
      if (punyaHeader(akar, aturan.nama)) continue
      findings.push({
        url: akar.url,
        pageId,
        key: aturan.nama,
        severity: aturan.severity,
        rule: 'missing-security-header',
        title: `Header ${aturan.nama} tidak ada — ${aturan.penjelasan}`,
        detail: { header: aturan.nama },
      })
    }

    for (const setCookie of akar.setCookies) {
      const nama = namaCookie(setCookie)
      const kurang: { flag: string; severity: Severity }[] = []
      if (https && !punyaFlag(setCookie, 'Secure')) {
        kurang.push({ flag: 'Secure', severity: 'high' })
      }
      if (!punyaFlag(setCookie, 'HttpOnly')) kurang.push({ flag: 'HttpOnly', severity: 'medium' })
      if (!punyaFlag(setCookie, 'SameSite')) kurang.push({ flag: 'SameSite', severity: 'low' })

      for (const k of kurang) {
        findings.push({
          url: akar.url,
          pageId,
          key: `${nama}\n${k.flag}`,
          severity: k.severity,
          rule: 'insecure-cookie',
          title: `Cookie ${nama} tanpa flag ${k.flag}`,
          // Nilai cookie sengaja tidak disimpan — itu kredensial. Menaruhnya di
          // database berarti menaruhnya juga di email notifikasi dan di file
          // Excel yang diekspor.
          detail: { cookie: nama, flag: k.flag },
        })
      }
    }
  }

  for (const v of visits) {
    if (!v.url.startsWith('https://')) continue
    const pageId = pageIds[v.url] ?? null
    for (const r of v.resources) {
      if (!r.url.startsWith('http://')) continue
      findings.push({
        url: v.url,
        pageId,
        key: r.url,
        severity: 'high',
        rule: 'mixed-content',
        title: `Halaman https memuat ${r.resourceType} lewat http: ${r.url}`,
        detail: { resourceUrl: r.url, resourceType: r.resourceType },
      })
    }
  }

  const pageIdAkar = akar === undefined ? null : (pageIds[akar.url] ?? null)
  const urlAkar = akar?.url ?? ''

  for (const e of probe.exposed) {
    findings.push({
      url: urlAkar,
      pageId: pageIdAkar,
      key: e.path,
      severity: 'critical',
      rule: 'exposed-file',
      // Cuplikan isinya masuk ke detail, tidak ke judul: judul muncul di daftar,
      // email notifikasi, dan file Excel yang diekspor.
      title: `File sensitif dapat diakses publik: ${e.path}`,
      detail: { path: e.path, status: e.status, contentType: e.contentType, snippet: e.snippet },
    })
  }

  for (const path of probe.directoryListing) {
    findings.push({
      url: urlAkar,
      pageId: pageIdAkar,
      key: path,
      severity: 'high',
      rule: 'directory-listing',
      title: `Daftar isi direktori terbuka: ${path}`,
      detail: { path },
    })
  }

  if (probe.tls !== null && probe.tls.daysLeft < 30) {
    findings.push({
      url: urlAkar,
      pageId: pageIdAkar,
      severity: probe.tls.daysLeft < 7 ? 'critical' : 'high',
      rule: 'tls-expiring',
      title: `Sertifikat TLS kedaluwarsa dalam ${probe.tls.daysLeft} hari`,
      detail: probe.tls,
    })
  }

  return findings
}
