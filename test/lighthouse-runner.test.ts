import { test, expect } from 'vitest'
import { createServer, type RequestListener } from 'node:http'
import { runLighthouse } from '../lib/scanners/lighthouse.ts'

async function serverDengan(handler: RequestListener) {
  const server = createServer(handler)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

const HALAMAN = `<!doctype html><html lang="id"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Halaman Uji Lighthouse</title></head>
<body><main><h1>Halaman Uji</h1><p>Teks yang cukup panjang agar halaman ini punya isi.</p></main></body></html>`

test('mengembalikan empat skor dan daftar audit untuk mobile', async () => {
  const server = await serverDengan((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(HALAMAN)
  })
  try {
    const hasil = await runLighthouse([{ url: server.url, strategy: 'mobile' }])
    expect(hasil).toHaveLength(1)
    const r = hasil[0]!
    expect(r.url).toBe(server.url)
    expect(r.strategy).toBe('mobile')
    expect(r.error).toBeUndefined()
    for (const kunci of ['perf', 'a11y', 'bestPractices', 'seo'] as const) {
      expect(typeof r.scores[kunci]).toBe('number')
      expect(r.scores[kunci]).toBeGreaterThanOrEqual(0)
      expect(r.scores[kunci]).toBeLessThanOrEqual(100)
    }
    expect(Array.isArray(r.audits)).toBe(true)
  } finally {
    await server.close()
  }
}, 90_000)

test('setiap audit membawa scoreDisplayMode agar yang binary bisa dipisahkan', async () => {
  const server = await serverDengan((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(HALAMAN)
  })
  try {
    const [r] = await runLighthouse([{ url: server.url, strategy: 'mobile' }])
    expect(r!.audits.every((a) => typeof a.displayMode === 'string')).toBe(true)
    expect(r!.audits.every((a) => typeof a.id === 'string' && a.id.length > 0)).toBe(true)
  } finally {
    await server.close()
  }
}, 90_000)

test('mobile dan desktop menghasilkan dua hasil terpisah', async () => {
  const server = await serverDengan((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(HALAMAN)
  })
  try {
    const hasil = await runLighthouse([
      { url: server.url, strategy: 'mobile' },
      { url: server.url, strategy: 'desktop' },
    ])
    expect(hasil.map((r) => r.strategy).sort()).toEqual(['desktop', 'mobile'])
  } finally {
    await server.close()
  }
}, 180_000)

test('halaman yang tidak terjangkau menghasilkan error, bukan lemparan', async () => {
  const hasil = await runLighthouse([{ url: 'http://127.0.0.1:1/', strategy: 'mobile' }])
  expect(hasil).toHaveLength(1)
  expect(hasil[0]!.error).toBeDefined()
  expect(hasil[0]!.audits).toEqual([])
}, 90_000)

test('daftar kosong tidak menyalakan browser', async () => {
  const hasil = await runLighthouse([])
  expect(hasil).toEqual([])
})
