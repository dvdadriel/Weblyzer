import { describe, it, expect } from 'vitest'
import { tafsirkanAgy } from '../lib/ai/agy.ts'

const galat = (code: string | number, message = 'Command failed') =>
  Object.assign(new Error(message), { code })

describe('tafsirkanAgy', () => {
  it('menjelaskan CLI yang tidak terpasang di server', () => {
    const h = tafsirkanAgy(galat('ENOENT'), '', '', 100)
    expect(h.ok).toBe(false)
    // Bedanya penting: "agy tidak ada" di mesin server, bukan di komputer
    // orang yang membuka halamannya. Tanpa itu ia akan memasang agy di
    // laptopnya dan bingung kenapa tetap gagal.
    expect(h.ok === false && h.galat).toMatch(/PATH server/)
  })

  it('menyebut batas waktunya saat timeout', () => {
    const h = tafsirkanAgy(galat('ETIMEDOUT'), '', '', 100)
    expect(h.ok === false && h.galat).toMatch(/180 detik/)
  })

  it('memakai stderr, bukan pesan Node yang tidak menjelaskan apa pun', () => {
    const h = tafsirkanAgy(galat(1), 'ada di stdout', 'Not logged in. Run `agy login`.', 100)
    expect(h.ok === false && h.galat).toBe('Not logged in. Run `agy login`.')
  })

  it('jatuh ke pesan Error kalau stderr kosong', () => {
    const h = tafsirkanAgy(galat(1, 'meledak'), '', '   ', 100)
    expect(h.ok === false && h.galat).toBe('meledak')
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
