import { db } from '../../lib/ui/db.ts'
import { konfigurasiEfektif, BASE_URL } from '../../lib/ai/konfigurasi.ts'
import { bacaPilihanCli } from '../../lib/repos/konfig.ts'
import { PilihCli } from '../../components/PilihCli.tsx'
import { Ikon } from '../../components/Ikon.tsx'
import { tServer, localeSekarang } from '../../lib/i18n/server.ts'

export const dynamic = 'force-dynamic'

/**
 * Dua hal di satu halaman, dan pembagiannya bukan selera:
 *
 * - **Jalur CLI bisa dipilih di sini.** `claude` dan `agy` memakai loginnya
 *   sendiri di mesin ini, jadi memilih salah satunya berarti menyimpan dua
 *   kata dan tidak ada rahasia yang menyeberang lewat form.
 * - **API key hanya dari `.env`.** Menyimpannya dari browser berarti rahasia
 *   lewat form, tersimpan di berkas database yang tidak terenkripsi, dan
 *   muncul di layar siapa pun yang membuka halaman ini.
 *
 * Karena itu bagian bawah halaman ini menampilkan contoh `.env` sebagai teks
 * yang bisa disalin, bukan sebagai form.
 */
export default async function Model() {
  const t = await tServer()
  const locale = await localeSekarang()
  const pilihan = bacaPilihanCli(db())
  const cfg = konfigurasiEfektif(db())

  return (
    <>
      <header className="dashboard-header">
        <div className="dashboard-atas">
          <h1 className="halaman-judul">{t('model.judul')}</h1>
        </div>
        <p className="halaman-teks">{t('model.teks1')}</p>
        <p className="halaman-teks">{t('model.teks2')}</p>
      </header>

      <p className="model-status">
        {cfg.siap ? (
          <span className="model-hasil ok">
            <Ikon nama="ceklis" ukuran={13} />{' '}
            {t('model.aktif', {
              jalur: cfg.konfigurasi.jalur === 'cli' ? cfg.konfigurasi.cli : cfg.konfigurasi.jalur,
              model: cfg.konfigurasi.model,
            })}
            {' · '}
            {/* Dari mana konfigurasinya datang ikut disebut. Tanpa itu, orang
                yang mengubah `.env` lalu tidak melihat perubahan tidak punya
                cara tahu bahwa pilihan di halaman ini yang sedang menang. */}
            {pilihan ? t('model.sumberWeb') : t('model.sumberEnv')}
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

      <PilihCli pilihan={pilihan} locale={locale} />

      <div
        className="catatan-sumber"
        style={{ marginTop: 'var(--s-5)', borderLeftColor: 'var(--ink)' }}
      >
        <Ikon nama="perisai" ukuran={14} />
        <span>{t('model.catatanKunci')}</span>
      </div>

      <pre className="model-env">{CONTOH}</pre>

      <div className="catatan-sumber" style={{ marginTop: 'var(--s-4)' }}>
        <Ikon nama="sparkle" ukuran={14} />
        <span>{t('model.catatanNama', { daftar: Object.keys(BASE_URL).join(', ') })}</span>
      </div>

      <div className="catatan-sumber" style={{ marginTop: 'var(--s-4)' }}>
        <Ikon nama="sparkle" ukuran={14} />
        <span>{t('model.catatanAi')}</span>
      </div>
    </>
  )
}

/**
 * Contoh `.env` untuk jalur yang BUTUH kunci — dan hanya itu.
 *
 * `claude` dan `agy` tidak ada di sini, karena keduanya dipilih lewat form di
 * atas. Menampilkan keduanya di dua tempat sekaligus berarti dua cara
 * melakukan hal yang sama, dan pertanyaan "yang mana yang berlaku" untuk
 * setiap orang yang membacanya.
 */
const CONTOH = `# Untuk model yang memakai API key. Ganti nilainya, lalu
# jalankan ulang server.

# Anthropic
WEBLYZER_AI=anthropic
WEBLYZER_AI_MODEL=claude-opus-5
WEBLYZER_AI_API_KEY=sk-ant-...

# NVIDIA NIM (atau groq, openrouter, together, openai)
WEBLYZER_AI=nim
WEBLYZER_AI_MODEL=meta/llama-3.3-70b-instruct
WEBLYZER_AI_API_KEY=nvapi-...

# Model lokal — tanpa kunci sama sekali
WEBLYZER_AI=ollama
WEBLYZER_AI_MODEL=llama3.3

# Penyedia yang namanya belum terdaftar tetap bisa dipakai, asal ia bicara
# protokol OpenAI — sebut base URL-nya sendiri:
# WEBLYZER_AI=apa-pun
# WEBLYZER_AI_BASE_URL=https://contoh.test/v1
`
