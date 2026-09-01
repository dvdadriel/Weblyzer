import { createServer } from 'node:net'
import { chromium, type Browser } from 'playwright'
import lighthouse from 'lighthouse'

export type Strategy = 'mobile' | 'desktop'

export type LighthouseTarget = {
  url: string
  strategy: Strategy
}

export type AuditResult = {
  id: string
  title: string
  score: number
  /** `binary` berarti ada-atau-tidak-ada. Selain itu berupa pengukuran. */
  displayMode: string
}

export type LighthouseScores = {
  perf: number
  a11y: number
  bestPractices: number
  seo: number
}

export type LighthouseResult = {
  url: string
  strategy: Strategy
  scores: LighthouseScores
  /** Hanya audit yang gagal (skor < 1). */
  audits: AuditResult[]
  error?: string
}

const SKOR_KOSONG: LighthouseScores = { perf: 0, a11y: 0, bestPractices: 0, seo: 0 }

const EMULASI = {
  mobile: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  desktop: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
} as const

function persen(nilai: number | null | undefined): number {
  return typeof nilai === 'number' ? Math.round(nilai * 100) : 0
}

/**
 * Meminta port bebas dari sistem operasi.
 *
 * Port debugging bersifat global se-mesin, jadi angka tetap seperti 9222 membuat
 * dua pengukuran yang berjalan bersamaan menempel ke browser yang sama dan gagal
 * dengan "An internal Chrome error occurred". Itu bukan masalah test saja:
 * `drainQueue` berjalan dengan concurrency 3, sehingga dua situs yang diukur di
 * malam yang sama akan bertabrakan.
 *
 * ponytail: socket probe ditutup sebelum Chromium mengikatnya, jadi ada celah
 * TOCTOU kecil. Sistem operasi praktis tidak pernah memberikan port ephemeral
 * yang sama dua kali berdekatan; kalau kelak terbukti bertabrakan, jalur
 * peningkatannya adalah menahan socket tetap terbuka dan menyerahkan
 * file descriptor-nya, atau mencoba ulang sekali dengan port baru.
 */
async function portBebas(): Promise<number> {
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  await new Promise<void>((r) => server.close(() => r()))
  return port
}

/**
 * Rantai antrian se-proses. Lighthouse menyimpan `performance.mark()` secara
 * global **per proses**, jadi port debugging yang berbeda tidak cukup: dua
 * panggilan `runLighthouse` yang berjalan bersamaan tetap saling menimpa dan
 * salah satunya gagal dengan "The 'start lh:runner:gather' performance mark has
 * not been set" — kehilangan pengukuran tanpa suara.
 *
 * Terukur: dua panggilan serentak menghasilkan satu skor 100 dan satu error.
 * Ini penting di produksi, bukan cuma di test — `drainQueue` berjalan dengan
 * concurrency 3, sehingga dua situs yang diukur di malam yang sama akan kena.
 *
 * Antrian, bukan penolakan: pemanggil kedua menunggu, tidak kehilangan
 * pekerjaannya.
 */
let rantai: Promise<unknown> = Promise.resolve()

function berbaris<T>(kerja: () => Promise<T>): Promise<T> {
  const hasil = rantai.then(kerja, kerja)
  // Rantai tidak boleh putus karena satu kegagalan.
  rantai = hasil.then(
    () => undefined,
    () => undefined,
  )
  return hasil
}

/**
 * Menjalankan Lighthouse untuk sederet target, **berurutan**.
 *
 * Berurutan bukan pilihan gaya: Lighthouse memakai `performance.mark()` global,
 * sehingga dua run bersamaan dalam satu proses saling menimpa dan gagal dengan
 * "The 'start lh:runner:gather' performance mark has not been set". Port
 * debugging berbeda tidak menolong. Paralelisme sejati memerlukan satu proses
 * anak per run — belum dibangun karena pada 10,7 detik per halaman, mode sample
 * selesai 3,6 menit per situs.
 *
 * Mengumpulkan, tidak menilai — `lib/analyzers/lighthouse.ts` yang menilai.
 */
export async function runLighthouse(
  targets: LighthouseTarget[],
  opts: { port?: number } = {},
): Promise<LighthouseResult[]> {
  if (targets.length === 0) return []
  return berbaris(() => jalankanBerurutan(targets, opts))
}

async function jalankanBerurutan(
  targets: LighthouseTarget[],
  opts: { port?: number },
): Promise<LighthouseResult[]> {
  const port = opts.port ?? (await portBebas())
  const hasil: LighthouseResult[] = []
  const browser: Browser = await chromium.launch({
    args: [`--remote-debugging-port=${port}`],
  })

  try {
    for (const target of targets) {
      try {
        const jalan = await lighthouse(target.url, {
          port,
          output: 'json',
          logLevel: 'silent',
          formFactor: target.strategy,
          screenEmulation: EMULASI[target.strategy],
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        })

        if (!jalan) throw new Error('Lighthouse tidak mengembalikan hasil')
        const lhr = jalan.lhr

        // Halaman yang gagal dimuat tidak melempar: Lighthouse tetap
        // mengembalikan LHR, tetapi dengan `runtimeError` dan semua skor null.
        if (lhr.runtimeError) throw new Error(lhr.runtimeError.message)

        hasil.push({
          url: target.url,
          strategy: target.strategy,
          scores: {
            perf: persen(lhr.categories['performance']?.score),
            a11y: persen(lhr.categories['accessibility']?.score),
            bestPractices: persen(lhr.categories['best-practices']?.score),
            seo: persen(lhr.categories['seo']?.score),
          },
          audits: Object.values(lhr.audits)
            .filter((a) => a.score !== null && a.score < 1)
            .map((a) => ({
              id: a.id,
              title: a.title,
              score: a.score ?? 0,
              displayMode: a.scoreDisplayMode,
            })),
        })
      } catch (err) {
        // Satu halaman yang gagal tidak boleh menghentikan sisanya, sama seperti
        // pada kunjungan browser.
        hasil.push({
          url: target.url,
          strategy: target.strategy,
          scores: { ...SKOR_KOSONG },
          audits: [],
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } finally {
    await browser.close()
  }

  return hasil
}
