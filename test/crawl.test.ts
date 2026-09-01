import { test, expect } from 'vitest'
import { startFixtureServer } from './fixture-server.ts'
import { crawl, normalizeUrl } from '../lib/scanners/crawl.ts'

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
