import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { MUTU, TINGGI_POTONGAN, MAKS_POTONGAN, namaTangkapan } from '../tangkapan.ts'

/**
 * Mobile Parity — mengukur, bukan menebak.
 *
 * ============================================================================
 * APA YANG DIJAWAB ASPEK INI
 * ============================================================================
 * Empat keluhan nyata, dan semuanya soal PERBANDINGAN antara lebar layar —
 * bukan soal satu halaman di satu lebar:
 *
 * 1. Mobile terabaikan karena semua perhatian ke desktop. Terukur sebagai
 *    tata letak yang tidak berubah sama sekali antar lebar: jumlah kolom sama,
 *    ukuran huruf sama, jarak sama.
 * 2. Tata letak hancur di mobile: kartu terpotong, tulisan terpotong, yang
 *    seharusnya satu kolom jadi empat, jarak sempit. Terukur sebagai elemen
 *    yang melewati tepi viewport, teks yang terpotong kotaknya, jumlah kolom
 *    pada lebar sempit, dan jarak median.
 * 3. Gaya penulisan meleset: semuanya tebal di mobile, rasio judul terhadap
 *    isi tidak sejalan dengan desktop. Terukur sebagai porsi teks tebal
 *    (ditimbang panjang teks, bukan jumlah elemen) dan rasio ukuran judul
 *    terhadap ukuran isi — keduanya dibandingkan antar lebar.
 * 4. Fitur yang tidak bisa dipakai di layar sentuh. Terukur sebagai target
 *    sentuh di bawah ambang WCAG, zoom yang dimatikan, dan penyingkap yang
 *    hanya bereaksi pada hover.
 *
 * ============================================================================
 * KENAPA DIUKUR DAN BUKAN DINILAI MODEL
 * ============================================================================
 * Temuan di proyek ini direkonsiliasi lewat fingerprint dan punya riwayat
 * `open` → `fixed`. Penilaian model bergeser tanpa situsnya berubah, dan
 * temuan yang bergeser membuat riwayat itu berbohong — sudah empat kali
 * terjadi di proyek ini.
 *
 * Semua yang di atas bisa diukur dari `getComputedStyle` dan
 * `getBoundingClientRect`, jadi diukur. Penilaian model tetap ada, di atas
 * angka-angka ini, tapi ia menghasilkan PROSA di panel — bukan baris temuan.
 */

/**
 * Tiga lebar, dan ketiganya perlu.
 *
 * Dua saja (mobile dan desktop) tidak cukup: kegagalan paling sering justru
 * di tablet, karena di sanalah breakpoint terakhir sebelum desktop biasanya
 * tidak pernah dibuka orang. 390×844 adalah iPhone 15, 820×1180 iPad Air,
 * 1440×900 laptop 13 inci — bukan angka bulat yang tidak dipakai perangkat
 * mana pun.
 */
export const LEBAR = [
  { nama: 'mobile', width: 390, height: 844, sentuh: true },
  { nama: 'tablet', width: 820, height: 1180, sentuh: true },
  { nama: 'desktop', width: 1440, height: 900, sentuh: false },
] as const

export type NamaLebar = (typeof LEBAR)[number]['nama']

/** Satu elemen yang bermasalah, dengan cukup petunjuk untuk ditemukan lagi. */
export type Elemen = {
  /** Selektor pendek yang bisa ditempel ke devtools. */
  selektor: string
  /** Cuplikan teks, untuk mengenalinya di layar. */
  teks: string
  /** Angka yang membuat ini temuan: kelebihan piksel, ukuran target, dst. */
  angka: number
  /**
   * Kotak elemen dalam koordinat DOKUMEN, bukan viewport.
   *
   * `+ scrollY` sudah ditambahkan di dalam halaman. Bedanya menentukan: `clip`
   * milik Playwright memakai koordinat dokumen, jadi kotak relatif-viewport
   * akan memotong bagian halaman yang salah untuk elemen mana pun yang berada
   * di bawah lipatan.
   */
  kotak?: { x: number; y: number; width: number; height: number }
  /** Nama berkas potongan, bila elemen ini ikut dipotret. */
  tangkapan?: string
}

