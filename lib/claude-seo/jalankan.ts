import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export type HasilJalan =
  | { ok: true; teks: string }
  | { ok: false; galat: string }

/**
 * Batas waktu per aspek, dan keduanya jauh lebih besar daripada batas 90 detik
 * untuk ringkasan.
 *
 * GEO memeriksa segelintir halaman. Audit full menjelajah sampai `max_pages`
 * lalu men-spawn sampai 15 subagent, jadi puluhan menit adalah keadaan normal,
 * bukan tanda macet. Batas ini ada untuk menghentikan yang benar-benar
 * menggantung, bukan untuk memaksa cepat.
 */
export const BATAS_MS = {
  geo: 15 * 60_000,
  audit: 90 * 60_000,
} as const

/**
 * Tool yang diizinkan untuk sesi headless.
 *
 * Allowlist eksplisit, BUKAN `--dangerously-skip-permissions`. Skill
 * claude-seo memang butuh Bash (untuk `claude-seo run render_page.py`) dan
 * WebFetch, dan tanpa izin ia menggantung menunggu prompt yang tidak akan
 * pernah dijawab siapa pun — pemindaian ini tidak ada yang menonton. Task ikut
 * karena audit full mendelegasikan ke subagent; tanpanya ia jatuh ke mode
 * berurutan yang jauh lebih lambat.
 *
 * Yang sengaja TIDAK ada: tool apa pun yang menulis di luar direktori kerja
 * tidak bisa dicegah lewat daftar ini, jadi pembatasnya adalah `cwd` —
 * lihat `direktoriKerja`.
 */
const TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
  'WebFetch',
  'WebSearch',
  'Task',
  'Skill',
]

/**
 * Direktori kerja per situs.
 *
 * Skill audit menulis berkasnya sendiri (`{domain}-audit/audit-data.json`,
 * findings/*.md, dan PDF bila diminta). Itu berguna, jadi tidak dibuang ke
 * folder sementara — tapi juga tidak boleh mengotori repo, jadi seluruhnya
 * di-gitignore di satu tempat.
 */
