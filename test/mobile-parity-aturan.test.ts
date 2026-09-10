import { describe, it, expect } from 'vitest'
import { analisisMobileParity, AMBANG } from '../lib/analyzers/mobile-parity.ts'
import type { UkuranHalaman, UkuranLebar, NamaLebar } from '../lib/scanners/mobile-parity.ts'

/**
 * Ambang diuji dengan angka yang ditulis tangan, tanpa Chromium.
 *
 * Berkas ini menjawab "apakah cabangnya benar"; `mobile-parity-ukur.test.ts`
 * menjawab "apakah angkanya benar-benar terukur begitu di browser". Keduanya
 * perlu, dan menggabungkannya berarti setiap kasus tepi ambang membayar tiga
 * konteks browser.
 */

const LEBAR_PIKSEL: Record<NamaLebar, number> = { mobile: 390, tablet: 820, desktop: 1440 }

/** Satu lebar yang bersih: tidak ada satu pun aturan yang menyala karenanya. */
function bersih(lebar: NamaLebar, ubah: Partial<UkuranLebar> = {}): UkuranLebar {
  const viewport = LEBAR_PIKSEL[lebar]
  return {
    lebar,
    viewport,
    lebarDokumen: viewport,
    keluarViewport: [],
    terpotong: [],
    targetKecil: [],
    porsiTebal: 0.1,
    ukuranIsi: lebar === 'mobile' ? 16 : 17,
    ukuranJudul: lebar === 'mobile' ? 30 : 40,
    jarakMedian: lebar === 'mobile' ? 16 : 24,
    kolomMaks: lebar === 'mobile' ? 1 : 4,
    grid: [],
    hoverSaja: [],
    tangkapan: null,
    ...ubah,
  }
}

function halaman(
  ubah: { meta?: string | null; mobile?: Partial<UkuranLebar>; desktop?: Partial<UkuranLebar> } = {},
): UkuranHalaman {
  return {
    url: 'https://uji.test/',
    metaViewport: ubah.meta === undefined ? 'width=device-width, initial-scale=1' : ubah.meta,
    perLebar: [
      bersih('mobile', ubah.mobile),
      bersih('tablet'),
      bersih('desktop', ubah.desktop),
    ],
  }
}

const aturan = (u: UkuranHalaman) => analisisMobileParity(u).map((t) => t.rule)
const el = (angka: number) => ({ selektor: 'div.x', teks: 'teks', angka })

describe('dasar', () => {
  it('halaman bersih menghasilkan nol temuan', () => {
    // Dasar dari seluruh berkas ini: kalau ini gagal, setiap test lain di sini
    // bisa lolos karena alasan yang salah.
    expect(analisisMobileParity(halaman())).toEqual([])
  })

  it('tanpa pengukuran mobile atau desktop, tidak ada yang bisa dibandingkan', () => {
    // Aspek ini seluruhnya tentang perbandingan. Satu lebar yang hilang berarti
    // tidak ada jawaban — bukan jawaban "bersih".
    const u = halaman()
    expect(analisisMobileParity({ ...u, perLebar: [bersih('mobile')] })).toEqual([])
  })
})

describe('1. mobile terabaikan', () => {
  it('meta viewport hilang adalah critical', () => {
    const t = analisisMobileParity(halaman({ meta: null }))
    const v = t.find((x) => x.rule === 'mobile-viewport-meta-hilang')!
    expect(v).toBeDefined()
    // Satu-satunya `critical` di aspek ini: tanpa meta viewport, tidak ada CSS
    // mana pun yang bisa memperbaikinya dari dalam.
    expect(v.severity).toBe('critical')
    expect(v.detail.perbaikan).toContain('width=device-width')
  })

  it('tata letak yang identik antar lebar terdeteksi', () => {
    const r = aturan(
      halaman({
        mobile: { ukuranIsi: 14, jarakMedian: 8, kolomMaks: 4 },
        desktop: { ukuranIsi: 14, jarakMedian: 8, kolomMaks: 4 },
      }),
    )
    expect(r).toContain('mobile-tanpa-penyesuaian')
  })

  it('satu kolom di kedua lebar TIDAK dianggap terabaikan', () => {
    // Halaman satu kolom yang memang tidak perlu berubah — artikel, misalnya —
    // bukan halaman yang terabaikan. Tanpa syarat `kolomMaks > 1`, setiap blog
    // ditandai.
    const r = aturan(
      halaman({
        mobile: { ukuranIsi: 16, jarakMedian: 16, kolomMaks: 1 },
        desktop: { ukuranIsi: 16, jarakMedian: 16, kolomMaks: 1 },
      }),
    )
    expect(r).not.toContain('mobile-tanpa-penyesuaian')
  })
})

