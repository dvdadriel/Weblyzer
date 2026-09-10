import { describe, it, expect } from 'vitest'
import { konfigurasiAi, jalurDari, BASE_URL } from '../lib/ai/konfigurasi.ts'

/**
 * Seluruh berkas ini memberi `env` sebagai objek biasa, tidak pernah menyentuh
 * `process.env`.
 *
 * Itu yang membuat test-nya tidak saling menimpa lewat lingkungan proses yang
 * sama — kelas kegagalan yang hanya muncul saat suite dijalankan bersamaan dan
 * mustahil ditelusuri dari pesan galatnya.
 */
const env = (o: Record<string, string>) => o

describe('belum dikonfigurasi', () => {
  it('WEBLYZER_AI kosong menyebut variabelnya', () => {
    const h = konfigurasiAi(env({}))
    expect(h.siap).toBe(false)
    // Bukan "AI tidak aktif". Pesan yang tidak menyebut variabel mana yang
    // kurang memaksa orang membaca kode untuk memakai fiturnya.
    expect(!h.siap && h.sebab).toMatch(/WEBLYZER_AI/)
  })

  it('menyebut bahwa pemindaian tetap jalan tanpa AI', () => {
    // Penting: AI mati BUKAN kerusakan. Kalimat yang berbunyi seperti galat
    // akan membuat orang mengira alatnya rusak.
    const h = konfigurasiAi(env({}))
    expect(!h.siap && h.sebab).toMatch(/tetap\s+jalan/)
  })
})

describe('jalur anthropic', () => {
  it('lengkap dengan kunci dan model', () => {
    const h = konfigurasiAi(
      env({ WEBLYZER_AI: 'anthropic', WEBLYZER_AI_MODEL: 'claude-opus-5', WEBLYZER_AI_API_KEY: 'sk-ant-x' }),
    )
    expect(h).toEqual({
      siap: true,
      konfigurasi: { jalur: 'anthropic', model: 'claude-opus-5', apiKey: 'sk-ant-x' },
    })
  })

  it('menerima ANTHROPIC_API_KEY yang sudah ada di mesin', () => {
    // Nama itu sudah dipakai SDK dan CLI Anthropic. Memaksa nama sendiri
    // berarti menyuruh orang menulis kunci yang sama dua kali.
    const h = konfigurasiAi(
      env({ WEBLYZER_AI: 'anthropic', WEBLYZER_AI_MODEL: 'claude-opus-5', ANTHROPIC_API_KEY: 'sk-ant-y' }),
    )
    expect(h.siap && h.konfigurasi.jalur === 'anthropic' && h.konfigurasi.apiKey).toBe('sk-ant-y')
  })

  it('WEBLYZER_AI_API_KEY menang atas ANTHROPIC_API_KEY', () => {
    const h = konfigurasiAi(
      env({
        WEBLYZER_AI: 'anthropic',
        WEBLYZER_AI_MODEL: 'claude-opus-5',
        WEBLYZER_AI_API_KEY: 'sk-ant-khusus',
        ANTHROPIC_API_KEY: 'sk-ant-umum',
      }),
    )
    expect(h.siap && h.konfigurasi.jalur === 'anthropic' && h.konfigurasi.apiKey).toBe(
      'sk-ant-khusus',
    )
  })

  it('tanpa kunci belum siap', () => {
    const h = konfigurasiAi(env({ WEBLYZER_AI: 'anthropic', WEBLYZER_AI_MODEL: 'claude-opus-5' }))
    expect(!h.siap && h.sebab).toMatch(/API_KEY/)
  })

  it('tanpa model belum siap', () => {
    const h = konfigurasiAi(env({ WEBLYZER_AI: 'anthropic', WEBLYZER_AI_API_KEY: 'sk-ant-x' }))
    expect(!h.siap && h.sebab).toMatch(/WEBLYZER_AI_MODEL/)
  })
})

