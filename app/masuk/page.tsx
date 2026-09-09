import { konfigurasiOauth } from '../../lib/auth/oauth-google.ts'
import { FormMasuk } from '../../components/FormMasuk.tsx'
import { Ikon } from '../../components/Ikon.tsx'

export const dynamic = 'force-dynamic'

/** Pesan galat dari redirect callback OAuth. Kodenya pendek supaya tidak
 *  memenuhi URL; teksnya di sini supaya bisa diterjemahkan nanti. */
const GALAT_OAUTH: Record<string, string> = {
  'oauth-mati': 'Masuk lewat Google belum dikonfigurasi di instance ini.',
  state: 'Permintaan masuk kedaluwarsa atau tidak cocok. Coba lagi dari awal.',
  tukar: 'Google menolak menukar kode masuk. Coba lagi.',
  token: 'Identitas dari Google tidak bisa diverifikasi.',
  'tidak-terdaftar':
    'Akun Google itu belum terdaftar di instance ini. Instance ini tidak menerima ' +
    'pendaftaran mandiri — minta pemiliknya membuatkan akun.',
}

export default async function Masuk({
  searchParams,
}: {
  searchParams: Promise<{ galat?: string }>
}) {
  const { galat } = await searchParams
  const oauth = konfigurasiOauth()
  const pesanOauth = galat ? GALAT_OAUTH[galat] : undefined

  return (
    <>
      <header className="dashboard-header">
        <div className="dashboard-atas">
          <h1 className="halaman-judul">Masuk</h1>
        </div>
        <p className="halaman-teks">
          Tanpa akun, semua aspek pemindaian tetap bisa dipakai — yang butuh akun hanya
          ringkasan AI, karena ia memakai API key milik Anda sendiri.
        </p>
      </header>

      {pesanOauth && (
        <p className="model-hasil gagal" role="alert">
          <Ikon nama="alert" ukuran={13} /> {pesanOauth}
        </p>
      )}

      <FormMasuk />

      {/* Tombol Google hanya ada kalau kredensialnya ada. Menampilkannya lalu
          gagal setelah diklik adalah jalan buntu; tidak menampilkannya sama
          sekali adalah jawaban yang jujur. */}
      {oauth && (
        <form action="/auth/google" method="get" style={{ marginTop: 'var(--s-4)' }}>
          <button type="submit" className="tombol">
            Masuk dengan Google
          </button>
        </form>
      )}

      <div className="catatan-sumber" style={{ marginTop: 'var(--s-5)' }}>
        <Ikon nama="perisai" ukuran={14} />
        <span>
          Instance ini tidak menerima pendaftaran mandiri. Akun dibuat oleh pemiliknya.
        </span>
      </div>
    </>
  )
}
