import { test, expect } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { startFixtureServer } from './fixture-server.ts'
import { crawl, normalizeUrl } from '../lib/scanners/crawl.ts'

const HTML = 'text/html; charset=utf-8'

/** Menutup server node:http dan menunggu sampai benar-benar berhenti. */
function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  )
}

/** Membuka server pada port tertentu; gagal bila port sudah dipakai. */
function listenOn(
  handler: Parameters<typeof createServer>[1],
  port: number,
): Promise<Server> {
  const server = createServer(handler)
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

test('normalizeUrl membuang fragment dan garis miring akhir', () => {
  expect(normalizeUrl('http://a.test/x/#bagian')).toBe('http://a.test/x')
  expect(normalizeUrl('http://a.test/')).toBe('http://a.test/')
  expect(normalizeUrl('http://a.test/x?b=2&a=1')).toBe('http://a.test/x?a=1&b=2')
})

test('menelusuri seluruh halaman internal dan mencatat status code', async () => {
  const server = await startFixtureServer('basic')
  try {
    const pages = await crawl(server.url, { maxPages: 20 })
    const byUrl = new Map(pages.map((p) => [p.url, p]))

    expect(byUrl.get(`${server.url}/`)?.statusCode).toBe(200)
    expect(byUrl.get(`${server.url}/a.html`)?.statusCode).toBe(200)
    expect(byUrl.get(`${server.url}/b.html`)?.statusCode).toBe(200)
    expect(byUrl.get(`${server.url}/tidak-ada.html`)?.statusCode).toBe(404)
  } finally {
    await server.close()
  }
})

test('tautan eksternal tidak ikut ditelusuri', async () => {
  const server = await startFixtureServer('basic')
  try {
    const pages = await crawl(server.url, { maxPages: 20 })
    expect(pages.every((p) => p.url.startsWith(server.url))).toBe(true)
  } finally {
    await server.close()
  }
})

test('anchor pada URL yang sama tidak menghasilkan halaman kembar', async () => {
  const server = await startFixtureServer('basic')
  try {
    const pages = await crawl(server.url, { maxPages: 20 })
    const aPages = pages.filter((p) => p.url === `${server.url}/a.html`)
    expect(aPages).toHaveLength(1)
  } finally {
    await server.close()
  }
})

test('maxPages menghentikan penelusuran', async () => {
  const server = await startFixtureServer('basic')
  try {
    const pages = await crawl(server.url, { maxPages: 2 })
    expect(pages).toHaveLength(2)
  } finally {
    await server.close()
  }
})

test('setiap halaman mencatat waktu muat', async () => {
  const server = await startFixtureServer('basic')
  try {
    const pages = await crawl(server.url, { maxPages: 3 })
    expect(pages.every((p) => p.loadMs >= 0)).toBe(true)
  } finally {
    await server.close()
  }
})

test('satu halaman gagal tidak meracuni halaman berikutnya', async () => {
  const server = await startFixtureServer('rusak')
  try {
    const pages = await crawl(server.url, { maxPages: 20 })
    const zero = pages.filter((p) => p.statusCode === 0)
    expect(zero).toHaveLength(0)
    expect(pages.filter((p) => p.statusCode === 200).length).toBeGreaterThanOrEqual(3)
  } finally {
    await server.close()
  }
})

test('navigasi yang melempar tidak menular ke halaman sesudahnya', async () => {
  // Reproduksi langsung A1: /loop mengarahkan ke dirinya sendiri sehingga
  // Chromium melempar net::ERR_TOO_MANY_REDIRECTS. Tanpa memulihkan page,
  // navigasi berikutnya ke /p1 dan /p2 ikut gagal dengan status 0.
  const server = createServer((req, res) => {
    switch (req.url) {
      case '/':
        res.writeHead(200, { 'content-type': HTML })
        res.end(
          '<!doctype html><title>Beranda</title><h1>Beranda</h1>' +
            '<a href="/loop">Loop</a><a href="/p1">P1</a><a href="/p2">P2</a>',
        )
        return
      case '/loop':
        res.writeHead(302, { location: '/loop' })
        res.end()
        return
      case '/p1':
      case '/p2':
        res.writeHead(200, { 'content-type': HTML })
        res.end(`<!doctype html><title>${req.url}</title><h1>${req.url}</h1>`)
        return
      default:
        res.writeHead(404, { 'content-type': HTML })
        res.end('<!doctype html><title>404</title><h1>Tidak ditemukan</h1>')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`

  try {
    const pages = await crawl(base, { maxPages: 20 })
    const byUrl = new Map(pages.map((p) => [p.url, p]))

    expect(byUrl.get(`${base}/`)?.statusCode).toBe(200)
    expect(byUrl.get(`${base}/loop`)?.statusCode).toBe(0)
    expect(byUrl.get(`${base}/p1`)?.statusCode).toBe(200)
    expect(byUrl.get(`${base}/p2`)?.statusCode).toBe(200)
  } finally {
    await closeServer(server)
  }
})

test('tautan ke host yang hanya berawalan sama tidak ikut ditelusuri', async () => {
  // origin http://127.0.0.1:PORT tidak boleh cocok dengan http://127.0.0.1:PORT0
  // (prefix string yang sama, origin berbeda). Port dipilih eksplisit agar
  // pasangan berawalan sama benar-benar terbentuk.
  let a: Server | undefined
  let b: Server | undefined
  let portA = 0
  let portB = 0

  const handlerB: Parameters<typeof createServer>[1] = (_req, res) => {
    res.writeHead(200, { 'content-type': HTML })
    res.end('<!doctype html><title>Rahasia</title><h1>Rahasia</h1><a href="/dalam.html">Dalam</a>')
  }

  for (let attempt = 0; attempt < 40 && !b; attempt += 1) {
    const candidate = 4000 + Math.floor(Math.random() * 2000) // <= 6553, jadi *10 muat
    const neighbour = candidate * 10
    try {
      a = await listenOn((req, res) => {
        if (req.url === '/') {
          res.writeHead(200, { 'content-type': HTML })
          res.end(
            `<!doctype html><title>Beranda</title><h1>Beranda</h1>` +
              `<a href="/sendiri.html">Sendiri</a>` +
              `<a href="http://127.0.0.1:${neighbour}/rahasia.html">Tetangga</a>`,
          )
          return
        }
        res.writeHead(200, { 'content-type': HTML })
        res.end('<!doctype html><title>Sendiri</title><h1>Sendiri</h1>')
      }, candidate)
      b = await listenOn(handlerB, neighbour)
      portA = candidate
      portB = neighbour
    } catch {
      if (a) await closeServer(a).catch(() => {})
      a = undefined
      b = undefined
    }
  }

  if (!a || !b) throw new Error('Tidak menemukan pasangan port berawalan sama yang bebas')
  expect(String(portB).startsWith(String(portA))).toBe(true)

  try {
    const pages = await crawl(`http://127.0.0.1:${portA}`, { maxPages: 20 })
    expect(pages.some((p) => p.url.includes(`:${portB}`))).toBe(false)
    expect(pages.every((p) => new URL(p.url).origin === `http://127.0.0.1:${portA}`)).toBe(true)
  } finally {
    await closeServer(a)
    await closeServer(b)
  }
})
