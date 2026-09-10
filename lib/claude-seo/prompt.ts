import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NAMA_HASIL } from './jalankan.ts'

/**
 * Berkas skill yang IKUT TER-COMMIT di repositori ini.
 *
 * Sebelumnya prompt di bawah menyebut nama skill dari plugin luar
 * (`claude-seo:seo-geo`), dan itu punya dua akibat: orang yang meng-clone
 * proyek ini tanpa plugin itu mendapat aspek yang gagal tanpa penjelasan, dan
 * pengetahuan tentang APA yang harus diperiksa tinggal di luar proyek —
 * sehingga tidak bisa dibaca, ditinjau, atau diperbaiki oleh pemakainya.
 *
 * Sekarang promptnya menunjuk ke berkas di `skills/`, dan berkas itu sendiri
 * yang menyuruh memakai plugin bila memang terpasang. Jadi pluginnya menjadi
 * percepatan, bukan syarat.
 *
 * Path-nya diturunkan dari `import.meta.url`, BUKAN dari `process.cwd()`:
 * `jalankan.ts` menjalankan CLI-nya di direktori kerja lain (`claude-seo-out/`),
 * jadi path relatif akan menunjuk ke tempat yang salah.
 */
const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function berkasSkill(aspek: 'geo' | 'audit' | 'mobile-parity'): string {
  return join(AKAR, 'skills', `${aspek}.md`)
}

/**
 * Prompt untuk claude-seo, dijalankan headless.
 *
 * Bentuknya dipaksa JSON karena hasilnya harus jadi baris temuan yang bisa
 * ditandai beres, bukan prosa. Skill claude-seo sendiri menulis prosa dan
 * berkas markdown; yang diminta di sini adalah ringkasan terstruktur DI ATAS
 * pekerjaan itu.
 */

export type TemuanSebelumnya = { rule: string; title: string }

/** Berapa banyak aturan sebelumnya yang dikutip. Cukup besar untuk memuat
 *  seluruh temuan satu kategori pada situs yang wajar, cukup kecil supaya
 *  promptnya tidak didominasi daftar. */
const BATAS_SEBELUMNYA = 60

/**
 * Daftar nama aturan yang sudah dipakai, beserta perintah memakainya ulang.
 *
 * INI YANG SEBENARNYA MENJAGA §2.1, dan `normalkanRule` hanya pelengkapnya.
 *
 * Diukur, bukan diduga: dua analisis GEO berurutan atas isleep.co.id tanpa
 * mengubah apa pun menghasilkan 10 temuan ditandai "sudah diperbaiki" dan 12
 * dibuka sebagai baru — nol yang bertahan. Model menamai masalah yang sama
 * dengan `product-schema-tanpa-penawaran` lalu `schema-produk-tanpa-penawaran`,
 * `tanpa-blok-tanya-jawab` lalu `tidak-ada-blok-tanya-jawab`. Normalisasi
 * huruf dan angka tidak bisa menjangkau perbedaan itu, dan tidak akan pernah
 * bisa: keduanya nama yang sah untuk satu hal.
 *
 * Jadi identitasnya tidak lagi dikarang tiap kali. Model DIBERI nama yang
 * sudah ada dan diminta mencocokkan — mengarang nama baru hanya untuk masalah
 * yang benar-benar belum ada di daftar.
 */
function bagianSebelumnya(sebelumnya: TemuanSebelumnya[]): string[] {
  if (sebelumnya.length === 0) {
    return [
      'Situs ini belum pernah dianalisis untuk aspek ini, jadi belum ada nama',
      'aturan yang harus dipakai ulang.',
      '',
    ]
  }

  const dikutip = sebelumnya.slice(0, BATAS_SEBELUMNYA)
  return [
    'PENTING — nama aturan yang sudah dipakai pada analisis sebelumnya untuk',
    'situs ini. Kalau masalah yang sama masih ada, PAKAI ULANG nama aturannya',
    'PERSIS seperti tertulis di bawah, walau Anda akan menamainya lain. Judul',
    'dan detailnya boleh Anda tulis ulang sebebas mungkin — hanya "rule" yang',
    'harus sama.',
    '',
    'Alasannya: nama aturan adalah identitas temuan di basis data ini. Nama',
    'baru untuk masalah lama akan tercatat sebagai "masalah lama sudah',
    'diperbaiki, ada masalah baru" — dan riwayat perbaikan pemakainya jadi',
    'tidak bisa dipercaya.',
    '',
    ...dikutip.map((t) => `- ${t.rule} — ${t.title.slice(0, 120)}`),
    '',
    sebelumnya.length > dikutip.length
      ? `(${sebelumnya.length - dikutip.length} nama lain tidak dikutip.)`
      : '',
    'Kalau salah satu masalah di atas sudah TIDAK ADA lagi, cukup jangan',
    'sertakan aturannya — jangan menyebutnya sebagai sudah beres.',
    '',
  ].filter((b) => b !== '')
}