export type UkuranLebar = {
  lebar: NamaLebar
  /** Lebar viewport yang dipakai, supaya ambang bisa dihitung ulang nanti. */
  viewport: number
  /** Lebar dokumen. Lebih besar dari viewport berarti menggulir menyamping. */
  lebarDokumen: number
  /** Elemen yang melewati tepi kanan viewport. */
  keluarViewport: Elemen[]
  /** Elemen yang isinya terpotong kotaknya sendiri. */
  terpotong: Elemen[]
  /** Target sentuh di bawah ambang. Kosong untuk lebar non-sentuh. */
  targetKecil: Elemen[]
  /**
   * Porsi teks tebal, DITIMBANG PANJANG TEKS — bukan jumlah elemen.
   *
   * Bedanya menentukan: satu `<h1>` tebal di antara tiga puluh paragraf biasa
   * adalah 1/31 elemen tapi mungkin 2% teks. Menghitung per elemen membuat
   * halaman dengan banyak judul pendek tampak "semuanya tebal", padahal yang
   * dilihat mata adalah luas tulisannya.
   */
  porsiTebal: number
  /** Ukuran huruf isi (modus, ditimbang panjang teks). */
  ukuranIsi: number
  /** Ukuran huruf judul terbesar yang benar-benar tampil. */
  ukuranJudul: number
  /** Jarak median antar-anak pada wadah yang menata banyak anak. */
  jarakMedian: number
  /** Jumlah kolom terbanyak pada satu wadah grid. */
  kolomMaks: number
  /** Nama-nama wadah grid beserta jumlah kolomnya, untuk perbandingan. */
  grid: { selektor: string; kolom: number }[]
  /** Elemen yang hanya menyingkap isinya saat hover. */
  hoverSaja: Elemen[]
  /** Nama berkas tangkapan halaman penuh pada lebar ini. `null` bila tidak
   *  diminta. */
  tangkapan: string | null
}

export type UkuranHalaman = {
  url: string
  /** Isi atribut `content` dari meta viewport; null berarti metanya tidak ada. */
  metaViewport: string | null
  perLebar: UkuranLebar[]
}

/**
 * Ambang target sentuh: 24 piksel.
 *
 * Angka WCAG 2.2 kriteria 2.5.8 (Target Size, Minimum, level AA), bukan 44
 * dari panduan Apple. Dipilih yang lebih rendah dengan sengaja: 44 adalah
 * anjuran desain, dan memakainya berarti menandai tombol ikon 32 piksel yang
 * dipakai separuh web sebagai temuan — banjir peringatan yang benar secara
 * anjuran tapi tidak bisa ditindaklanjuti. 24 adalah batas yang bisa dibela
 * sebagai kegagalan.
 */
const AMBANG_SENTUH = 24

/**
 * Toleransi satu piksel untuk perbandingan lebar.
 *
 * Bukan kemewahan: `scrollWidth` dan `innerWidth` adalah bilangan bulat yang
 * dibulatkan dari nilai pecahan, jadi tata letak yang tepat pas bisa
 * melaporkan selisih satu piksel. Tanpa toleransi ini, hampir setiap situs
 * ditandai menggulir menyamping.
 */
const TOLERANSI = 1

/**
 * Skrip yang dijalankan DI DALAM halaman.
 *
 * Ditulis sebagai satu fungsi yang diserahkan ke `page.evaluate` alih-alih
 * beberapa panggilan terpisah, dan itu bukan gaya: setiap panggilan
 * `evaluate` adalah satu perjalanan ke browser, dan pengukuran ini menyentuh
 * setiap elemen di halaman. Dipecah menjadi sepuluh panggilan, satu halaman
 * berat butuh detik-detikan lebih lama tanpa alasan.
 */
