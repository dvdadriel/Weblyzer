import { describe, it, expect } from 'vitest'
import { tafsirkanOpenai } from '../lib/ai/openai.ts'

const jawab = (teks: string) => ({ choices: [{ message: { content: teks } }] })

describe('tafsirkanOpenai — berhasil', () => {
  it('mengambil isi pesan pertama', () => {
    const h = tafsirkanOpenai(200, jawab('Enam HTTP 500 di satu direktori.'), 9999)
    expect(h).toEqual({ ok: true, teks: 'Enam HTTP 500 di satu direktori.' })
  })

  it('membuang spasi dan memotong pada batasnya', () => {
    expect(tafsirkanOpenai(200, jawab('  x  '), 9999)).toEqual({ ok: true, teks: 'x' })
    expect(tafsirkanOpenai(200, jawab('y'.repeat(50)), 10)).toEqual({
      ok: true,
      teks: 'y'.repeat(10),
    })
  })
})

describe('tafsirkanOpenai — gagal', () => {
  it('memakai pesan penyedianya, bukan kode statusnya saja', () => {
    // "model not found", "invalid api key", dan "insufficient quota" masing-
    // masing butuh tindakan berbeda. Meringkasnya jadi "gagal" menghapus
    // satu-satunya petunjuk yang ada.
    const h = tafsirkanOpenai(400, { error: { message: 'Model xyz does not exist' } }, 9999)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.galat).toBe('400: Model xyz does not exist')
  })

  it('401 tanpa pesan tetap bisa ditindaklanjuti', () => {
    const h = tafsirkanOpenai(401, {}, 9999)
    expect(h.ok === false && h.galat).toMatch(/API key/)
  })

  it('404 menyebut kedua variabel yang mungkin salah', () => {
    // Di jalur ini 404 berarti dua hal yang berbeda jauh: base URL-nya salah,
    // atau modelnya. Menebak salah satunya membuang waktu orang.
    const h = tafsirkanOpenai(404, {}, 9999)
    expect(h.ok === false && h.galat).toMatch(/BASE_URL/)
    expect(h.ok === false && h.galat).toMatch(/MODEL/)
  })

  it('status tak terduga tetap disebut angkanya', () => {
    const h = tafsirkanOpenai(503, {}, 9999)
    expect(h.ok === false && h.galat).toMatch(/503/)
  })

  it('keluaran kosong adalah kegagalan, bukan keberhasilan', () => {
    // Menyimpan string kosong sebagai "berhasil" menampilkan panel ringkasan
    // yang melompong — lebih buruk daripada pesan galat.
    expect(tafsirkanOpenai(200, jawab('   '), 9999).ok).toBe(false)
    expect(tafsirkanOpenai(200, {}, 9999).ok).toBe(false)
    expect(tafsirkanOpenai(200, { choices: [] }, 9999).ok).toBe(false)
  })

  it('content null dari model penalaran tidak meledak', () => {
    // Sebagian model mengembalikan `content: null` dan menaruh jawabannya di
    // tempat lain. Yang penting: jangan melempar TypeError.
    const h = tafsirkanOpenai(200, { choices: [{ message: { content: null } }] }, 9999)
    expect(h.ok).toBe(false)
  })

  it('finish_reason ikut disebut kalau keluarannya kosong', () => {
    // `length` di sini berarti prompt-nya kepanjangan, dan itu tindakan yang
    // berbeda dari "coba lagi".
    const h = tafsirkanOpenai(
      200,
      { choices: [{ message: { content: '' }, finish_reason: 'length' }] },
      9999,
    )
    expect(h.ok === false && h.galat).toMatch(/length/)
  })
})
