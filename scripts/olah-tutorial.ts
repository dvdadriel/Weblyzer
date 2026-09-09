import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Mengolah rekaman mentah menjadi MP4 dan GIF.
 *
 * Dipisah dari `rekam-tutorial.ts` supaya pasca-produksi bisa diulang tanpa
 * memindai Nike lagi — dan pemindaian itu yang paling lama serta paling
 * membebani situs orang lain.
 *
 * Jalankan: node scripts/olah-tutorial.ts
 */

const DOCS = join(process.cwd(), 'docs')
const MENTAH = join(DOCS, 'tutorial-mentah.webm')
const FASE = join(DOCS, 'tutorial-fase.json')

/**
 * Percepatan untuk fase menunggu.
 *
 * Bukan dipotong, hanya dipercepat: penonton perlu melihat bahwa pemindaian
 * memang berjalan bermenit-menit dan halaman menyegarkan dirinya sendiri.
 * Memotongnya akan membuat alat ini tampak instan, dan orang yang mencobanya
 * akan mengira ada yang rusak saat menunggu.
 */
const PERCEPATAN = 8

type Fase = { nama: string; mulai: number; akhir: number; cepat: boolean }

function ff(args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
}

function durasi(berkas: string): number {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', berkas,
  ])
  return Number(String(out).trim())
}

