import { test, expect } from 'vitest'
import { startFixtureServer } from './fixture-server.ts'
import { visit, normalizeUrl } from '../lib/scanners/visit.ts'

test('normalizeUrl tetap membuang fragment dan mengurutkan query', () => {
  expect(normalizeUrl('http://a.test/x/#bagian')).toBe('http://a.test/x')
  expect(normalizeUrl('http://a.test/')).toBe('http://a.test/')
  expect(normalizeUrl('http://a.test/x?b=2&a=1')).toBe('http://a.test/x?a=1&b=2')
})

test('mencatat status, tautan, dan finalUrl untuk halaman biasa', async () => {
  const server = await startFixtureServer('basic')
  try {
    const visits = await visit(server.url, { maxPages: 20 })
    const root = visits.find((v) => v.url === `${server.url}/`)
    expect(root?.statusCode).toBe(200)
    expect(root?.finalUrl).toBe(`${server.url}/`)
    expect(root?.redirects).toEqual([])
    expect(root?.links.length).toBeGreaterThan(0)
    expect(root?.title).toBe('Beranda Fixture')
  } finally {
    await server.close()
  }
})

test('merekam pesan konsol, exception, dan request gagal', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    expect(page).toBeDefined()

    const levels = page!.console.map((c) => c.level)
    expect(levels).toContain('error')
    expect(levels).toContain('warning')
    expect(page!.console.some((c) => c.text.includes('kesalahan pertama'))).toBe(true)
    expect(page!.console.some((c) => c.text.includes('peringatan pertama'))).toBe(true)

    expect(page!.pageErrors.some((e) => e.includes('meledak setelah muat'))).toBe(true)
  } finally {
    await server.close()
  }
})

test('merekam status setiap resource, termasuk yang rusak', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    const rusak = page!.resources.filter((r) => r.status >= 400)
    expect(rusak.some((r) => r.url.endsWith('/gambar-hilang.png'))).toBe(true)
  } finally {
    await server.close()
  }
})

test('merekam header respons halaman', async () => {
  const server = await startFixtureServer('basic')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    expect(page!.responseHeaders['content-type']).toContain('text/html')
  } finally {
    await server.close()
  }
})

test('mencatat teks terlihat agar halaman kosong dapat dikenali', async () => {
  const server = await startFixtureServer('basic')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    expect(page!.textLength).toBeGreaterThan(10)
  } finally {
    await server.close()
  }
})

test('isi yang dirender setelah load tetap terukur', async () => {
  const server = await startFixtureServer('spa')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    expect(page!.textLength).toBeGreaterThanOrEqual(50)
  } finally {
    await server.close()
  }
})

test('mencatat jumlah media agar halaman gambar-saja tidak dianggap kosong', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    expect(page!.mediaCount).toBeGreaterThanOrEqual(1)
  } finally {
    await server.close()
  }
})

test('URL yang benar-benar diminta dua kali hanya tercatat sekali', async () => {
  const server = await startFixtureServer('kembar-fetch')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    const dua = page!.resources.filter((r) => r.url.endsWith('/dua-kali.json'))
    expect(dua).toHaveLength(1)
  } finally {
    await server.close()
  }
})

test('URL tanpa host ditolak alih-alih dikembalikan ngawur', () => {
  for (const raw of ['mailto:a@b.test', 'javascript:void 0', 'about:blank']) {
    expect(() => normalizeUrl(raw)).toThrow(/tanpa host/)
  }
})

test('status dokumen dipulihkan ketika navigasi kehabisan waktu', async () => {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    if (req.url === '/menggantung.js') return // sengaja tidak pernah menjawab
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(
      '<!doctype html><title>Hidup</title><script src="/menggantung.js"></script><h1>Halaman ini hidup</h1>',
    )
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port

  try {
    const [page] = await visit(`http://127.0.0.1:${port}`, { maxPages: 1, timeoutMs: 3_000 })
    expect(page!.error).toBeDefined()
    expect(page!.statusCode).toBe(200) // bukan 0
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})

test('navigasi yang melempar dicatat dengan error dan tidak menular', async () => {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    if (req.url === '/loop') {
      res.writeHead(302, { location: '/loop' }).end()
      return
    }
    if (req.url === '/p1' || req.url === '/p2') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!doctype html><title>Sehat</title><h1>Halaman sehat di sini</h1>')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(
      '<!doctype html><title>Root</title><a href="/loop">loop</a><a href="/p1">p1</a><a href="/p2">p2</a>',
    )
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`

  try {
    const visits = await visit(base, { maxPages: 10 })
    const byUrl = new Map(visits.map((v) => [v.url, v]))
    expect(byUrl.get(`${base}/loop`)?.statusCode).toBe(0)
    expect(byUrl.get(`${base}/loop`)?.error).toContain('ERR_TOO_MANY_REDIRECTS')
    expect(byUrl.get(`${base}/p1`)?.statusCode).toBe(200)
    expect(byUrl.get(`${base}/p2`)?.statusCode).toBe(200)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})

test('redirect dicatat dengan rantainya dan finalUrl', async () => {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    if (req.url === '/lama') {
      res.writeHead(301, { location: '/tengah' }).end()
      return
    }
    if (req.url === '/tengah') {
      res.writeHead(302, { location: '/baru' }).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Baru</title><h1>Halaman tujuan akhir</h1>')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`

  try {
    const visits = await visit(`${base}/lama`, { maxPages: 1 })
    const v = visits[0]!
    expect(v.url).toBe(`${base}/lama`)
    expect(v.finalUrl).toBe(`${base}/baru`)
    expect(v.statusCode).toBe(200)
    expect(v.redirects.map((h) => h.status)).toEqual([301, 302])
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})

test('merekam header Set-Cookie apa adanya, termasuk bila ada beberapa', async () => {
  const { createServer } = await import('node:http')
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/html',
      'set-cookie': ['sesi=abc; Path=/', 'pilihan=gelap; Path=/; SameSite=Lax'],
    })
    res.end('<!doctype html><title>Kue</title><h1>Halaman dengan dua cookie di sini</h1>')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port

  try {
    const [page] = await visit(`http://127.0.0.1:${port}`, { maxPages: 1 })
    expect(page!.setCookies).toHaveLength(2)
    expect(page!.setCookies.some((c) => c.startsWith('sesi='))).toBe(true)
    expect(page!.setCookies.some((c) => c.includes('SameSite=Lax'))).toBe(true)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})
