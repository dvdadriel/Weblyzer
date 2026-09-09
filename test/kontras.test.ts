import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Menjaga kontras palet, bukan mempercayai komentar.
 *
 * Palet proyek ini sudah tiga kali salah, dan ketiganya cara yang sama:
 *
 * 1. Palet retro pertama hanya diukur terhadap `--bg` dan lolos — padahal
 *    `--surface` adalah warna hover baris tabel, tempat lencana severity justru
 *    hidup, dan di sana empat dari enam jatuh ke 3,78 : 1.
 * 2. Empat warna retro yang enak dipandang gagal telak (amber 2,81, mustard
 *    2,19, taupe 2,95) dan harus digelapkan.
 * 3. Saat palet Swiss ini disusun, kesalahan yang sama nyaris terulang:
 *    #DC2626, #B45309, #A16207, dan #15803D semuanya enak dipandang dan
 *    semuanya gagal terhadap baris hover (3,90 / 4,06 / 3,98 / 4,05).
 *
 * Karena itu test ini mengukur terhadap `--surface`, bukan `--bg`, dan
 * mengukur KEDUA tema. Ia juga menjaga blok tema gelap tidak menyimpang dari
 * duplikatnya di media query `prefers-color-scheme` — duplikasi yang disengaja
 * (lihat komentar di `globals.css`) dan karena itu perlu dijaga.
 */

const CSS = readFileSync('app/globals.css', 'utf8')

/** Ambang AA untuk teks berukuran normal. */
const AA = 4.5

const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function hexKeRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const luminansi = ([r, g, b]: [number, number, number]) =>
  0.2126 * s2l(r) + 0.7152 * s2l(g) + 0.0722 * s2l(b)

