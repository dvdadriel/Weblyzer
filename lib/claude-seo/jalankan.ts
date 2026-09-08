import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
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
    // stderr lebih berguna daripada pesan Error generik, tapi hanya kalau ada.
    // Pesan mentah dipertahankan: kegagalan yang diterjemahkan jadi kalimat
    // sopan akan menyembunyikan sebab yang sebenarnya bisa ditindaklanjuti.
    const pesan = stderr.trim() !== '' ? stderr.trim() : err.message
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
  return new Promise((resolve) => {
    const anak = execFile(
      'claude',
      ['-p', '--allowedTools', ...TOOLS],
      { cwd, timeout: batasMs, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => resolve(tafsirkan(err, stdout, stderr, batasMs)),
    )
    anak.stdin?.end(prompt)
  })
}
