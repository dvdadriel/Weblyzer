import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  namaTangkapan,
  namaSah,
  akarTangkapan,
  dirSitus,
  siapkanDir,
} from '../lib/tangkapan.ts'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { upsertPage } from '../lib/repos/pages.ts'
import { tangkapanSitus } from '../lib/ui/tangkapan.ts'

let dir: string
const simpan = process.env.WEBLYZER_SHOT_DIR

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'weblyzer-shot-'))
  process.env.WEBLYZER_SHOT_DIR = dir
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  if (simpan === undefined) delete process.env.WEBLYZER_SHOT_DIR
  else process.env.WEBLYZER_SHOT_DIR = simpan
})

describe('nama berkas', () => {
  it('turunan URL-nya, jadi bisa dihitung ulang', () => {
    // Inilah yang membuat pemetaan hash→URL tidak perlu disimpan di tabel mana
    // pun: nama berkasnya bisa dihitung ulang dari URL kapan saja.
    const a = namaTangkapan('https://uji.test/', 'mobile')
    const b = namaTangkapan('https://uji.test/', 'mobile')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-mobile\.jpg$/)
  })

  it('URL berbeda menghasilkan nama berbeda', () => {
    expect(namaTangkapan('https://uji.test/a', 'mobile')).not.toBe(
      namaTangkapan('https://uji.test/b', 'mobile'),
    )
  })

  it('lebar berbeda menghasilkan nama berbeda', () => {
    const u = 'https://uji.test/'
    const nama = ['mobile', 'tablet', 'desktop'].map((l) => namaTangkapan(u, l))
    expect(new Set(nama).size).toBe(3)
  })

  it('potongan bernomor', () => {
    expect(namaTangkapan('https://uji.test/', 'mobile', 2)).toMatch(
      /^[0-9a-f]{8}-mobile-p2\.jpg$/,
    )
  })
})

describe('nama yang boleh dilayani', () => {
  it('menerima yang dihasilkan namaTangkapan', () => {
    for (const l of ['mobile', 'tablet', 'desktop']) {
      expect(namaSah(namaTangkapan('https://uji.test/', l)), l).toBe(true)
      expect(namaSah(namaTangkapan('https://uji.test/', l, 0)), l).toBe(true)
    }
  })

  it('menolak traversal dalam segala bentuk', () => {
    // Allowlist, bukan daftar hitam: yang diuji di sini bukan daftar bentuk
    // jahat yang terpikirkan, melainkan bahwa apa pun di luar pola ditolak.
    const jahat = [
      '../data.db',
      '../../etc/passwd',
      'abcd1234-mobile.jpg/../../data.db',
      '%2e%2e%2fdata.db',
      'abcd1234-mobile.jpg%00.png',
      '/etc/passwd',
      'abcd1234-mobile.png',
      'abcd1234-mobile.jpg.exe',
      'zzzzzzzz-mobile.jpg', // bukan heks
      'abcd123-mobile.jpg', // tujuh karakter
      'abcd1234-ponsel.jpg', // nama lebar tak dikenal
      'abcd1234-mobile-p12.jpg', // dua angka
      '',
      '.',
      '..',
    ]
    for (const n of jahat) expect(namaSah(n), n).toBe(false)
  })
})

describe('direktori', () => {
  it('WEBLYZER_SHOT_DIR dipakai bila ada', () => {
    expect(akarTangkapan()).toBe(dir)
    expect(dirSitus(7)).toBe(join(dir, '7'))
  })

  it('siapkanDir membuat direktorinya', () => {
    const d = siapkanDir(3)
    expect(existsSync(d)).toBe(true)
  })

  it('siapkanDir MENGHAPUS tangkapan run sebelumnya', () => {
    // Hanya run terakhir yang disimpan, dan itu bukan penghematan belaka:
    // gambar dari run sebelumnya menggambarkan cacat yang mungkin sudah
    // diperbaiki, dan gambar yang bertentangan dengan temuannya lebih buruk
    // daripada tidak ada gambar.
    const d = siapkanDir(3)
    writeFileSync(join(d, namaTangkapan('https://lama.test/', 'mobile')), 'x')
    expect(readdirSync(d).length).toBe(1)

    siapkanDir(3)
    expect(readdirSync(dirSitus(3)).length).toBe(0)
  })

  it('siapkanDir tidak menyentuh situs lain', () => {
    const a = siapkanDir(1)
    writeFileSync(join(a, namaTangkapan('https://a.test/', 'mobile')), 'x')
    siapkanDir(2)
    expect(readdirSync(a).length).toBe(1)
  })
})

describe('mencocokkan berkas dengan halaman', () => {
  it('hanya berkas yang benar-benar ada yang dilaporkan', () => {
    const db = openDb(':memory:')
    const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
    upsertPage(db, site.id, { url: 'https://uji.test/a', statusCode: 200, loadMs: 5 })

    const d = siapkanDir(site.id)
    writeFileSync(join(d, namaTangkapan('https://uji.test/a', 'mobile')), 'x')
    writeFileSync(join(d, namaTangkapan('https://uji.test/a', 'desktop')), 'x')

    const strip = tangkapanSitus(db, site.id)
    expect(strip.length).toBe(1)
    expect(strip[0]!.url).toBe('https://uji.test/a')
    // `tablet` tidak ditulis, jadi tidak boleh muncul.
    expect(Object.keys(strip[0]!.berkas).sort()).toEqual(['desktop', 'mobile'])
  })

  it('beranda ikut diperiksa walau belum ada di tabel pages', () => {
    // Situs yang belum pernah dijelajah diukur pada berandanya, dan beranda itu
    // belum ada di `pages`. Tanpa cabang ini, tangkapannya tidak akan pernah
    // muncul di layar.
    const db = openDb(':memory:')
    const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
    const d = siapkanDir(site.id)
    writeFileSync(join(d, namaTangkapan('https://uji.test', 'mobile')), 'x')

    const strip = tangkapanSitus(db, site.id)
    expect(strip.length).toBe(1)
    expect(strip[0]!.url).toBe('https://uji.test')
  })

  it('berkas yatim tidak muncul', () => {
    // Berkas dari halaman yang sudah dihapus. Karena pencocokannya dari URL ke
    // hash — bukan dari isi direktori — ia tidak bisa muncul.
    const db = openDb(':memory:')
    const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
    const d = siapkanDir(site.id)
    writeFileSync(join(d, namaTangkapan('https://sudah-dihapus.test/', 'mobile')), 'x')
    expect(tangkapanSitus(db, site.id)).toEqual([])
  })

  it('tanpa berkas apa pun, hasilnya kosong', () => {
    const db = openDb(':memory:')
    const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
    expect(tangkapanSitus(db, site.id)).toEqual([])
  })

  it('situs yang tidak ada tidak melempar', () => {
    const db = openDb(':memory:')
    expect(tangkapanSitus(db, 9999)).toEqual([])
  })
})