/**
 * Aturan yang berlaku untuk kedua prompt.
 *
 * Dua di antaranya menjaga §2.1 dari sisi prompt, melengkapi `normalkanRule`
 * di parse.ts dan `bagianSebelumnya` di atas:
 *
 * - nama aturan tidak boleh memuat angka. Tanpa ini model menulis
 *   `judul-pendek-12-halaman`, hitungannya berubah minggu depan, dan temuan
 *   yang sama terbuka sebagai temuan baru.
 * - satu temuan per masalah, bukan per halaman. Aturan yang sama di 40 halaman
 *   adalah satu masalah; 40 baris akan mengubur tab-nya.
 */
const ATURAN = [
  `LANGKAH TERAKHIR — WAJIB: tulis hasilnya sebagai JSON ke berkas`,
  `\`./${NAMA_HASIL}\` di direktori kerja Anda, memakai tool Write.`,
  '',
  'Berkas, BUKAN jawaban akhir Anda. Alasannya: yang membaca hasil ini adalah',
  'program, dan program itu hanya menerima pesan terakhir Anda. Kalau JSON-nya',
  'Anda tulis sebagai jawaban lalu Anda menambahkan satu kalimat penutup,',
  'JSON-nya hilang seluruhnya dan seluruh pekerjaan Anda terbuang. Ini sudah',
  'terjadi. Berkas tidak punya masalah itu.',
  '',
  'Isi berkasnya JSON saja, tanpa blok kode:',
  '{"temuan":[{"rule":"...","severity":"...","title":"...","url":"...","detail":"..."}]}',
  '',
  'Tulis berkas itu SEBELUM Anda menjawab apa pun, dan tulis walau temuannya',
  'kosong. Setelah itu jawaban akhir Anda boleh apa saja — sudah tidak dibaca.',
  '',
  'Aturan keras:',
  '- "rule": kebab-case pendek, bahasa Inggris atau Indonesia, dan HARUS STABIL',
  '  ANTAR RUN. Jangan memuat angka, tanggal, hitungan, atau kutipan. Contoh',
  '  baik: llms-txt-hilang, passage-tidak-citable, entitas-brand-lemah.',
  '  Contoh BURUK: judul-pendek-12-halaman, csp-2026, masalah-1.',
  '- "severity": salah satu dari critical, high, medium, low, info.',
  '- "title": satu kalimat, maksimal 200 karakter, menyebut apa yang salah.',
  '- "url": URL absolut halaman yang Anda benar-benar periksa, atau null bila',
  '  temuannya berlaku untuk seluruh situs.',
  '- "detail": penjelasan singkat dan apa yang perlu diperbaiki. Boleh beberapa',
  '  kalimat.',
  '- SATU temuan per masalah, bukan per halaman. Masalah yang sama di banyak',
  '  halaman adalah satu temuan; sebutkan jumlah halamannya di "detail".',
  '- Jangan mengarang. Temuan yang tidak Anda periksa sendiri jangan disebut,',
  '  dan URL yang tidak Anda buka jangan dikarang.',
  '- Kalau situsnya bersih untuk aspek ini, tulis {"temuan":[]}. Array kosong',
  '  adalah jawaban yang sah dan lebih baik daripada temuan yang dipaksa —',
  '  tapi berkasnya tetap harus ada.',
]

