import { describe, it, expect } from 'vitest'
import { tafsirkanAgy } from '../lib/ai/agy.ts'

const galat = (code: string | number, message = 'Command failed') =>
  Object.assign(new Error(message), { code })

/** Kegagalan batas waktu SEPERTI YANG SUNGGUHAN DILAPORKAN Node: `code: 1`
 *  dan `killed: true`, bukan `code: 'ETIMEDOUT'`. Terukur, bukan diduga. */
const kehabisanWaktu = () =>
  Object.assign(new Error('Command failed: agy --model x -p=' + 'y'.repeat(12000)), {
    code: 1,
    killed: true,
  })

describe('tafsirkanAgy', () => {
  it('menjelaskan CLI yang tidak terpasang', () => {
    const h = tafsirkanAgy(galat('ENOENT'), '', '', 100)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.galat).toMatch(/tidak ada di PATH/)
  })

  it('menyebut batas waktunya saat timeout', () => {
    const h = tafsirkanAgy(galat('ETIMEDOUT'), '', '', 100)
    expect(h.ok === false && h.galat).toMatch(/180 detik/)
  })

  it('timeout dikenali dari killed, bukan hanya dari ETIMEDOUT', () => {
    // Inilah bentuk yang benar-benar dilaporkan Node saat batas waktunya
    // terlewat. Versi pertama hanya memeriksa ETIMEDOUT, jadi kasus ini jatuh
    // ke cabang umum.
    const h = tafsirkanAgy(kehabisanWaktu(), '', '', 100)
    expect(h.ok === false && h.galat).toMatch(/180 detik/)
  })

  it('prompt tidak pernah ikut masuk ke pesan galat', () => {
    // `execFile` menyusun `err.message` sebagai "Command failed: " + seluruh
    // baris perintah, dan baris itu memuat prompt utuh — belasan kilobyte
    // temuan yang akan tersimpan di `runs.ai_error` lalu terpampang di panel
    // ringkasan.
    const h = tafsirkanAgy(kehabisanWaktu(), '', '', 100)
    expect(h.ok === false && h.galat).not.toMatch(/yyyy/)
    expect(h.ok === false && h.galat.length).toBeLessThan(200)
  })

  it('keluar tanpa pesan apa pun tetap menyebut kode keluarnya', () => {
    const h = tafsirkanAgy(galat(3, 'Command failed: agy -p=' + 'z'.repeat(5000)), '', '', 100)
    expect(h.ok === false && h.galat).toBe(
      'agy keluar dengan kode 3 tanpa keluaran maupun pesan galat.',
    )
  })

  it('pesan di stdout dipakai kalau stderr kosong', () => {
    // `agy` mencetak "error: interrupted" ke stdout, bukan stderr. Tanpa
    // cabang ini, satu-satunya petunjuk yang ada ikut terbuang.
    const h = tafsirkanAgy(galat(1, 'Command failed: agy'), 'error: interrupted', '', 100)
    expect(h.ok === false && h.galat).toBe('error: interrupted')
  })

  it('memakai stderr, bukan pesan Node yang tidak menjelaskan apa pun', () => {
    const h = tafsirkanAgy(galat(1), 'ada di stdout', 'Not logged in. Run `agy login`.', 100)
    expect(h.ok === false && h.galat).toBe('Not logged in. Run `agy login`.')
  })

  it('layar bantuan adalah kegagalan walau exit code 0', () => {
    // Kegagalan paling menyesatkan dari jalur ini: bentuk argumen yang salah
    // membuat agy mencetak bantuannya lalu keluar bersih, dan tanpa
    // pemeriksaan ini teks itu tersimpan sebagai "ringkasan" di tabel reports.
    const h = tafsirkanAgy(null, 'Usage of agy:\n  agy -p=...\nAvailable subcommands:\n', '', 9999)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.galat).toMatch(/layar bantuan/)
  })

  it('keluaran kosong adalah kegagalan', () => {
    expect(tafsirkanAgy(null, '   \n ', '', 100).ok).toBe(false)
  })

  it('memotong keluaran pada batasnya', () => {
    const h = tafsirkanAgy(null, 'x'.repeat(500), '', 10)
    expect(h.ok && h.teks).toBe('x'.repeat(10))
  })

  it('membuang spasi di ujung jawaban', () => {
    const h = tafsirkanAgy(null, '\n  SIAP  \n', '', 100)
    expect(h.ok && h.teks).toBe('SIAP')
  })
})
