import { konfigurasiOauth } from '../../lib/auth/oauth-google.ts'
import { FormMasuk } from '../../components/FormMasuk.tsx'
import { tServer, localeSekarang } from '../../lib/i18n/server.ts'
import type { Kunci } from '../../lib/i18n/index.ts'
import { Ikon } from '../../components/Ikon.tsx'

export const dynamic = 'force-dynamic'

/** Pesan galat dari redirect callback OAuth. Kodenya pendek supaya tidak
 *  memenuhi URL; teksnya di sini supaya bisa diterjemahkan nanti. */
const GALAT_OAUTH: Record<string, Kunci> = {
  'oauth-mati': 'masuk.galatOauthMati',
  state: 'masuk.galatState',
  tukar: 'masuk.galatTukar',
  token: 'masuk.galatToken',
  'tidak-terdaftar': 'masuk.galatTidakTerdaftar',
}

export default async function Masuk({
  searchParams,
}: {
  searchParams: Promise<{ galat?: string }>
}) {
  const { galat } = await searchParams
  const oauth = konfigurasiOauth()
  const t = await tServer()
  const locale = await localeSekarang()
  const kunciOauth = galat ? GALAT_OAUTH[galat] : undefined
  const pesanOauth = kunciOauth ? t(kunciOauth) : undefined

  return (
    <>
      <header className="dashboard-header">
        <div className="dashboard-atas">
          <h1 className="halaman-judul">{t('masuk.judul')}</h1>
        </div>
        <p className="halaman-teks">{t('masuk.teks')}</p>
      </header>

      {pesanOauth && (
        <p className="model-hasil gagal" role="alert">
          <Ikon nama="alert" ukuran={13} /> {pesanOauth}
        </p>
      )}

      <FormMasuk locale={locale} />

      {/* Tombol Google hanya ada kalau kredensialnya ada. Menampilkannya lalu
          gagal setelah diklik adalah jalan buntu; tidak menampilkannya sama
          sekali adalah jawaban yang jujur. */}
      {oauth && (
        <form action="/auth/google" method="get" style={{ marginTop: 'var(--s-4)' }}>
          <button type="submit" className="tombol">
            {t('masuk.google')}
          </button>
        </form>
      )}

      <div className="catatan-sumber" style={{ marginTop: 'var(--s-5)' }}>
        <Ikon nama="perisai" ukuran={14} />
        <span>{t('masuk.tanpaDaftar')}</span>
      </div>
    </>
  )
}
