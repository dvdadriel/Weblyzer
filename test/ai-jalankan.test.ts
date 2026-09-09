import { describe, it, expect } from 'vitest'
import { tafsirkanGalat, tafsirkanValidasi, BATAS_KELUARAN, BATAS_MS } from '../lib/ai/jalankan.ts'

/**
 * Meniru bentuk galat SDK tanpa memasang klien sungguhan.
 *
 * SDK Anthropic membedakan kelas galatnya lewat `name`, dan itulah yang
 * dipetakan `tafsirkanGalat`. Menguji lewat API nyata berarti suite yang butuh
 * jaringan, kunci sungguhan, dan kegagalan yang harus dipancing.
 */
function galat(nama: string, pesan = `${nama} terjadi`): Error {
  const e = new Error(pesan)
  e.name = nama
  return e
}

describe('tafsirkanGalat', () => {
  it('kunci tidak berlaku disampaikan sebagai itu, bukan "gagal"', () => {
    const h = tafsirkanGalat(galat('AuthenticationError'))
    expect(h.galat).toMatch(/API key tidak berlaku/)
    // Menyebut jalan keluarnya, bukan cuma sebabnya.
    expect(h.galat).toMatch(/halaman Model/)
  })

  it('izin dibedakan dari kunci salah', () => {
    // Kunci yang benar tapi tidak berhak tidak boleh disuruh diganti.
    expect(tafsirkanGalat(galat('PermissionDeniedError')).galat).toMatch(/izin/)
  })

  it('model yang tidak tersedia dibedakan', () => {
    expect(tafsirkanGalat(galat('NotFoundError')).galat).toMatch(/tidak tersedia/)
  })

  it('batas permintaan dibedakan dari kunci salah', () => {
    expect(tafsirkanGalat(galat('RateLimitError')).galat).toMatch(/[Bb]atas permintaan/)
  })

  it('masalah jaringan menyebut batas waktunya', () => {
    const h = tafsirkanGalat(galat('APIConnectionTimeoutError'))
    expect(h.galat).toMatch(/jaringan/)
    expect(h.galat).toContain(String(BATAS_MS / 1000))
  })

  it('galat server disebut ada di sisi Anthropic', () => {
    expect(tafsirkanGalat(galat('InternalServerError')).galat).toMatch(/sisi mereka/)
  })

  it('galat tak dikenal diteruskan apa adanya', () => {
    // `ai_error` di database memang untuk dibaca manusia; meringkas pesan
    // aslinya jadi "gagal" menghapus satu-satunya petunjuk yang ada.
    expect(tafsirkanGalat(galat('SesuatuBaru', 'sesuatu yang belum pernah')).galat).toBe(
      'sesuatu yang belum pernah',
    )
  })

  it('menangani yang bukan Error sama sekali', () => {
    expect(tafsirkanGalat('cuma string').galat).toBe('cuma string')
    expect(tafsirkanGalat(null).galat).toBe('null')
  })

  it('memotong pesan yang sangat panjang', () => {
    expect(tafsirkanGalat(new Error('x'.repeat(5000))).galat.length).toBe(2000)
  })
})

describe('tafsirkanValidasi', () => {
  it('200 berarti kunci berlaku', () => {
    expect(tafsirkanValidasi(200)).toEqual({ ok: true })
  })

  it('401 berarti kunci salah', () => {
    const h = tafsirkanValidasi(401)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.pesan).toMatch(/tidak berlaku/)
  })

  it('403 dibedakan dari 401', () => {
    const h = tafsirkanValidasi(403)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.pesan).toMatch(/izin/)
  })

  it('429 berarti coba lagi, bukan kunci salah', () => {
    const h = tafsirkanValidasi(429)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.pesan).toMatch(/[Bb]atas permintaan/)
  })

  it('5xx berarti masalah di sisi Anthropic', () => {
    for (const s of [500, 502, 529]) {
      const h = tafsirkanValidasi(s)
      expect(h.ok, String(s)).toBe(false)
      expect(h.ok === false && h.pesan).toMatch(/sisi mereka/)
    }
  })

  it('status lain tetap dilaporkan dengan angkanya', () => {
    const h = tafsirkanValidasi(418)
    expect(h.ok === false && h.pesan).toContain('418')
  })
})

describe('batas keluaran', () => {
  it('masih 20.000 karakter', () => {
    // Alasannya tidak berubah dari versi CLI: ringkasan yang meledak
    // ukurannya berarti model mengembalikan sesuatu yang bukan ringkasan, dan
    // menyimpannya utuh berarti satu baris database berukuran megabyte.
    expect(BATAS_KELUARAN).toBe(20_000)
  })
})
