import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Menjaga kontras palet, bukan mempercayai komentar.
 *
 * Palet ini sudah dua kali salah. Pertama, keenam warna severity hanya diukur
 * terhadap `--bg` dan lolos — padahal `--surface` adalah warna hover baris
 * tabel, tempat lencana severity justru hidup, dan di sana empat dari enam
 * jatuh ke 3.78:1. Kedua, empat warna retro yang enak dipandang gagal telak
 * (amber 2.81:1, mustard 2.19:1, taupe 2.95:1) dan harus digelapkan.
 *
 * Tiga di antaranya sekarang duduk tepat di 4.50:1 — lolos tanpa margin sama
 * sekali. Satu sentuhan pada `--surface` atau pada hue mana pun langsung
 * membuatnya gagal AA, dan tidak ada yang akan menyadarinya. Test ini yang
 * menyadarinya.
 */

const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
/** linear -> sRGB. Wajib: `luminansi` mengharapkan sRGB dan melinearkan sendiri.
 *  Tanpa langkah ini konversinya berjalan dua kali ke arah yang sama, semua
 *  warna jadi jauh lebih gelap, dan rasionya salah untuk SEMUA nilai — test
 *  yang lolos apa pun warnanya. Terukur: sev-high terbaca 7.47:1, bukan 4.50:1. */
const l2s = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function oklchKeRgb(L: number, C: number, H: number): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const q = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * q,
  ]
  return lin.map((v) => Math.min(1, Math.max(0, l2s(v)))) as [number, number, number]
}

const luminansi = ([r, g, b]: [number, number, number]) =>
  0.2126 * s2l(r) + 0.7152 * s2l(g) + 0.0722 * s2l(b)

function rasio(a: [number, number, number], b: [number, number, number]): number {
  const la = luminansi(a)
  const lb = luminansi(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Membaca token langsung dari globals.css — sumber yang sebenarnya dipakai. */
function token(nama: string): [number, number, number] {
  const css = readFileSync('app/globals.css', 'utf8')
  const m = css.match(new RegExp(`--${nama}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`))
  if (!m) throw new Error(`token --${nama} tidak ditemukan sebagai oklch() di app/globals.css`)
  return oklchKeRgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]))
}

const TEKS = [
  'ink',
  'ink-2',
  'sev-critical',
  'sev-high',
  'sev-medium',
  'sev-low',
  'sev-fixed',
  'sev-ignored',
] as const

test.each(TEKS)('%s lolos AA di atas --bg', (nama) => {
  expect(rasio(token(nama), token('bg'))).toBeGreaterThanOrEqual(4.5)
})

test.each(TEKS)('%s lolos AA di atas --surface', (nama) => {
  // `--surface` adalah warna hover baris tabel, tempat lencana severity hidup.
  // Latar yang paling ketat yang menentukan, bukan yang paling sering.
  expect(rasio(token(nama), token('surface'))).toBeGreaterThanOrEqual(4.5)
})