describe('2. tata letak hancur', () => {
  it('dokumen lebih lebar dari viewport berarti menggulir menyamping', () => {
    const r = aturan(halaman({ mobile: { lebarDokumen: 900 } }))
    expect(r).toContain('mobile-scroll-menyamping-mobile')
  })

  it('selisih satu piksel TIDAK dianggap menggulir', () => {
    // `scrollWidth` dan `innerWidth` dibulatkan dari nilai pecahan, jadi tata
    // letak yang tepat pas bisa melaporkan selisih satu piksel. Tanpa
    // toleransi, hampir setiap situs ditandai.
    expect(aturan(halaman({ mobile: { lebarDokumen: 391 } }))).not.toContain(
      'mobile-scroll-menyamping-mobile',
    )
  })

  it('elemen yang keluar tepi: satu medium, tiga high', () => {
    const satu = analisisMobileParity(halaman({ mobile: { keluarViewport: [el(30)] } }))
    expect(satu.find((x) => x.rule.startsWith('mobile-elemen-keluar'))!.severity).toBe('medium')

    const tiga = analisisMobileParity(
      halaman({ mobile: { keluarViewport: [el(30), el(20), el(10)] } }),
    )
    // Tiga atau lebih berarti tata letaknya sendiri yang tidak muat, bukan satu
    // gambar yang kelewat lebar.
    expect(tiga.find((x) => x.rule.startsWith('mobile-elemen-keluar'))!.severity).toBe('high')
  })

  it('temuan tablet dan mobile adalah aturan yang berbeda', () => {
    // Sengaja: keduanya masalah yang berbeda dengan perbaikan yang berbeda,
    // dan menggabungkannya berarti memperbaiki mobile menandai tablet beres.
    const r = aturan(
      halaman({ mobile: { keluarViewport: [el(30)] } }),
    )
    expect(r).toContain('mobile-elemen-keluar-viewport-mobile')
    expect(r).not.toContain('mobile-elemen-keluar-viewport-tablet')
  })

  it('kolom mobile di atas ambang ditandai, di bawahnya tidak', () => {
    expect(aturan(halaman({ mobile: { kolomMaks: AMBANG.kolomMobile } }))).toContain(
      'mobile-kolom-terlalu-banyak',
    )
    // Dua kolom di 390 piksel masih bisa dibela untuk kartu kecil.
    expect(aturan(halaman({ mobile: { kolomMaks: 2 } }))).not.toContain(
      'mobile-kolom-terlalu-banyak',
    )
  })

  it('kolom mobile lebih banyak daripada desktop adalah breakpoint terbalik', () => {
    const r = aturan(halaman({ mobile: { kolomMaks: 2 }, desktop: { kolomMaks: 1 } }))
    expect(r).toContain('mobile-kolom-terbalik')
  })

  it('jarak sempit ditandai low, dan nol diabaikan', () => {
    const t = analisisMobileParity(halaman({ mobile: { jarakMedian: 4 } }))
    expect(t.find((x) => x.rule === 'mobile-jarak-sempit')!.severity).toBe('low')
    // `0` berarti tidak ada wadah ber-gap yang terukur — bukan jarak nol.
    expect(aturan(halaman({ mobile: { jarakMedian: 0 } }))).not.toContain('mobile-jarak-sempit')
  })
})

describe('3. gaya penulisan meleset', () => {
  it('lompatan porsi tebal terhadap desktop ditandai', () => {
    const r = aturan(halaman({ mobile: { porsiTebal: 0.5 }, desktop: { porsiTebal: 0.1 } }))
    expect(r).toContain('mobile-tebal-berlebihan')
  })

  it('kenaikan kecil TIDAK ditandai', () => {
    // Judul yang membungkus jadi dua baris di ponsel menambah porsi tebal tanpa
    // ada yang mengubah apa pun. Menandainya berarti menyalahkan pembungkusan
    // baris.
    const r = aturan(halaman({ mobile: { porsiTebal: 0.25 }, desktop: { porsiTebal: 0.1 } }))
    expect(r).not.toContain('mobile-tebal-berlebihan')
  })

  it('tebal di SEMUA lebar tetap ditandai walau selisihnya nol', () => {
    // Perbandingan saja tidak cukup: halaman yang tebal di mana-mana tidak
    // punya selisih, tapi tetap halaman tanpa hierarki.
    const r = aturan(halaman({ mobile: { porsiTebal: 0.8 }, desktop: { porsiTebal: 0.8 } }))
    expect(r).toContain('mobile-hampir-semua-tebal')
  })

  it('judul yang hampir sama besar dengan isi ditandai', () => {
    const r = aturan(halaman({ mobile: { ukuranIsi: 14, ukuranJudul: 15 } }))
    expect(r).toContain('mobile-hierarki-rata')
  })

  it('hierarki yang menyusut jauh dari desktop ditandai', () => {
    // Rasio 1,3× di ponsel dari 2,5× di desktop: keputusan yang tidak pernah
    // dibuat siapa pun, hasil dari clamp() yang tidak diperiksa di lebar sempit.
    const r = aturan(
      halaman({
        mobile: { ukuranIsi: 16, ukuranJudul: 21 },
        desktop: { ukuranIsi: 16, ukuranJudul: 40 },
      }),
    )
    expect(r).toContain('mobile-hierarki-susut')
  })

  it('hierarki rata dan hierarki susut tidak pernah muncul bersamaan', () => {
    // Satu masalah, satu baris. Dua baris untuk satu hal adalah persis yang
    // dilarang di kepala analyzer-nya.
    const r = aturan(
      halaman({
        mobile: { ukuranIsi: 16, ukuranJudul: 17 },
        desktop: { ukuranIsi: 16, ukuranJudul: 40 },
      }),
    )
    expect(r.filter((x) => x.startsWith('mobile-hierarki')).length).toBe(1)
  })

  it('ukuran yang tidak terukur tidak menghasilkan temuan', () => {
    // Halaman tanpa h1/h2 yang tampil memberi `ukuranJudul: 0`. Membagi dengan
    // itu akan menandai setiap halaman tanpa judul sebagai hierarki rata.
    expect(aturan(halaman({ mobile: { ukuranJudul: 0 } }))).not.toContain('mobile-hierarki-rata')
  })
})

