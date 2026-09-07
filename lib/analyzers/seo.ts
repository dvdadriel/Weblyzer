import type { NewFinding, Severity } from '../findings.ts'
import type { PageVisit } from '../scanners/visit.ts'
import type { PageIdMap } from './bugs.ts'
import { stableKey } from './fingerprint-key.ts'

/**
 * Menilai hasil kunjungan sebagai temuan SEO. Fungsi murni: tidak menyentuh
 * browser maupun database.
 *
 * Aturannya dipilih berdasarkan satu pertanyaan: apa yang TIDAK bisa dijawab
 * Lighthouse? Lighthouse mengukur satu halaman setiap kali, pada segelintir
 * halaman sampel. Karena itu ia tidak pernah bisa mengatakan dua halaman
 * berjudul sama, dan tidak pernah melihat 135 halaman lain yang tidak
 * tersampel. Di situlah tab ini menambah sesuatu, bukan mengulang.
 *
 * Sepenuhnya deterministik — tanpa AI. Temuan direkonsiliasi lewat fingerprint
 * dan punya riwayat open/fixed; penilai yang jawabannya berubah tiap run akan
 * membuat riwayat itu berbohong.
 */

/** Ambang panjang. Bukan aturan Google, tapi titik potong tampilan SERP yang
 *  sudah lama dipakai — dan itu sebabnya angkanya disebut, bukan disembunyikan. */
const BATAS_JUDUL = 60
const BATAS_DESKRIPSI = 160

/** Halaman yang tidak berhasil dimuat tidak dinilai: judul kosong pada halaman
 *  error Chromium bukan judul yang hilang di situs. */
function layakDinilai(v: PageVisit): boolean {
  return v.statusCode >= 200 && v.statusCode < 300
}

/** Judul dan description dibandingkan setelah dinormalkan, supaya beda spasi
 *  atau kapitalisasi tidak menyembunyikan kekembaran yang nyata. */