export function direktoriKerja(siteId: number): string {
  const dir = join(process.cwd(), 'claude-seo-out', String(siteId))
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Berkas hasil yang ditulis model, dan sumber kebenaran yang sebenarnya.
 *
 * stdout ternyata kanal yang salah untuk sesi panjang: `claude -p`
 * mengembalikan pesan asisten **terakhir**, bukan transkripnya. Audit full
 * yang berhasil menulis JSON lalu menambahkan satu kalimat penutup
 * menghasilkan stdout 139 byte berbunyi "the audit JSON above is unchanged
 * and final" — JSON-nya hilang seluruhnya, setelah dua puluh menit bekerja.
 *
 * Berkas tidak punya masalah itu. Ia juga kebal terhadap tiga hal lain yang
 * sudah menggigit di fitur ini: exit code non-nol, `maxBuffer`, dan proses
 * yang dibunuh — hasil yang sudah tertulis tetap ada terlepas dari bagaimana
 * prosesnya berakhir.
 *
 * Namanya berawalan `weblyzer-` supaya tidak mungkin bertabrakan dengan
 * berkas yang ditulis skill claude-seo sendiri (`audit-data.json`, `crawl.json`).
 */
export const NAMA_HASIL = 'weblyzer-temuan.json'

/**
 * Menafsirkan hasil `execFile`.
 *
 * Dipisah supaya bisa diuji tanpa men-spawn apa pun — pola yang sama dengan
 * `tafsirkan` di `lib/ai/jalankan.ts`, dan alasannya sama: satu pemanggilan
 * sungguhan butuh menit dan jawabannya berbeda tiap kali.
 */
export function tafsirkan(
  err: (Error & { code?: string | number; killed?: boolean }) | null,
  stdout: string,
  stderr: string,
  batasMs: number,
): HasilJalan {
  if (err) {
    if (err.code === 'ENOENT') {
      return { ok: false, galat: 'claude tidak ditemukan di PATH' }
    }
    if (err.code === 'ETIMEDOUT' || err.killed === true) {
      return {
        ok: false,
        galat: `claude-seo tidak selesai dalam ${Math.round(batasMs / 60_000)} menit`,
      }
    }

    // Exit code non-nol TAPI ada keluaran: keluarannya dipakai.
    //
    // Versi pertama menyerah di sini, dan itu terbukti salah pada audit
    // sungguhan — `claude -p` keluar non-nol setelah empat menit dengan stderr
    // KOSONG, sementara skill-nya jelas sudah bekerja (crawl.json, sitemap.xml,
    // dan home-raw.html tertulis di direktori kerjanya). Membuang hasil kerja
    // sebanyak itu karena satu angka exit adalah kerugian yang tidak perlu.
    //
    // Aman karena `bacaTemuan` tetap menjadi penjaganya: keluaran yang bukan
    // JSON temuan akan ditolak di sana, dan job-nya gagal seperti seharusnya.
    // Yang berubah cuma satu — exit code tidak lagi memveto keluaran yang sah.
    if (stdout.trim() !== '') return { ok: true, teks: stdout }
    // Tanpa keluaran: stderr mentah kalau ada, karena kegagalan yang
    // diterjemahkan jadi kalimat sopan menyembunyikan sebab yang bisa
    // ditindaklanjuti. Kalau stderr juga kosong, exit code-nya disebutkan —
    // `Command failed: claude -p --allowedTools ...` tanpa apa pun lagi adalah
    // pesan yang muncul pada kegagalan nyata pertama, dan mendiagnosisnya
    // berarti menjalankan ulang seluruhnya.
    const pesan =
      stderr.trim() !== ''
        ? stderr.trim()
        : `claude keluar dengan kode ${err.code ?? '?'} tanpa keluaran maupun pesan galat`
    return { ok: false, galat: pesan.slice(0, 2000) }
  }
  if (stdout.trim() === '') {
    return {
      ok: false,
      galat: stderr.trim() !== '' ? stderr.trim().slice(0, 2000) : 'claude-seo tidak mengembalikan apa pun',
    }
  }
  return { ok: true, teks: stdout }
}

/**
 * Menjalankan satu prompt claude-seo secara headless.
 *
 * `maxBuffer` dinaikkan jauh di atas bawaan 1 MB: audit full bisa mengembalikan
 * JSON berisi ratusan temuan, dan `execFile` MEMBUNUH prosesnya begitu buffer
 * penuh — jadi batas yang terlalu kecil akan membuang audit sembilan puluh
 * menit tepat di langkah terakhir.
 */
export function jalankanClaudeSeo(
  prompt: string,
  siteId: number,
  batasMs: number,
): Promise<HasilJalan> {
  const cwd = direktoriKerja(siteId)
  const hasil = join(cwd, NAMA_HASIL)

  // Hasil run SEBELUMNYA dihapus lebih dulu, dan ini bukan kebersihan —
  // ini penjaga §2.2. Tanpa penghapusan ini, run yang gagal tanpa menulis apa
  // pun akan membaca berkas run kemarin dan melaporkannya sebagai hasil hari
  // ini: temuan yang sudah diperbaiki muncul lagi, dan yang baru tidak pernah
  // terlihat. Kegagalan akan menyamar jadi keberhasilan yang membeku.
  try {
    rmSync(hasil, { force: true })
  } catch {
    // Kalau berkasnya tidak bisa dihapus, `bacaHasil` di bawah akan membaca
    // yang basi. Lebih baik gagal keras daripada melaporkan data kemarin.
    return Promise.resolve({
      ok: false,
      galat: `Tidak bisa menghapus hasil run sebelumnya di ${hasil}`,
    })
  }

  return new Promise((resolve) => {
    const anak = execFile(
      'claude',
      ['-p', '--allowedTools', ...TOOLS],
      { cwd, timeout: batasMs, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        // Keluaran mentah selalu disimpan, berhasil maupun gagal.
        //
        // Bukan kemewahan: kegagalan pertama yang nyata memberi pesan
        // "Command failed" tanpa isi, dan satu-satunya cara mendiagnosisnya
        // adalah menjalankan ulang sembilan puluh menit. Ditulis ke direktori
        // kerja yang sudah di-gitignore, ditimpa tiap run — yang dibutuhkan
        // adalah kegagalan TERAKHIR, bukan arsipnya.
        try {
          writeFileSync(join(cwd, 'terakhir-stdout.txt'), stdout)
          writeFileSync(join(cwd, 'terakhir-stderr.txt'), stderr)
        } catch {
          // Gagal menulis catatan diagnosis tidak boleh menggagalkan analisis
          // yang hasilnya sudah ada di tangan.
        }
        // Berkas hasil menang atas stdout, apa pun yang terjadi pada
        // prosesnya. Kalau model sudah menuliskannya, pekerjaannya selesai —
        // exit code, stderr, dan kalimat penutup di stdout tidak mengubah itu.
        const dariBerkas = bacaHasil(hasil)
        if (dariBerkas !== null) {
          resolve({ ok: true, teks: dariBerkas })
          return
        }
        resolve(tafsirkan(err, stdout, stderr, batasMs))
      },
    )
    anak.stdin?.end(prompt)
  })
}

/** Membaca berkas hasil bila ada dan tidak kosong. `null` berarti model tidak
 *  pernah menulisnya, dan pemanggilnya jatuh ke stdout. */
function bacaHasil(path: string): string | null {
  try {
    const isi = readFileSync(path, 'utf8')
    return isi.trim() === '' ? null : isi
  } catch {
    return null
  }
}
