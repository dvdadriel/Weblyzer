import { konfigurasiAi, BASE_URL } from '../../lib/ai/konfigurasi.ts'
import { Ikon } from '../../components/Ikon.tsx'
import { tServer } from '../../lib/i18n/server.ts'

export const dynamic = 'force-dynamic'

/**
 * Halaman ini MEMBACA, tidak menulis.
 *
 * Dulu ia berupa form yang menyimpan API key terenkripsi ke database. Itu
 * hilang bersama akunnya, dan penggantinya bukan form yang menulis ke `.env`:
 * jalur "browser menulis berkas konfigurasi di mesin Anda" adalah kode yang
 * harus benar-benar benar, demi menghemat satu kali buka editor.
 *
 * Jadi yang ditampilkan di sini adalah keadaan sebenarnya beserta variabel
 * yang harus diisi — dan kalau ada yang salah, kalimatnya menyebut variabel
 * mana, bukan "AI tidak aktif".
 */
export default async function Model() {
  const t = await tServer()
  const cfg = konfigurasiAi()

  return (
    <>
      <header className="dashboard-header">
        <div className="dashboard-atas">
          <h1 className="halaman-judul">{t('model.judul')}</h1>
        </div>
        <p className="halaman-teks">{t('model.teks1')}</p>
        <p className="halaman-teks">{t('model.teks2')}</p>
      </header>

      <div className="model">
        <p className="model-status">
          {cfg.siap ? (
            <span className="model-hasil ok">
              <Ikon nama="ceklis" ukuran={13} />{' '}
              {t('model.aktif', { jalur: cfg.konfigurasi.jalur, model: cfg.konfigurasi.model })}
            </span>
          ) : (
            /* Sebabnya ditulis mentah, bukan diringkas jadi "belum aktif".
               Inilah bedanya antara pesan yang bisa ditindaklanjuti dan pesan
               yang membuat orang menebak variabel mana yang kurang. */
            <span className="model-hasil gagal">
              <Ikon nama="alert" ukuran={13} /> {cfg.sebab}
            </span>
          )}
        </p>
      </div>

      <pre className="model-env">{CONTOH}</pre>

      <div
        className="catatan-sumber"
        style={{ marginTop: 'var(--s-5)', borderLeftColor: 'var(--ink)' }}
      >
        <Ikon nama="sparkle" ukuran={14} />
        <span>{t('model.catatanAi')}</span>
      </div>

      <div className="catatan-sumber" style={{ marginTop: 'var(--s-4)' }}>
        <Ikon nama="perisai" ukuran={14} />
        <span>{t('model.catatanNama', { daftar: Object.keys(BASE_URL).join(', ') })}</span>
      </div>
    </>
  )
}

/**
 * Contoh `.env`, ditulis apa adanya sebagai teks.
 *
 * Tiga jalur ditunjukkan sekaligus karena pertanyaan yang dibawa orang ke
 * halaman ini justru perbandingannya: mana yang butuh kunci, mana yang tidak,
 * dan bagaimana bentuknya untuk penyedia yang bukan Anthropic.
 */
const CONTOH = `# Pilih SATU. Ganti nilainya, lalu jalankan ulang server.

# 1. Anthropic — API key sendiri
WEBLYZER_AI=anthropic
WEBLYZER_AI_MODEL=claude-opus-5
WEBLYZER_AI_API_KEY=sk-ant-...

# 2. NVIDIA NIM (atau groq, openrouter, together, openai)
WEBLYZER_AI=nim
WEBLYZER_AI_MODEL=meta/llama-3.3-70b-instruct
WEBLYZER_AI_API_KEY=nvapi-...

# 3. Model lokal — tanpa kunci sama sekali
WEBLYZER_AI=ollama
WEBLYZER_AI_MODEL=llama3.3

# 4. CLI agy di mesin ini, login sendiri seperti claude
WEBLYZER_AI=agy
WEBLYZER_AI_MODEL=gemini-3.1-pro-high

# Penyedia yang namanya belum terdaftar tetap bisa dipakai, asal ia bicara
# protokol OpenAI — sebut base URL-nya sendiri:
# WEBLYZER_AI=apa-pun
# WEBLYZER_AI_BASE_URL=https://contoh.test/v1
`