function main(): number {
  if (!existsSync(MENTAH) || !existsSync(FASE)) {
    console.error(`Rekaman mentah tidak ada. Jalankan dulu: node scripts/rekam-tutorial.ts`)
    return 1
  }

  const { fase } = JSON.parse(readFileSync(FASE, 'utf8')) as { fase: Fase[] }
  const panjangMentah = durasi(MENTAH)
  console.log(`Mentah: ${panjangMentah.toFixed(1)}s, ${fase.length} fase`)

  // Potongan dibuat berurutan mengikuti fase. Yang `cepat` dipercepat, sisanya
  // apa adanya — lalu semuanya digabung. Memakai satu filter kompleks untuk
  // seluruh video akan bekerja juga, tapi jauh lebih sulit dibaca dan salah
  // satu potongan yang keliru merusak seluruh keluaran tanpa jelas di mana.
  const potongan: string[] = []
  const petaWaktu: { nama: string; mulai: number; cepat: boolean }[] = []
  let jam = 0

  fase.forEach((f, i) => {
    const keluar = join(DOCS, `.potong-${String(i).padStart(2, '0')}.mp4`)
    const panjang = f.akhir - f.mulai
    if (panjang <= 0.2) return

    // Dicatat sebelum `jam` bertambah: `mulai` adalah posisi potongan ini di
    // video final, yaitu total durasi semua potongan sebelumnya.
    petaWaktu.push({ nama: f.nama, mulai: jam, cepat: f.cepat })

    // `-r 25` memaksa frame rate konstan pada SEMUA potongan.
    //
    // Tanpa itu `concat -c copy` menggabungkan potongan bertimebase berbeda
    // dan hasilnya bergeser: terukur, tabel Bug muncul di detik 32 sementara
    // perhitungan mengatakan 25,7 — dan `tutorial.md` jadi menunjuk ke adegan
    // yang salah.
    const umum = ['-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24',
                  '-pix_fmt', 'yuv420p', '-r', '25', '-fps_mode', 'cfr']
    ff([
      '-ss', String(f.mulai), '-t', String(panjang), '-i', MENTAH,
      ...(f.cepat ? ['-vf', `setpts=PTS/${PERCEPATAN}`] : []),
      ...umum, keluar,
    ])

    // Durasi DIUKUR, bukan dihitung. Perhitungan `panjang / PERCEPATAN`
    // ternyata tidak sama dengan yang benar-benar dihasilkan ffmpeg, dan
    // satu-satunya cara mengetahuinya adalah menanyakan berkasnya.
    const nyata = durasi(keluar)
    potongan.push(keluar)
    console.log(
      `  ${f.nama}: ${panjang.toFixed(1)}s` +
        (f.cepat ? ` → ${nyata.toFixed(1)}s (${PERCEPATAN}×)` : ''),
    )
    jam += nyata
  })

  const daftar = join(DOCS, '.gabung.txt')
  writeFileSync(daftar, potongan.map((p) => `file '${p}'`).join('\n'))

  const mp4 = join(DOCS, 'tutorial.mp4')
  ff(['-f', 'concat', '-safe', '0', '-i', daftar, '-c', 'copy', mp4])
  console.log(`\nMP4: ${mp4} (${durasi(mp4).toFixed(1)}s)`)

  // GIF pendek dari fase "Hasil Bug" — bagian yang paling menjelaskan apa
  // yang dilakukan alat ini tanpa perlu konteks. Palet dua lintasan supaya
  // warnanya tidak pecah; GIF satu lintasan pada UI berwarna menghasilkan
  // dithering yang membuat teks kecil sulit dibaca.
  const target = petaWaktu.find((p) => p.nama.startsWith('Hasil Bug'))
  if (target) {
    const palet = join(DOCS, '.palet.png')
    const gif = join(DOCS, 'tutorial.gif')
    const DETIK_GIF = 14
    ff(['-ss', String(target.mulai), '-t', String(DETIK_GIF), '-i', mp4,
        '-vf', 'fps=10,scale=900:-1:flags=lanczos,palettegen=max_colors=128', palet])
    ff(['-ss', String(target.mulai), '-t', String(DETIK_GIF), '-i', mp4, '-i', palet,
        '-lavfi', 'fps=10,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3',
        gif])
    rmSync(palet, { force: true })
    console.log(`GIF: ${gif}`)
  } else {
    console.log('GIF dilewati: fase "Hasil Bug" tidak ada di rekaman')
  }

  // Daftar bertimestamp, menggantikan caption di video. Waktunya dihitung dari
  // durasi potongan SETELAH percepatan, bukan dari rekaman mentah — kalau
  // tidak, timestampnya menunjuk ke tempat yang salah tepat setelah fase
  // pertama yang dipercepat.
  const jam2 = (d: number) =>
    `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(Math.floor(d % 60)).padStart(2, '0')}`

  writeFileSync(
    join(DOCS, 'tutorial.md'),
    [
      '# Tutorial Weblyzer',
      '',
      `Rekaman alur lengkap: menambahkan situs, memindai dua aspek, membuka`,
      `detail temuan, dan mengunduh Excel. Situs yang dipindai **nike.com**,`,
      `dibatasi ${8} halaman.`,
      '',
      `Berkas: \`tutorial.mp4\` (${durasi(mp4).toFixed(0)} detik) dan \`tutorial.gif\`.`,
      '',
      '## Yang terjadi kapan',
      '',
      '| Waktu | Adegan |',
      '|---|---|',
      ...petaWaktu.map(
        (p) => `| ${jam2(p.mulai)} | ${p.nama}${p.cepat ? ` — dipercepat ${PERCEPATAN}×` : ''} |`,
      ),
      '',
      '## Catatan',
      '',
      `Dua fase menunggu dipercepat ${PERCEPATAN}×, bukan dipotong. Pemindaian`,
      'berjalan di proses terpisah dan memang butuh bermenit-menit; memotongnya',
      'akan membuat alat ini tampak instan, dan orang yang mencobanya akan',
      'mengira ada yang rusak saat menunggu.',
      '',
      'Halaman menyegarkan dirinya sendiri setiap lima detik selama pemindaian',
      'berjalan, lalu berganti sendiri ke hasil. Tidak ada progress bar: proses',
      'pemindai tidak melaporkan satu pun angka progres, dan batang yang',
      'bergerak tanpa tahu apa-apa adalah tepat jenis kebohongan yang dilarang',
      'di `docs/PRODUCT.md`.',
      '',
      'Rekaman dijalankan dengan database sementara sendiri, bukan `data.db` —',
      'alur ini menambahkan situs lalu memindainya, dan keduanya menulis.',
      '',
      'Untuk merekam ulang:',
      '',
      '```bash',
      'node scripts/rekam-tutorial.ts   # memindai nike.com, ~3 menit',
      'node scripts/olah-tutorial.ts    # ffmpeg: percepat, gabung, GIF',
      '```',
    ].join('\n'),
  )
  console.log(`Catatan: ${join(DOCS, 'tutorial.md')}`)

  for (const p of potongan) rmSync(p, { force: true })
  rmSync(daftar, { force: true })
  return 0
}

process.exit(main())
