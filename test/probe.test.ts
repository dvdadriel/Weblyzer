import { test, expect } from 'vitest'
import { createServer, type RequestListener } from 'node:http'
import { probeSite, JALUR_SENSITIF } from '../lib/scanners/probe.ts'

async function serverDengan(handler: RequestListener) {
  const server = createServer(handler)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

test('daftar jalur sensitif tetap dan pendek', () => {
  expect(JALUR_SENSITIF.length).toBeLessThanOrEqual(12)
  expect(JALUR_SENSITIF).toContain('/.env')
  expect(JALUR_SENSITIF).toContain('/.git/config')
})

test('situs bersih tidak menghasilkan temuan probe', async () => {
  const server = await serverDengan((_req, res) => {
    res.writeHead(404, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>404</title>')
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.exposed).toEqual([])
    expect(hasil.directoryListing).toEqual([])
  } finally {
    await server.close()
  }
})

test('file .env yang terbuka terdeteksi beserta isinya yang dipotong', async () => {
  const server = await serverDengan((req, res) => {
    if (req.url === '/.env') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('DB_PASSWORD=rahasia\nAPI_KEY=abc123\n')
      return
    }
    res.writeHead(404).end()
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.exposed.map((e) => e.path)).toEqual(['/.env'])
    expect(hasil.exposed[0]!.snippet).toContain('DB_PASSWORD')
    expect(hasil.exposed[0]!.snippet.length).toBeLessThanOrEqual(200)
  } finally {
    await server.close()
  }
})

test('halaman HTML biasa di jalur sensitif tidak dianggap terbuka', async () => {
  // Banyak SPA membalas 200 dengan index.html untuk path apa pun. Kalau tidak
  // dibedakan, setiap situs semacam itu menghasilkan sembilan temuan critical palsu.
  const server = await serverDengan((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><html><head><title>Aplikasi</title></head><body><div id="root"></div></body></html>')
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.exposed).toEqual([])
  } finally {
    await server.close()
  }
})

test('daftar direktori terdeteksi dari penanda khasnya', async () => {
  const server = await serverDengan((req, res) => {
    if (req.url === '/uploads/') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><head><title>Index of /uploads</title></head><body><h1>Index of /uploads</h1><pre><a href="../">../</a></pre></body></html>')
      return
    }
    res.writeHead(404).end()
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.directoryListing).toEqual(['/uploads/'])
  } finally {
    await server.close()
  }
})

test('respons kosong pada jalur sensitif tidak dianggap terbuka', async () => {
  const server = await serverDengan((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('')
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.exposed).toEqual([])
  } finally {
    await server.close()
  }
})

test('server yang mati tidak melempar, hanya melaporkan tanpa temuan', async () => {
  const hasil = await probeSite('http://127.0.0.1:1', { timeoutMs: 500 })
  expect(hasil.exposed).toEqual([])
  expect(hasil.tls).toBeNull()
})

test('situs http tidak diperiksa sertifikatnya', async () => {
  const server = await serverDengan((_req, res) => {
    res.writeHead(404).end()
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.tls).toBeNull()
  } finally {
    await server.close()
  }
})
