import { describe, it, expect } from 'vitest'
import { id } from '../lib/i18n/id.ts'
import { en } from '../lib/i18n/en.ts'
import { terjemah, penerjemah, localeSah, LOCALE } from '../lib/i18n/index.ts'

/**
 * `satisfies Kamus` di `en.ts` sudah menjamin kunci yang hilang jadi galat
 * kompilasi, jadi test ini TIDAK mengulang jaminan itu. Yang diuji di sini
 * adalah hal-hal yang tidak bisa dijamin tipe: isi yang kosong, placeholder
 * yang tidak cocok antar bahasa, dan terjemahan yang lupa diterjemahkan.
 */

const KUNCI = Object.keys(id) as (keyof typeof id)[]

/** Nama placeholder di dalam satu string, mis. `{n}` dan `{jam}`. */
const placeholder = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

describe('kelengkapan kamus', () => {
  it('keduanya punya jumlah kunci yang sama', () => {
    expect(Object.keys(en)).toHaveLength(KUNCI.length)
  })

  it.each(LOCALE)('%s tidak punya nilai kosong', (locale) => {
    const kosong = KUNCI.filter((k) => terjemah(locale, k).trim() === '')
    expect(kosong).toEqual([])
  })
})

describe('placeholder cocok antar bahasa', () => {
  it('setiap kunci memakai nama placeholder yang sama', () => {
    // Placeholder yang berbeda antar bahasa adalah bug yang hanya muncul di
    // satu bahasa: pemanggilnya mengirim `{n}`, dan bahasa yang menulis `{num}`
    // menampilkan "{num}" mentah di layar. Tipe tidak bisa menangkap ini.
    const beda = KUNCI.filter((k) => {
      const a = placeholder(id[k])
      const b = placeholder(en[k])
      return a.join(',') !== b.join(',')
    }).map((k) => `${k}: id=${placeholder(id[k])} en=${placeholder(en[k])}`)
    expect(beda).toEqual([])
  })
})

describe('terjemahan benar-benar diterjemahkan', () => {
  it('sebagian besar nilai en berbeda dari id', () => {
    // Beberapa kunci MEMANG identik dan itu benar: nama kategori, istilah
    // teknis, dan nama produk tidak diterjemahkan (lihat aturan di `id.ts`).
    // Yang dijaga di sini adalah proporsinya — kalau lebih dari sepertiga
    // identik, kemungkinan besar ada blok yang lupa disentuh.
    const sama = KUNCI.filter((k) => id[k] === en[k])
    expect(sama.length).toBeLessThan(KUNCI.length / 3)
  })

  it('kunci prosa panjang tidak identik', () => {
    // Prosa panjang tidak punya alasan untuk sama di dua bahasa. Kalau sama,
    // ia belum diterjemahkan.
    const panjangSama = KUNCI.filter((k) => id[k].length > 60 && id[k] === en[k])
    expect(panjangSama).toEqual([])
  })
})

describe('terjemah', () => {
  it('mengganti placeholder', () => {
    expect(terjemah('id', 'tabel.temuanTerbuka', { n: 12 })).toBe('12 temuan terbuka.')
    expect(terjemah('en', 'tabel.temuanTerbuka', { n: 12 })).toBe('12 open findings.')
  })

  it('mengganti beberapa placeholder sekaligus', () => {
    const s = terjemah('id', 'hapus.teks', { temuan: 555, run: 37 })
    expect(s).toContain('555')
    expect(s).toContain('37')
    expect(s).not.toContain('{')
  })

  it('membiarkan placeholder yang tidak diberi nilai', () => {
    // `{n}` yang muncul di layar adalah bug yang terlihat dan langsung
    // dilaporkan. Teks yang mendadak kehilangan angkanya terbaca seperti
    // kalimat yang memang begitu, dan itu jauh lebih sulit ditemukan.
    expect(terjemah('id', 'tabel.temuanTerbuka')).toContain('{n}')
  })

  it('mengganti semua kemunculan placeholder yang sama', () => {
    const s = terjemah('id', 'umum.situsTidakDitemukan', { id: 7 })
    expect(s).not.toContain('{')
  })
})

describe('penerjemah', () => {
  it('mengikat locale', () => {
    const t = penerjemah('en')
    expect(t('nav.model')).toBe('Model')
  })
})

describe('localeSah', () => {
  it('menerima yang dikenal', () => {
    expect(localeSah('id')).toBe('id')
    expect(localeSah('en')).toBe('en')
  })

  it('jatuh ke id untuk yang lain', () => {
    for (const buruk of [undefined, '', 'jp', 'EN', 'id-ID']) {
      expect(localeSah(buruk)).toBe('id')
    }
  })
})
