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

  const port = opts.port ?? 9222
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