function skrip({ ambangSentuh, toleransi }: { ambangSentuh: number; toleransi: number }) {
  const viewport = window.innerWidth

  const pendek = (el: Element): string => {
    const tag = el.tagName.toLowerCase()
    const id = el.id ? `#${el.id}` : ''
    // Satu kelas saja, dan yang pertama: daftar kelas Tailwind bisa memuat
    // empat puluh nama dan tidak membantu siapa pun menemukan elemennya.
    const kelas =
      !id && typeof el.className === 'string' && el.className.trim() !== ''
        ? `.${el.className.trim().split(/\s+/)[0]}`
        : ''
    return `${tag}${id}${kelas}`.slice(0, 80)
  }

  const cuplik = (el: Element): string =>
    (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)

  // Koordinat DOKUMEN: `clip` milik Playwright memakainya, bukan koordinat
  // viewport. Tanpa `scrollY`, potongan untuk elemen di bawah lipatan akan
  // memotret bagian halaman yang sama sekali lain.
  const kotakDari = (r: DOMRect) => ({
    x: Math.max(0, Math.round(r.left)),
    y: Math.max(0, Math.round(r.top + window.scrollY)),
    width: Math.round(r.width),
    height: Math.round(r.height),
  })

  // `> 1`, bukan `> 0`.
  //
  // Pola screen-reader-only menyembunyikan elemen dengan mengecilkannya ke 1
  // piksel lalu memotong isinya (`.sr-only`, `.visually-hidden`). Isinya MEMANG
  // terpotong, dan itu memang maksudnya — jadi `> 0` menandai setiap `h1.sr-only`
  // sebagai teks terpotong. Terukur pada isleep.co.id: dua dari dua temuan
  // "teks terpotong" adalah pola ini.
  //
  // `clip-path` ikut diperiksa karena varian modern pola itu memakai
  // `inset(50%)` alih-alih mengecilkan kotaknya.
  const terlihat = (el: Element, g: CSSStyleDeclaration, r: DOMRect): boolean =>
    g.display !== 'none' &&
    g.visibility !== 'hidden' &&
    Number(g.opacity) !== 0 &&
    r.width > 1 &&
    r.height > 1 &&
    !/inset\(\s*50%/.test(g.clipPath)

  /**
   * Apakah elemen ini dipotong salah satu induknya pada sumbu horizontal.
   *
   * Ini yang membedakan kerusakan dari carousel. Ticker dan slider memang
   * meletakkan isinya jauh di luar viewport, lalu induknya memotongnya dengan
   * `overflow: hidden` — tidak ada yang menggulir, tidak ada yang terlihat
   * rusak, dan tidak ada yang perlu diperbaiki.
   *
   * Terukur pada isleep.co.id: sepuluh dari sepuluh temuan "melewati tepi
   * layar" adalah satu ticker yang dipotong induknya dengan benar. Halamannya
   * sendiri tidak menggulir menyamping sama sekali.
   */
  const dipotongInduk = (el: Element, r: DOMRect): boolean => {
    let p = el.parentElement
    while (p && p !== document.documentElement) {
      const pg = getComputedStyle(p)
      if (pg.overflowX !== 'visible') {
        const pr = p.getBoundingClientRect()
        // Toleransi 1 piksel: kotak induk dan anak yang tepat pas bisa
        // berselisih satu piksel karena pembulatan.
        if (r.right > pr.right + 1) return true
      }
      p = p.parentElement
    }
    return false
  }

  /**
   * Apakah elemen ini atau salah satu anaknya sedang dianimasikan.
   *
   * Isi yang lebih lebar dari kotaknya DAN dianimasikan adalah ticker atau
   * carousel — isinya bergerak masuk, jadi tidak ada yang hilang. Tanpa
   * pemeriksaan ini, setiap marquee dilaporkan sebagai kotak yang memotong
   * isinya.
   */
  // Durasinya HARUS diperiksa, bukan cuma nama propertinya.
  //
  // Nilai bawaan `transition-property` adalah `all` — jadi mencocokkan nama
  // propertinya saja akan cocok dengan SETIAP elemen di halaman, dan seluruh
  // aturan "kotak memotong isinya" mati diam-diam. Yang menangkapnya adalah
  // fixture rusak: `.terpotong` yang jelas cacat berhenti terdeteksi.
  const bergerak = (g: CSSStyleDeclaration): boolean =>
    g.animationName !== 'none' ||
    (parseFloat(g.transitionDuration) > 0 && /transform|all/.test(g.transitionProperty))

  const dianimasikan = (el: Element, g: CSSStyleDeclaration): boolean => {
    if (bergerak(g)) return true
    // Anaknya juga diperiksa, dan `transition: transform` ikut dihitung:
    // itulah bentuk carousel yang digerakkan JavaScript (Swiper, Embla, dan
    // sebangsanya) saat sedang diam. Tanpa cabang ini, setiap carousel yang
    // tidak sedang bergerak dilaporkan sebagai kotak yang memotong isinya.
    for (const anak of Array.from(el.children)) {
      if (bergerak(getComputedStyle(anak))) return true
    }
    return false
  }

  const semua = Array.from(document.body.querySelectorAll('*'))

  // Elemen yang melewati tepi, beserta acuannya — acuannya dipakai untuk
  // menyaring induk di bawah, lalu dibuang sebelum hasilnya diserahkan.
  type Titik = {
    selektor: string
    teks: string
    angka: number
    kotak: { x: number; y: number; width: number; height: number }
  }
  const kandidatKeluar: (Titik & { el: Element })[] = []
  const terpotong: Titik[] = []
  const targetKecil: Titik[] = []
  const grid: { selektor: string; kolom: number }[] = []
  const jarak: number[] = []

  // Ukuran huruf ditimbang panjang teks. Petanya `ukuran -> jumlah karakter`.
  const bobotUkuran = new Map<number, number>()
  let karakterTebal = 0
  let karakterTotal = 0
  let ukuranJudul = 0

  const JUDUL = new Set(['H1', 'H2'])
  const INTERAKTIF = 'a[href], button, input, select, textarea, summary, [role="button"], [onclick]'
  const interaktif = new Set(Array.from(document.body.querySelectorAll(INTERAKTIF)))

  for (const el of semua) {
    const g = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (!terlihat(el, g, r)) continue

    // ── keluar dari viewport ────────────────────────────────────────────────
    // `position: fixed` dilewati: elemen seperti bilah bawah sengaja dipasang
    // di luar aliran dan sering memang melebar penuh dengan transform.
    //
    // TIDAK ada batas lebar di sini. Versi pertama membuang elemen yang lebih
    // lebar dari dua kali viewport, dengan maksud melewati pembungkus
    // selebar-dokumen — dan itu justru membuang penyebab yang paling sering:
    // tabel selebar 900 piksel di layar 390 piksel, penyebab nomor satu
    // gulir menyamping, terbuang setiap kali. Terukur pada fixture: satu-satunya
    // yang dilaporkan adalah kartu yang lewat 30 piksel, sedangkan tabel yang
    // lewat 510 piksel tidak pernah muncul.
    if (g.position !== 'fixed' && r.right > viewport + toleransi && !dipotongInduk(el, r)) {
      kandidatKeluar.push({
        el,
        selektor: pendek(el),
        teks: cuplik(el),
        angka: Math.round(r.right - viewport),
        kotak: kotakDari(r),
      })
    }

    // ── teks terpotong kotaknya ─────────────────────────────────────────────
    // Hanya untuk yang benar-benar menyembunyikan luapan; `overflow: auto`
    // berarti isinya masih bisa dijangkau dengan menggulir.
    const menyembunyikan = g.overflowX === 'hidden' || g.overflowY === 'hidden'
    const punyaTeks = (el.textContent ?? '').trim() !== ''
    if (menyembunyikan && punyaTeks) {
      const lebihTinggi = el.scrollHeight - el.clientHeight
      const lebihLebar = el.scrollWidth - el.clientWidth
      const lebih = Math.max(lebihTinggi, lebihLebar)
      // Ambangnya 4 piksel, bukan 1: `line-height` pecahan menghasilkan
      // selisih satu-dua piksel pada kotak yang isinya justru pas.
      //
      // `-webkit-line-clamp` dan `text-overflow: ellipsis` dikecualikan: teks
      // yang dipotong DENGAN SENGAJA dan diberi elipsis adalah keputusan
      // desain, bukan kerusakan.
      //
      // `!== 'none'`, BUKAN sekadar truthy: nilai bawaan `webkitLineClamp`
      // adalah string "none", dan string itu truthy. Versi pertama karena itu
      // menganggap SETIAP pemotongan disengaja, dan pendeteksinya tidak pernah
      // sekali pun menyala.
      const klamp = (g as unknown as Record<string, string>).webkitLineClamp
      const sengaja =
        g.textOverflow === 'ellipsis' ||
        (klamp !== undefined && klamp !== 'none') ||
        dianimasikan(el, g)
      if (lebih > 4 && !sengaja) {
        terpotong.push({
          selektor: pendek(el),
          teks: cuplik(el),
          angka: Math.round(lebih),
          kotak: kotakDari(r),
        })
      }
    }

    // ── target sentuh ───────────────────────────────────────────────────────
    if (interaktif.has(el)) {
      const sisi = Math.min(r.width, r.height)
      if (sisi < ambangSentuh) {
        targetKecil.push({
          selektor: pendek(el),
          teks: cuplik(el) || (el.getAttribute('aria-label') ?? ''),
          angka: Math.round(sisi),
          kotak: kotakDari(r),
        })
      }
    }

    // ── kolom dan jarak ─────────────────────────────────────────────────────
    if (g.display === 'grid' || g.display === 'inline-grid') {
      // `gridTemplateColumns` yang sudah dihitung berbentuk "120px 120px 120px",
      // jadi jumlah kolomnya adalah jumlah potongannya. `none` berarti kolomnya
      // implisit — satu kolom.
      const kolom =
        g.gridTemplateColumns === 'none' ? 1 : g.gridTemplateColumns.trim().split(/\s+/).length
      if (el.children.length > 1) grid.push({ selektor: pendek(el), kolom })
    }
    if ((g.display === 'flex' || g.display === 'grid') && el.children.length > 1) {
      const gap = parseFloat(g.rowGap) || parseFloat(g.columnGap) || 0
      if (gap > 0) jarak.push(gap)
    }

    // ── tulisan: tebal, ukuran isi, ukuran judul ────────────────────────────
    // Hanya elemen yang punya anak teks LANGSUNG. Tanpa syarat itu, teks satu
    // paragraf ikut terhitung untuk setiap induknya sampai ke <body>, dan
    // porsi tebalnya menjadi rata-rata seluruh pohon.
    let langsung = 0
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) langsung += (n.textContent ?? '').trim().length
    }
    if (langsung > 0) {
      const berat = parseInt(g.fontWeight, 10) || 400
      const ukuran = Math.round(parseFloat(g.fontSize) || 0)
      karakterTotal += langsung
      if (berat >= 600) karakterTebal += langsung
      if (ukuran > 0) bobotUkuran.set(ukuran, (bobotUkuran.get(ukuran) ?? 0) + langsung)
      if (JUDUL.has(el.tagName) && ukuran > ukuranJudul) ukuranJudul = ukuran
    }
  }

  // ── penyingkap yang hanya bereaksi pada hover ─────────────────────────────
  //
  // Dibaca dari stylesheet, bukan dari DOM: yang dicari adalah aturan `:hover`
  // yang MENGUBAH keterlihatan. Menghitung `:hover` yang cuma mengganti warna
  // akan menandai hampir setiap situs.
  //
  // Stylesheet lintas-origin melempar saat `cssRules` dibaca (CORS), dan itu
  // ditangkap per-stylesheet — bukan sekali di luar — supaya satu stylesheet
  // pihak ketiga tidak membatalkan pembacaan seluruh sisanya.
  const hoverSaja: Titik[] = []
  const PENYINGKAP = /(^|[;{\s])(display|visibility|opacity|max-height|transform)\s*:/i
  for (const lembar of Array.from(document.styleSheets)) {
    let aturan: CSSRuleList
    try {
      aturan = lembar.cssRules
    } catch {
      continue
    }
    for (const a of Array.from(aturan)) {
      if (!(a instanceof CSSStyleRule)) continue
      if (!a.selectorText?.includes(':hover')) continue
      if (!PENYINGKAP.test(a.style.cssText)) continue
      // Selektor tanpa `:hover`-nya: itu elemen yang isinya disingkap.
      const dasar = a.selectorText.replace(/:hover/g, '').trim()
      if (dasar === '' || dasar === '*') continue
      try {
        const kena = document.querySelectorAll(dasar)
        if (kena.length > 0) {
          hoverSaja.push({
            selektor: dasar.slice(0, 80),
            teks: cuplik(kena[0]!),
            angka: kena.length,
            kotak: kotakDari(kena[0]!.getBoundingClientRect()),
          })
        }
      } catch {
        // Selektor yang tidak sah setelah `:hover` dibuang (mis. `:hover::after`
        // menjadi `::after`). Bukan temuan.
      }
    }
  }

  const median = (xs: number[]): number => {
    if (xs.length === 0) return 0
    const urut = [...xs].sort((a, b) => a - b)
    return urut[Math.floor(urut.length / 2)]!
  }

  // Ukuran isi = ukuran dengan bobot karakter terbanyak. Bukan rata-rata:
  // rata-rata digeser satu judul raksasa, sedangkan yang dicari adalah ukuran
  // yang paling banyak dibaca mata.
  let ukuranIsi = 0
  let bobotTerbanyak = 0
  for (const [ukuran, bobot] of bobotUkuran) {
    if (bobot > bobotTerbanyak) {
      bobotTerbanyak = bobot
      ukuranIsi = ukuran
    }
  }

  const batas = (xs: Titik[]) => xs.sort((a, b) => b.angka - a.angka).slice(0, 20)

  // Hanya elemen TERDALAM yang dilaporkan.
  //
  // Satu tabel selebar 900 piksel membuat setiap induknya ikut melewati tepi,
  // jadi tanpa penyaring ini satu masalah dilaporkan sebagai empat: body, div,
  // table, td. Yang bisa ditindaklanjuti adalah yang paling dalam — itu
  // elemen yang benar-benar menentukan lebarnya.
  const keluarViewport = kandidatKeluar
    .filter((a) => !kandidatKeluar.some((b) => b.el !== a.el && a.el.contains(b.el)))
    .map(({ selektor, teks, angka, kotak }) => ({ selektor, teks, angka, kotak }))

  return {
    viewport,
    lebarDokumen: document.documentElement.scrollWidth,
    keluarViewport: batas(keluarViewport),
    terpotong: batas(terpotong),
    targetKecil: batas(targetKecil.sort((a, b) => a.angka - b.angka)).slice(0, 20),
    porsiTebal: karakterTotal === 0 ? 0 : karakterTebal / karakterTotal,
    ukuranIsi,
    ukuranJudul,
    jarakMedian: median(jarak),
    kolomMaks: grid.reduce((m, g) => Math.max(m, g.kolom), 0),
    grid: grid.slice(0, 30),
    hoverSaja: hoverSaja.slice(0, 20),
  }
}