describe('4. tidak bisa dipakai di layar sentuh', () => {
  it('user-scalable=no adalah high', () => {
    const t = analisisMobileParity(
      halaman({ meta: 'width=device-width, initial-scale=1, user-scalable=no' }),
    )
    expect(t.find((x) => x.rule === 'mobile-zoom-dimatikan')!.severity).toBe('high')
  })

  it('maximum-scale di bawah 2 ditandai, 2 atau lebih tidak', () => {
    expect(aturan(halaman({ meta: 'width=device-width, maximum-scale=1' }))).toContain(
      'mobile-zoom-dibatasi',
    )
    // WCAG 1.4.4 mensyaratkan sampai 200%; tepat 2 sudah memenuhi.
    expect(aturan(halaman({ meta: 'width=device-width, maximum-scale=2' }))).not.toContain(
      'mobile-zoom-dibatasi',
    )
  })

  it('zoom dimatikan dan dibatasi tidak muncul bersamaan', () => {
    const r = aturan(halaman({ meta: 'width=device-width, user-scalable=no, maximum-scale=1' }))
    expect(r).toContain('mobile-zoom-dimatikan')
    expect(r).not.toContain('mobile-zoom-dibatasi')
  })

  it('target sentuh kecil menyebut dasar standarnya', () => {
    const t = analisisMobileParity(halaman({ mobile: { targetKecil: [el(16)] } }))
    const v = t.find((x) => x.rule === 'mobile-target-sentuh-kecil')!
    // Ambang yang tidak menyebut dasarnya akan dibantah, dan bantahan itu benar.
    expect(String(v.detail.dasar)).toContain('WCAG')
  })

  it('penyingkap hover-saja ditandai', () => {
    expect(aturan(halaman({ mobile: { hoverSaja: [el(1)] } }))).toContain('mobile-hover-saja')
  })
})

describe('bentuk temuan', () => {
  it('tidak ada nama aturan yang memuat angka', () => {
    // Nama aturan adalah identitas temuan di basis data. Angka di dalamnya
    // berarti temuan yang sama tercatat sebagai "beres, ada yang baru" begitu
    // hitungannya berubah.
    const semua = analisisMobileParity(
      halaman({
        meta: null,
        mobile: {
          lebarDokumen: 900,
          keluarViewport: [el(30), el(20), el(10)],
          terpotong: [el(9)],
          targetKecil: [el(16)],
          hoverSaja: [el(1)],
          porsiTebal: 0.9,
          ukuranIsi: 14,
          ukuranJudul: 15,
          jarakMedian: 4,
          kolomMaks: 4,
        },
        desktop: { kolomMaks: 2, porsiTebal: 0.1 },
      }),
    )
    expect(semua.length).toBeGreaterThan(8)
    for (const t of semua) expect(t.rule, t.rule).not.toMatch(/\d/)
  })

  it('setiap temuan punya url, judul pendek, dan detail', () => {
    for (const t of analisisMobileParity(halaman({ meta: null, mobile: { lebarDokumen: 900 } }))) {
      expect(t.url).toBe('https://uji.test/')
      expect(t.title.length).toBeLessThanOrEqual(200)
      expect(Object.keys(t.detail).length).toBeGreaterThan(0)
    }
  })

  it('tidak ada aturan yang muncul dua kali', () => {
    // Dua baris dengan `rule` sama pada URL sama akan saling menimpa di
    // `reconcile` — yang menang ditentukan severity, dan yang kalah hilang
    // tanpa jejak.
    const semua = analisisMobileParity(
      halaman({ meta: null, mobile: { lebarDokumen: 900, keluarViewport: [el(30)] } }),
    )
    const nama = semua.map((t) => t.rule)
    expect(new Set(nama).size).toBe(nama.length)
  })
})