function normal(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

function kelompokKembar(
  visits: PageVisit[],
  ambil: (v: PageVisit) => string,
): Map<string, PageVisit[]> {
  const peta = new Map<string, PageVisit[]>()
  for (const v of visits) {
    const nilai = normal(ambil(v))
    if (nilai === '') continue
    const ada = peta.get(nilai)
    if (ada) ada.push(v)
    else peta.set(nilai, [v])
  }
  for (const [k, list] of peta) if (list.length < 2) peta.delete(k)
  return peta
}

export function analyzeSeo(visits: PageVisit[], pageIds: PageIdMap = {}): NewFinding[] {
  const findings: NewFinding[] = []
  const dinilai = visits.filter(layakDinilai)
  const akar = dinilai[0]

  /* ── Antar halaman: yang Lighthouse tidak akan pernah bisa lihat ───────── */

  // Satu temuan per KELOMPOK judul kembar, bukan satu per halaman. Enam halaman
  // berjudul sama adalah satu masalah dengan satu perbaikan; melaporkannya enam
  // kali membuat tab ini banjir dan menyembunyikan sisanya.
  if (akar !== undefined) {
    const pageIdAkar = pageIds[akar.url] ?? null

    for (const [judul, halaman] of kelompokKembar(dinilai, (v) => v.title)) {
      findings.push({
        url: akar.url,
        pageId: pageIdAkar,
        key: `judul\n${stableKey(judul)}`,
        severity: 'medium',
        rule: 'judul-kembar',
        title: `${halaman.length} halaman memakai judul yang sama: "${halaman[0]!.title.slice(0, 70)}"`,
        detail: { judul: halaman[0]!.title, halaman: halaman.map((h) => h.url).slice(0, 50) },
      })
    }

    for (const [, halaman] of kelompokKembar(dinilai, (v) => v.seo.metaDescription)) {
      findings.push({
        url: akar.url,
        pageId: pageIdAkar,
        key: `deskripsi\n${stableKey(normal(halaman[0]!.seo.metaDescription))}`,
        severity: 'low',
        rule: 'deskripsi-kembar',
        title: `${halaman.length} halaman memakai meta description yang sama`,
        detail: {
          deskripsi: halaman[0]!.seo.metaDescription,
          halaman: halaman.map((h) => h.url).slice(0, 50),
        },
      })
    }

    // Atribut lang yang tidak konsisten antar halaman. Bukan menebak bahasa
    // isinya — itu perlu deteksi bahasa dan rawan salah — melainkan hanya
    // melaporkan bahwa satu situs mendeklarasikan lebih dari satu nilai tanpa
    // satu pun hreflang yang menjelaskan hubungannya.
    const bahasa = new Set(dinilai.map((v) => v.seo.lang).filter((l): l is string => l !== null))
    const adaHreflang = dinilai.some((v) => v.seo.hreflang.length > 0)
    if (bahasa.size > 1 && !adaHreflang) {
      findings.push({
        url: akar.url,
        pageId: pageIdAkar,
        key: 'lang-tanpa-hreflang',
        severity: 'medium',
        rule: 'hreflang-hilang',
        title: `Situs memakai ${bahasa.size} nilai lang (${[...bahasa].join(', ')}) tanpa satu pun hreflang`,
        detail: { lang: [...bahasa] },
      })
    }
  }

  /* ── Per halaman: Lighthouse hanya melihat segelintir sampel ───────────── */

  for (const v of dinilai) {
    const pageId = pageIds[v.url] ?? null
    const s = v.seo

    if (v.title.trim() === '') {
      findings.push({
        url: v.url,
        pageId,
        severity: 'high',
        rule: 'judul-hilang',
        title: 'Halaman tanpa judul',
        detail: {},
      })
    } else if (v.title.trim().length > BATAS_JUDUL) {
      findings.push({
        url: v.url,
        pageId,
        severity: 'low',
        rule: 'judul-panjang',
        title: `Judul ${v.title.trim().length} karakter, terpotong di hasil pencarian (batas ~${BATAS_JUDUL})`,
        detail: { panjang: v.title.trim().length, batas: BATAS_JUDUL, judul: v.title },
      })
    }

    if (s.metaDescription.trim() === '') {
      findings.push({
        url: v.url,
        pageId,
        severity: 'medium',
        rule: 'deskripsi-hilang',
        title: 'Halaman tanpa meta description',
        detail: {},
      })
    } else if (s.metaDescription.trim().length > BATAS_DESKRIPSI) {
      findings.push({
        url: v.url,
        pageId,
        severity: 'low',
        rule: 'deskripsi-panjang',
        title: `Meta description ${s.metaDescription.trim().length} karakter (batas ~${BATAS_DESKRIPSI})`,
        detail: { panjang: s.metaDescription.trim().length, batas: BATAS_DESKRIPSI },
      })
    }

    const h1Berisi = s.h1.filter((h) => h.trim() !== '')
    if (s.h1.length === 0) {
      findings.push({
        url: v.url,
        pageId,
        severity: 'medium',
        rule: 'h1-hilang',
        title: 'Halaman tanpa h1',
        detail: {},
      })
    } else if (h1Berisi.length === 0) {
      // Terbukti di lapangan: halaman utama springair.co.id punya satu <h1>
      // yang isinya kosong — kemungkinan hanya memuat logo. Aturan "h1 ada"
      // meloloskannya, padahal bagi mesin pencari sama saja dengan tidak ada.
      findings.push({
        url: v.url,
        pageId,
        severity: 'medium',
        rule: 'h1-kosong',
        title: 'h1 ada tapi tanpa teks — kemungkinan hanya memuat gambar',
        detail: { jumlahH1: s.h1.length },
      })
    }
    // TIDAK ADA aturan "h1 ganda", dan itu keputusan yang diambil setelah
    // mengukurnya. Versi pertama memasangnya sebagai `low`, lalu menghasilkan
    // 98 temuan dari 141 halaman springair.co.id — 98 dari 210 temuan SEO,
    // mengubur 46 kelompok judul kembar yang justru masalah nyata.
    //
    // Tapi alasan membuangnya bukan kebisingan, melainkan bahwa nasihatnya
    // sudah tidak benar: beberapa <h1> dalam satu halaman bukan masalah SEO,
    // dan Google sudah menyatakannya bertahun-tahun. Aturan yang salah
    // menghasilkan 98 temuan palsu — lebih buruk daripada tidak ada aturan.
    // Yang tetap dinilai adalah struktur dokumen yang benar-benar hilang:
    // `h1-hilang` dan `h1-kosong`.

    if (s.canonical === null) {
      findings.push({
        url: v.url,
        pageId,
        severity: 'low',
        rule: 'canonical-hilang',
        title: 'Tanpa link canonical',
        detail: {},
      })
    } else {
      let lintasDomain = false
      try {
        lintasDomain = new URL(s.canonical).origin !== new URL(v.url).origin
      } catch {
        lintasDomain = false
      }
      if (lintasDomain) {
        findings.push({
          url: v.url,
          pageId,
          severity: 'high',
          rule: 'canonical-lintas-domain',
          title: `Canonical menunjuk domain lain: ${s.canonical.slice(0, 90)}`,
          detail: { canonical: s.canonical },
        })
      }
    }

    // `info`, bukan masalah: halaman yang sengaja dikecualikan dari pencarian
    // adalah keputusan yang sah. Yang berguna bukan penilaiannya, melainkan
    // faktanya — supaya halaman yang TIDAK sengaja ber-noindex bisa terlihat.
    if (s.metaRobots !== null && /noindex/i.test(s.metaRobots)) {
      findings.push({
        url: v.url,
        pageId,
        severity: 'info' as Severity,
        rule: 'noindex',
        title: `Dikecualikan dari pencarian oleh meta robots: ${s.metaRobots}`,
        detail: { robots: s.metaRobots },
      })
    }
  }

  return findings
}