/**
 * Mengukur satu halaman pada ketiga lebar.
 *
 * Satu browser, tiga konteks — bukan tiga browser. Chromium butuh sekitar
 * satu detik untuk menyala, dan itu dibayar sekali. Konteks terpisah tetap
 * perlu: `isMobile` dan `hasTouch` hanya bisa dipasang saat konteks dibuat,
 * dan keduanya mengubah tata letak (viewport meta baru berlaku pada konteks
 * mobile).
 */
/**
 * Memotret halaman penuh dan beberapa elemen bermasalah.
 *
 * Dilakukan DI SINI, sementara halamannya sudah terbuka pada lebar yang benar.
 * Membukanya ulang nanti berarti memuat ulang seluruh halaman tiga kali per
 * halaman — dan hasilnya belum tentu sama, karena situs dengan konten acak
 * atau lazy-load akan berbeda pada muatan kedua.
 *
 * Galat ditelan dengan sengaja: tangkapan layar adalah bukti pendukung, dan
 * kegagalan memotret tidak boleh membatalkan pengukuran yang angkanya sudah
 * ada di tangan.
 */
async function potret(
  page: Page,
  dir: string,
  url: string,
  lebar: NamaLebar,
  hasil: { keluarViewport: Elemen[]; terpotong: Elemen[]; targetKecil: Elemen[] },
): Promise<string | null> {
  let penuh: string | null = null
  try {
    penuh = namaTangkapan(url, lebar)
    writeFileSync(
      join(dir, penuh),
      await page.screenshot({
        fullPage: true,
        type: 'jpeg',
        quality: MUTU,
        // `scale: 'css'` — 1x, bukan 3x milik ponsel. Lihat `lib/tangkapan.ts`
        // untuk angka yang mendasarinya: bedanya 18 kali.
        scale: 'css',
      }),
    )
  } catch {
    penuh = null
  }

  // Potongan hanya untuk cacat yang PUNYA tempat di layar. Rasio tipografi
  // dan jumlah kolom tidak bisa ditunjuk dengan kotak, jadi tidak dipotret.
  const calon = [...hasil.keluarViewport, ...hasil.terpotong, ...hasil.targetKecil]
    .filter((e) => e.kotak && e.kotak.width > 0 && e.kotak.height > 0)
    .sort((a, b) => b.angka - a.angka)
    .slice(0, MAKS_POTONGAN)

  const lebarViewport = page.viewportSize()?.width ?? 390
  for (const [i, e] of calon.entries()) {
    try {
      const k = e.kotak!
      const nama = namaTangkapan(url, lebar, i)
      writeFileSync(
        join(dir, nama),
        await page.screenshot({
          // Dari tepi kiri, dan selebar 1,5 kali viewport: yang harus terlihat
          // adalah tepi yang DILEWATI, bukan elemennya saja. Potongan yang
          // hanya memuat elemennya tidak menunjukkan apa pun tentang batas.
          clip: {
            x: 0,
            y: Math.max(0, k.y - 60),
            width: Math.round(lebarViewport * 1.5),
            // Pita minimum 200 piksel, bukan sekadar tinggi elemennya.
            //
            // Terukur: potongan untuk pengalih bahasa 16 piksel keluar sebagai
            // gambar 390×64 — benar secara koordinat dan tidak berguna bagi
            // mata, karena tidak ada apa pun di sekelilingnya yang bisa
            // dikenali. Target sentuh yang terlalu kecil justru butuh
            // konteksnya untuk bisa ditemukan di halaman.
            height: Math.min(TINGGI_POTONGAN, Math.max(200, k.height + 120)),
          },
          type: 'jpeg',
          quality: MUTU,
          scale: 'css',
        }),
      )
      e.tangkapan = nama
    } catch {
      // Satu potongan yang gagal tidak menggagalkan sisanya.
    }
  }

  return penuh
}