export function promptGeo(
  nama: string,
  baseUrl: string,
  sebelumnya: TemuanSebelumnya[] = [],
): string {
  return [
    `Analisis situs "${nama}" (${baseUrl}) untuk aspek GEO.`,
    '',
    `LANGKAH PERTAMA: baca panduan aspek ini dengan tool Read di`,
    `\`${berkasSkill('geo')}\`, lalu ikuti. Panduan itu bagian dari proyek ini`,
    'dan memuat batas serta pengecualian yang berlaku — termasuk perintah',
    'memakai skill claude-seo:seo-geo kalau plugin itu memang terpasang.',
    '',
    'Fokus pada apa yang tidak bisa diukur aturan deterministik: keterjangkauan',
    'crawler AI, keberadaan llms.txt, seberapa bisa dikutip tiap paragraf,',
    'kekuatan sinyal entitas brand, dan kesiapan untuk Google AI Overviews,',
    'ChatGPT, Perplexity, serta Bing Copilot.',
    '',
    'Situs ini SUDAH diperiksa oleh 12 aturan SEO deterministik (judul hilang,',
    'judul kembar, deskripsi, h1, canonical, hreflang, noindex). Jangan',
    'mengulanginya — laporkan hanya yang di luar daftar itu.',
    '',
    ...bagianSebelumnya(sebelumnya),
    ...ATURAN,
  ].join('\n')
}

/**
 * DIBATALKAN: menyuruh audit tidak mengulang temuan GEO.
 *
 * Ide awalnya masuk akal — 5 dari 11 temuan GEO muncul lagi di Audit, satu
 * dengan nama aturan identik persis — tapi pelaksanaannya bertentangan dengan
 * `reconcile` secara struktural, dan itu terukur: enam temuan audit ditandai
 * `fixed` semata karena audit berhenti menyebutnya. Tidak satu pun diperbaiki.
 *
 * Mode lunak (`AMBANG_HILANG` di findings.ts) hanya MENUNDA itu dua analisis;
 * temuan yang sengaja tidak dilaporkan akan tetap berakhir `fixed`. Tidak ada
 * ambang yang bisa memperbaikinya, karena masalahnya bukan seberapa lama kita
 * menunggu — melainkan bahwa kita menyuruh model menyembunyikan sesuatu yang
 * masih ada, lalu menyimpulkan dari ketiadaannya.
 *
 * Jadi kedua kategori sekarang melaporkan apa yang mereka temukan. Harganya:
 * satu masalah bisa muncul di dua tab. Itu menjengkelkan; `fixed` yang
 * berbohong merusak fondasi seluruh alat. Duplikasinya ditangani di tempat
 * yang tidak menyentuh riwayat — kolom Sumber di sheet Prompt Perbaikan
 * menyebutkan asal tiap baris.
 */

export function promptAudit(
  nama: string,
  baseUrl: string,
  maxPages: number,
  sebelumnya: TemuanSebelumnya[] = [],
): string {
  return [
    `Audit situs "${nama}" (${baseUrl}) selengkapnya.`,
    `Batasi crawl pada ${maxPages} halaman.`,
    '',
    `LANGKAH PERTAMA: baca panduan aspek ini dengan tool Read di`,
    `\`${berkasSkill('audit')}\`, lalu ikuti. Panduan itu bagian dari proyek ini`,
    'dan memuat batas serta pengecualian yang berlaku — termasuk perintah',
    'memakai skill claude-seo:seo-audit kalau plugin itu memang terpasang,',
    'beserta perintah melewati spesialis yang kredensial API-nya tidak tersedia',
    'alih-alih gagal atau menebak datanya.',
    '',
    'Situs ini SUDAH diperiksa oleh pemindai deterministik untuk: status HTTP,',
    'halaman kosong, resource rusak, redirect, exception dan pesan console,',
    'header keamanan, cookie, mixed content, TLS, 12 aturan SEO on-page, skor',
    'Lighthouse mobile dan desktop, serta kesejajaran tata letak dan tipografi',
    'antar-lebar layar (aspek Mobile Parity). Jangan mengulangi semua itu.',
    '',
    'Laporkan yang BELUM tercakup: arsitektur konten dan klaster topik, E-E-A-T,',
    'schema markup, kecocokan jenis halaman dengan intent pencarian, konten',
    'tipis atau kembar, cakupan sitemap, dan hal khas industrinya.',
    '',
    ...bagianSebelumnya(sebelumnya),
    ...ATURAN,
  ].join('\n')
}
