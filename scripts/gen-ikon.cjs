const fs = require('fs'), vm = require('vm')
const D = process.env.HOME + '/.vscode/extensions/devchauhan.reicon-1.0.5/dist/icons.js'
const ctx = { window: {} }; vm.createContext(ctx)
vm.runInContext(fs.readFileSync(D, 'utf8'), ctx)
const data = ctx.window.REICON_DATA

const PAKAI = {
  home: 'home', model: 'cpu', kembali: 'arrow-left', hapus: 'trash',
  scan: 'radar', segarkan: 'refresh', waktu: 'clock', tambah: 'plus',
}
const badan = []
for (const [kunci, nama] of Object.entries(PAKAI)) {
  const ikon = data[nama]
  if (!ikon) throw new Error('ikon tidak ada: ' + nama)
  const svg = ikon.weights.Outline || ikon.weights.Filled
  if (!svg) throw new Error('tanpa weight: ' + nama)
  // Pembungkus clip yang tidak memotong apa pun dibuang beserta <defs>-nya.
  // Reicon membungkus sebagian ikon dalam `<g clip-path>` yang menunjuk
  // `<rect width="24" height="24">` — seluas viewBox, jadi nol efek. Yang
  // dibawanya justru masalah: `id` yang di-hardcode, dan ikon yang sama muncul
  // berkali-kali di satu halaman. Dua elemen dengan `id` sama adalah HTML tak
  // sah, dan `url(#id)` kemudian menunjuk yang mana pun yang lebih dulu.
  let bersih = svg
  const clipNoop = /<g clip-path="url\(#([^)]+)\)">([\s\S]*)<\/g><defs><clipPath id="\1"><rect width="24" height="24"[^>]*\/><\/clipPath><\/defs>/
  const m = bersih.match(clipNoop)
  if (m) bersih = m[2]

  // Tidak boleh ada `id` yang lolos: satu saja akan menggandakan diri begitu
  // ikonnya dipakai dua kali di satu halaman.
  if (/\sid="/.test(bersih)) {
    throw new Error(`ikon ${nama} masih membawa id= — perlu penanganan khusus`)
  }

  // JSX menolak atribut kebab-case milik SVG mentah.
  const jsx = bersih
    .replace(/fill-rule=/g, 'fillRule=').replace(/clip-rule=/g, 'clipRule=')
    .replace(/stroke-width=/g, 'strokeWidth=').replace(/stroke-linecap=/g, 'strokeLinecap=')
    .replace(/stroke-linejoin=/g, 'strokeLinejoin=').replace(/stroke-miterlimit=/g, 'strokeMiterlimit=')
    .replace(/clip-path=/g, 'clipPath=')
  badan.push(`  ${kunci}: (\n    <>${jsx}</>\n  ),`)
}

fs.writeFileSync('components/Ikon.tsx', `/**
 * Ikon dari pustaka Reicon (ekstensi VS Code devchauhan.reicon, 2.630 ikon,
 * gaya Outline). Di-inline sebagai path, bukan dipasang sebagai dependensi:
 * yang dipakai cuma delapan, dan satu paket npm untuk delapan path adalah
 * megabyte yang tidak perlu ditarik maupun diaudit.
 *
 * Semua path memakai \`stroke="currentColor"\` atau \`fill="currentColor"\`,
 * jadi warnanya mengikuti \`color\` induknya — tidak ada satu pun warna
 * ditulis di sini, dan palet di globals.css tetap satu-satunya sumber warna.
 *
 * Digenerate ulang dengan menambah entri di PAKAI pada skrip generator; jangan
 * disunting tangan.
 */
const PATH = {
${badan.join('\n')}
} as const

export type NamaIkon = keyof typeof PATH

/**
 * \`aria-hidden\` sebagai default, karena hampir semua ikon di sini duduk di
 * sebelah teks yang sudah mengatakan hal yang sama — mengumumkannya dua kali
 * memperlambat screen reader tanpa menambah informasi. Ikon yang berdiri
 * sendiri wajib diberi \`judul\`.
 */
export function Ikon({
  nama,
  judul,
  ukuran = 16,
}: {
  nama: NamaIkon
  judul?: string
  ukuran?: number
}) {
  return (
    <svg
      className="ikon"
      width={ukuran}
      height={ukuran}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={judul === undefined ? true : undefined}
      role={judul === undefined ? undefined : 'img'}
      focusable="false"
    >
      {judul !== undefined && <title>{judul}</title>}
      {PATH[nama]}
    </svg>
  )
}
`)
fs.writeFileSync(process.argv[2], 'ikon digenerate: ' + Object.keys(PAKAI).join(', '))