describe('jalur openai — NIM dan sekeluarganya', () => {
  it('nama yang dikenal memakai base URL preset', () => {
    const h = konfigurasiAi(
      env({
        WEBLYZER_AI: 'nim',
        WEBLYZER_AI_MODEL: 'meta/llama-3.3-70b-instruct',
        WEBLYZER_AI_API_KEY: 'nvapi-x',
      }),
    )
    expect(h).toEqual({
      siap: true,
      konfigurasi: {
        jalur: 'openai',
        nama: 'nim',
        model: 'meta/llama-3.3-70b-instruct',
        apiKey: 'nvapi-x',
        baseUrl: BASE_URL.nim,
      },
    })
  })

  it('nama huruf besar tetap dikenali', () => {
    const h = konfigurasiAi(
      env({ WEBLYZER_AI: 'NIM', WEBLYZER_AI_MODEL: 'm', WEBLYZER_AI_API_KEY: 'k' }),
    )
    expect(h.siap).toBe(true)
  })

  it('base URL sendiri menang atas preset', () => {
    // Ini yang membuat NIM self-hosted memakai nama yang sama dengan hosted:
    // protokolnya identik, cuma alamatnya yang beda.
    const h = konfigurasiAi(
      env({
        WEBLYZER_AI: 'nim',
        WEBLYZER_AI_BASE_URL: 'http://localhost:8000/v1',
        WEBLYZER_AI_MODEL: 'm',
      }),
    )
    expect(h.siap && h.konfigurasi.jalur === 'openai' && h.konfigurasi.baseUrl).toBe(
      'http://localhost:8000/v1',
    )
  })

  it('nama tak dikenal tanpa base URL menyebut daftar yang ada', () => {
    const h = konfigurasiAi(env({ WEBLYZER_AI: 'entah', WEBLYZER_AI_MODEL: 'm' }))
    expect(h.siap).toBe(false)
    expect(!h.siap && h.sebab).toMatch(/WEBLYZER_AI_BASE_URL/)
    // Daftar nama yang sudah ada ikut disebut: itu yang mengubah galat menjadi
    // petunjuk.
    expect(!h.siap && h.sebab).toMatch(/groq/)
  })

  it('nama tak dikenal dengan base URL sendiri diterima', () => {
    // Penyedia baru tidak boleh butuh perubahan kode. Ini yang menjaminnya.
    const h = konfigurasiAi(
      env({
        WEBLYZER_AI: 'penyedia-yang-belum-ada',
        WEBLYZER_AI_BASE_URL: 'https://contoh.test/v1',
        WEBLYZER_AI_MODEL: 'm',
        WEBLYZER_AI_API_KEY: 'k',
      }),
    )
    expect(h.siap).toBe(true)
  })

  it('server lokal tidak dipaksa punya kunci', () => {
    // Ollama dan vLLM tidak memintanya, dan memaksanya berarti menyuruh orang
    // mengarang nilai untuk variabel yang tidak dibaca siapa pun.
    for (const nama of ['ollama', 'vllm']) {
      const h = konfigurasiAi(env({ WEBLYZER_AI: nama, WEBLYZER_AI_MODEL: 'llama3.3' }))
      expect(h.siap, nama).toBe(true)
      expect(h.siap && h.konfigurasi.jalur === 'openai' && h.konfigurasi.apiKey).toBe('')
    }
  })

  it('base URL lokal buatan sendiri juga bebas kunci', () => {
    for (const url of [
      'http://localhost:1234/v1',
      'http://127.0.0.1:8080/v1',
      'http://[::1]:8080/v1',
    ]) {
      const h = konfigurasiAi(
        env({ WEBLYZER_AI: 'x', WEBLYZER_AI_BASE_URL: url, WEBLYZER_AI_MODEL: 'm' }),
      )
      expect(h.siap, url).toBe(true)
    }
  })

  it('penyedia jauh tanpa kunci belum siap', () => {
    // Batas antara "lokal, bebas kunci" dan "jauh, wajib kunci" harus jatuh
    // pada host. Kalau tidak, permintaan tanpa auth dikirim ke internet dan
    // yang balik adalah 401 yang tidak menjelaskan apa pun.
    const h = konfigurasiAi(env({ WEBLYZER_AI: 'groq', WEBLYZER_AI_MODEL: 'm' }))
    expect(h.siap).toBe(false)
    expect(!h.siap && h.sebab).toMatch(/API_KEY/)
  })

  it('host yang cuma diawali "localhost" tidak dianggap lokal', () => {
    // `localhost.penyerang.test` bukan mesin ini. Tanpa jangkar pada pemisah,
    // domain seperti itu lolos sebagai lokal dan kuncinya tidak dipasang.
    const h = konfigurasiAi(
      env({
        WEBLYZER_AI: 'x',
        WEBLYZER_AI_BASE_URL: 'https://localhost.contoh.test/v1',
        WEBLYZER_AI_MODEL: 'm',
      }),
    )
    expect(h.siap).toBe(false)
  })
})

describe('jalur agy', () => {
  it('cukup modelnya, tanpa kunci', () => {
    const h = konfigurasiAi(env({ WEBLYZER_AI: 'agy', WEBLYZER_AI_MODEL: 'gemini-3.1-pro-high' }))
    expect(h).toEqual({
      siap: true,
      konfigurasi: { jalur: 'agy', model: 'gemini-3.1-pro-high' },
    })
  })

  it('menerima ejaan agy-cli dari konfigurasi lama', () => {
    const h = konfigurasiAi(env({ WEBLYZER_AI: 'agy-cli', WEBLYZER_AI_MODEL: 'm' }))
    expect(h.siap && h.konfigurasi.jalur).toBe('agy')
  })

  it('tanpa model menyebut cara mencari daftarnya', () => {
    const h = konfigurasiAi(env({ WEBLYZER_AI: 'agy' }))
    expect(!h.siap && h.sebab).toMatch(/agy models/)
  })
})

describe('spasi dan huruf', () => {
  it('spasi di sekitar nilai dibuang', () => {
    // Nilai yang ditempel dari terminal sering membawa spasi, dan kunci dengan
    // spasi di ujungnya ditolak penyedianya dengan 401 yang menuduh kuncinya
    // salah.
    const h = konfigurasiAi(
      env({
        WEBLYZER_AI: '  anthropic  ',
        WEBLYZER_AI_MODEL: ' claude-opus-5 ',
        WEBLYZER_AI_API_KEY: ' sk-ant-x ',
      }),
    )
    expect(h).toEqual({
      siap: true,
      konfigurasi: { jalur: 'anthropic', model: 'claude-opus-5', apiKey: 'sk-ant-x' },
    })
  })

  it('nilai yang isinya cuma spasi dianggap kosong', () => {
    const h = konfigurasiAi(env({ WEBLYZER_AI: '   ' }))
    expect(h.siap).toBe(false)
  })
})

describe('jalurDari', () => {
  it('memetakan nama ke jalurnya', () => {
    expect(jalurDari('anthropic')).toBe('anthropic')
    expect(jalurDari('agy')).toBe('agy')
    expect(jalurDari('agy-cli')).toBe('agy')
    expect(jalurDari('nim')).toBe('openai')
    expect(jalurDari('apa pun yang lain')).toBe('openai')
  })
})