export async function ukurHalaman(
  browser: Browser,
  url: string,
  /** Direktori tangkapan. `null` berarti tidak memotret sama sekali — itu yang
   *  dipakai test ambang, dan yang menjaga suite tetap cepat. */
  dir: string | null = null,
): Promise<UkuranHalaman> {
  const perLebar: UkuranLebar[] = []
  let metaViewport: string | null = null

  for (const l of LEBAR) {
    const konteks = await browser.newContext({
      viewport: { width: l.width, height: l.height },
      // `isMobile` menyalakan pemrosesan meta viewport di Chromium. Tanpa itu,
      // halaman tanpa meta viewport tetap tampak rapi pada 390 piksel — dan
      // kegagalan nomor satu ("mobile terabaikan") jadi tidak terlihat sama
      // sekali.
      isMobile: l.sentuh,
      hasTouch: l.sentuh,
      deviceScaleFactor: l.sentuh ? 3 : 1,
    })
    const page = await konteks.newPage()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      // `networkidle` sengaja TIDAK dipakai: situs dengan polling atau chat
      // widget tidak pernah mencapainya, dan seluruh pengukuran menggantung
      // sampai timeout. Yang dibutuhkan adalah tata letak yang sudah tenang,
      // dan itu yang dijamin jeda pendek setelah DOMContentLoaded.
      await page.waitForTimeout(600)

      if (metaViewport === null) {
        metaViewport = await page
          .locator('meta[name="viewport"]')
          .first()
          .getAttribute('content')
          .catch(() => null)
      }

      // Satu argumen, bukan dua: `page.evaluate` menyerahkan tepat satu nilai
      // ke dalam halaman, dan bentuk dua-argumen gagal di tipenya — bukan saat
      // dijalankan.
      const hasil = await page.evaluate(skrip, {
        ambangSentuh: AMBANG_SENTUH,
        toleransi: TOLERANSI,
      })
      const ukuran: UkuranLebar = {
        lebar: l.nama,
        ...hasil,
        // Target sentuh tidak berarti apa-apa pada lebar non-sentuh: kursor
        // tetikus tidak punya masalah dengan tombol 16 piksel.
        targetKecil: l.sentuh ? hasil.targetKecil : [],
        tangkapan: null,
      }
      if (dir !== null) ukuran.tangkapan = await potret(page, dir, url, l.nama, ukuran)
      perLebar.push(ukuran)
    } finally {
      await konteks.close()
    }
  }

  return { url, metaViewport, perLebar }
}

/** Mengukur beberapa halaman dengan satu Chromium. */
export async function ukurSitus(
  urls: string[],
  dir: string | null = null,
): Promise<UkuranHalaman[]> {
  const browser = await chromium.launch()
  try {
    const hasil: UkuranHalaman[] = []
    for (const url of urls) {
      try {
        hasil.push(await ukurHalaman(browser, url, dir))
      } catch (err) {
        // Satu halaman yang gagal dimuat tidak boleh membatalkan pengukuran
        // halaman lain — pola yang sama dengan crawl di `visit.ts`.
        void err
      }
    }
    return hasil
  } finally {
    await browser.close()
  }
}
