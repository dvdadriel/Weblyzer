import { test, expect } from 'vitest'
import { startFixtureServer } from './fixture-server.ts'

test('menyajikan index.html pada root dan 404 untuk yang tidak ada', async () => {
  const server = await startFixtureServer('basic')
  try {
    const root = await fetch(server.url)
    expect(root.status).toBe(200)
    expect(await root.text()).toContain('Beranda Fixture')

    const missing = await fetch(`${server.url}/tidak-ada.html`)
    expect(missing.status).toBe(404)
  } finally {
    await server.close()
  }
})

test('setiap server memakai port berbeda sehingga test dapat berjalan paralel', async () => {
  const [a, b] = await Promise.all([startFixtureServer('basic'), startFixtureServer('basic')])
  try {
    expect(a.url).not.toBe(b.url)
  } finally {
    await Promise.all([a.close(), b.close()])
  }
})