function rasio(a: string, b: string): number {
  const la = luminansi(hexKeRgb(a))
  const lb = luminansi(hexKeRgb(b))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Mengambil satu blok deklarasi dari CSS.
 *
 * Dicari lewat selectornya, bukan lewat nomor baris: blok bisa bergeser saat
 * berkasnya disunting, dan test yang patah karena baris bertambah adalah test
 * yang akhirnya di-skip.
 */
function blok(selector: string): Record<string, string> {
  const i = CSS.indexOf(selector)
  if (i === -1) throw new Error(`selector ${selector} tidak ada di app/globals.css`)
  const buka = CSS.indexOf('{', i)
  const tutup = CSS.indexOf('\n}', buka)
  const isi = CSS.slice(buka + 1, tutup)

  const token: Record<string, string> = {}
  for (const m of isi.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    token[m[1]!] = m[2]!.toUpperCase()
  }
  return token
}

/** Angka rasio yang DIKLAIM komentar di sebelah tiap token. */
function klaimKomentar(selector: string): Record<string, number> {
  const i = CSS.indexOf(selector)
  const buka = CSS.indexOf('{', i)
  const isi = CSS.slice(buka + 1, CSS.indexOf('\n}', buka))
  const klaim: Record<string, number> = {}
  for (const m of isi.matchAll(
    /--([\w-]+):\s*#[0-9A-Fa-f]{6};\s*\/\*\s*([\d.]+)\s*:\s*1\s*\*\//g,
  )) {
    klaim[m[1]!] = Number(m[2])
  }
  return klaim
}

const TERANG = blok(':root {')
const GELAP = blok("[data-theme='dark'] {")

/** Warna yang dipakai sebagai TEKS, jadi harus lolos AA. */
const TEKS = [
  'ink',
  'ink-2',
  'accent',
  'sev-critical',
  'sev-high',
  'sev-medium',
  'sev-low',
  'sev-info',
  'sev-fixed',
  'sev-ignored',
] as const

describe.each([
  ['terang', TERANG],
  ['gelap', GELAP],
])('tema %s', (nama, token) => {
  it('mendefinisikan seluruh warna teks', () => {
    // Tema gelap yang lupa mendefinisikan ulang satu warna akan mewarisi nilai
    // tema terang, dan warna gelap di atas latar gelap tidak terbaca sama
    // sekali. Kegagalan itu tidak muncul di test rasio mana pun, karena
    // rasionya diukur terhadap token yang salah.
    for (const t of TEKS) expect(token[t], `--${t} di tema ${nama}`).toBeDefined()
    expect(token.bg).toBeDefined()
    expect(token.surface).toBeDefined()
  })

  it.each(TEKS)('%s lolos AA di atas --surface', (t) => {
    // `--surface` adalah warna hover baris tabel, tempat lencana severity
    // hidup. Latar yang paling ketat yang menentukan, bukan yang paling sering.
    expect(rasio(token[t]!, token.surface!)).toBeGreaterThanOrEqual(AA)
  })

  it.each(TEKS)('%s lolos AA di atas --bg', (t) => {
    expect(rasio(token[t]!, token.bg!)).toBeGreaterThanOrEqual(AA)
  })
})

describe('angka di komentar adalah hasil ukur', () => {
  /**
   * Komentar yang berbohong lebih buruk daripada tidak ada komentar.
   *
   * Ini bukan kekhawatiran teoretis: sembilan dari sepuluh angka tema terang
   * SALAH saat palet ini pertama ditulis. Semuanya diambil dari mockup, yang
   * permukaan hover-nya `#E9EBEF` alih-alih `#E5E7EB` — jadi setiap angka
   * meleset sekitar 0,2 ke bawah. Semuanya masih lolos AA, jadi tidak ada test
   * lain yang akan menangkapnya, dan orang berikutnya akan memakai angka itu
   * untuk memutuskan apakah sebuah warna punya ruang.
   */
  it.each([
    ['terang', TERANG],
    ['gelap', GELAP],
  ])('tema %s', (_nama, token) => {
    const meleset: string[] = []
    for (const [t, klaim] of Object.entries(klaimKomentar(token === TERANG ? ':root {' : "[data-theme='dark'] {"))) {
      const ukur = rasio(token[t]!, token.surface!)
      if (Math.abs(ukur - klaim) > 0.05) {
        meleset.push(`--${t}: komentar ${klaim}, terukur ${ukur.toFixed(2)}`)
      }
    }
    expect(meleset).toEqual([])
  })
})

describe('severity bisa dibedakan tanpa warna', () => {
  it('kelima glifnya berbeda satu-satu', () => {
    // Glif adalah pembeda yang bertahan di greyscale, di print, dan di
    // screenshot hitam-putih. Dua severity yang berbagi glif berarti
    // severity yang hanya dibedakan warna — persis yang dilarang DESIGN.md.
    // Dibaca dari `lib/glif.ts`, satu sumber untuk empat tempat pemakaian.
    const src = readFileSync('lib/glif.ts', 'utf8')
    const glif = [...src.matchAll(/^\s+(critical|high|medium|low|info):\s*'(.+)',$/gm)].map(
      (m) => m[2],
    )
    expect(glif).toHaveLength(5)
    expect(new Set(glif).size).toBe(5)
  })
})

describe('duplikasi tema gelap tidak menyimpang', () => {
  it('media query prefers-color-scheme memuat nilai yang sama', () => {
    // Blok gelap sengaja digandakan ke media query `prefers-color-scheme`
    // supaya pilihan `system` bekerja tanpa JS dan tanpa kedipan. Duplikasi itu
    // hanya aman kalau ada yang menjaganya, dan inilah penjaganya: satu nilai
    // yang diubah di satu tempat tapi tidak di tempat lain akan menghasilkan
    // dua tema gelap yang berbeda tergantung cara pemakainya memilihnya.
    const sistem = blok(":root:not([data-theme='light']):not([data-theme='dark']) {")
    expect(Object.keys(sistem).length).toBeGreaterThan(0)
    expect(sistem).toEqual(GELAP)
  })
})

describe('token yang tidak boleh kembali', () => {
  it('tidak ada warna oklch hardcoded di luar blok token', () => {
    // Nilai hardcoded tidak berubah saat tema berganti, jadi ia akan
    // menampilkan potongan warna arah lama di tengah tema gelap. Dua belas
    // nilai seperti itu sudah ditemukan dan diganti; test ini mencegahnya
    // kembali.
    const baris = CSS.split('\n')
    const mulaiIsi = baris.findIndex((l) => l.startsWith('*, *::before'))
    const nakal = baris
      .slice(mulaiIsi)
      .map((l, i) => [i + mulaiIsi + 1, l] as const)
      .filter(([, l]) => /oklch\(/.test(l))
    expect(nakal.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([])
  })

  it('bayangan tetap none', () => {
    // Arah ini menyampaikan kedalaman lewat nilai permukaan, bukan lewat blur.
    for (const t of ['shadow-sm', 'shadow-card', 'shadow-hover', 'shadow-dropdown']) {
      expect(CSS).toMatch(new RegExp(`--${t}:\\s*none;`))
    }
  })
})
