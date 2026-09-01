import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'

const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

export type FixtureServer = {
  url: string
  close: () => Promise<void>
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

/**
 * Menyajikan satu folder fixture pada port acak. Port acak dipilih agar test
 * dapat berjalan paralel tanpa saling merebut port.
 */
export async function startFixtureServer(name: string): Promise<FixtureServer> {
  const root = join(FIXTURES_ROOT, name)

  const server: Server = createServer((req, res) => {
    const requested = new URL(req.url ?? '/', 'http://localhost')
    let pathname = decodeURIComponent(requested.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'

    // Menahan path traversal: file yang disajikan harus berada di dalam folder fixture.
    const filePath = normalize(join(root, pathname))
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden')
      return
    }

    readFile(filePath).then(
      (body) => {
        const ext = filePath.slice(filePath.lastIndexOf('.'))
        res.writeHead(200, { 'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream' })
        res.end(body)
      },
      () => {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<!doctype html><title>404</title><h1>Tidak ditemukan</h1>')
      },
    )
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}
