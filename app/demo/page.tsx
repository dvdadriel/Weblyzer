import Link from 'next/link'
import {
  adaDemo,
  situsDemo,
  temuanDemo,
  hitungKategori,
  skorDemo,
  adalahKategori,
} from '../../lib/demo.ts'
import { KATEGORI, namaKategori, sumberKategori } from '../../lib/kategori.ts'
import { TabelDemo } from '../../components/TabelDemo.tsx'
import { GridSkor } from '../../components/GridSkor.tsx'
import { Ikon } from '../../components/Ikon.tsx'

export const dynamic = 'force-dynamic'

/**
 * Halaman demo, terpisah penuh dari aplikasi.
 *
 * Satu rute, dua parameter query — bukan pohon rute seperti `/sites/[id]/[kat]`.
 * Alasannya: halaman ini tidak boleh berbagi satu berkas pun dengan aplikasi
 * yang sudah jalan, dan `layout.tsx` di `app/sites/` membawa tombol scan,
 * ringkasan AI, dan tautan pengaturan — semuanya jalur tulis. Rute sendiri
 * berarti nol kemungkinan salah satu ikut terpakai.
 *
 * Query param, bukan segmen dinamis, karena keduanya sama-sama bisa dibagikan
 * sebagai tautan sementara query param tidak menuntut dua berkas rute lagi.
 */
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{ situs?: string; kategori?: string }>
}) {
  if (!adaDemo()) {
    return (
      <div className="kosong">
        <h2 className="kosong-judul">Data demo tidak ada di build ini</h2>
        <p className="kosong-teks">
          Halaman ini membaca <code className="akun-perintah">demo.db</code> yang dibundel
          bersama aplikasi. Berkasnya tidak ditemukan, jadi tidak ada yang bisa
          ditampilkan — bukan berarti demonya kosong.
        </p>
      </div>
    )
  }

  const daftar = situsDemo()
  const q = await searchParams
  const situs = daftar.find((s) => String(s.id) === q.situs) ?? daftar[0]
  if (!situs) {
    return (
      <div className="kosong">
        <h2 className="kosong-judul">Data demo kosong</h2>
        <p className="kosong-teks">Berkasnya ada tapi belum memuat satu situs pun.</p>
      </div>
    )
  }

  const kategori = q.kategori !== undefined && adalahKategori(q.kategori) ? q.kategori : 'bugs'
  const hitung = hitungKategori(situs.id)
  const tautan = (s: number, k: string) => `/demo?situs=${s}&kategori=${k}`

  /**
   * Kategori claude-seo yang kosong TIDAK dijalankan di demo ini.
   *
   * Tabelnya sengaja tidak dirender untuk keadaan itu: keadaan kosong
   * `TabelDemo` berbunyi "pemindaian berjalan dan tidak menemukan apa pun",
   * dan itu bertentangan langsung dengan catatan di atasnya yang berbunyi
   * "tidak dijalankan". Dua kalimat yang saling membantah di satu layar adalah
   * §2.2 yang dilanggar di tempat yang paling terlihat.
   */
  const tidakDijalankan = sumberKategori(kategori) === 'claude-seo' && hitung[kategori] === 0

  return (
    <>
      {/* Penjelasan lebih dulu, sebelum data apa pun. Halaman demo yang tidak
          menyatakan dirinya demo akan dibaca sebagai aplikasi yang tombolnya
          rusak. */}
      <div className="catatan-sumber" style={{ borderLeftColor: 'var(--sev-fixed)' }}>
        <Ikon nama="sparkle" ukuran={14} />
        <span>
          <strong>Demo read-only.</strong> Data nyata dari dua pemindaian sungguhan:
          Weblyzer diarahkan ke dirinya sendiri, dan apple.com sebagai situs publik
          pembanding. Tidak ada tombol pindai di sini — pemindaian menjalankan
          Chromium dan menulis ke database, dan keduanya butuh mesin sendiri.{' '}
          <a href="https://github.com/dvdadriel/Weblyzer">Kode dan alasannya di GitHub.</a>
        </span>
      </div>

      <header className="dashboard-header">
        <div className="dashboard-atas">
          <h1 className="halaman-judul">{situs.nama}</h1>
        </div>
        <p className="halaman-teks">{situs.base_url}</p>
        {daftar.length > 1 && (
          <nav className="saring" aria-label="Situs demo">
            {daftar.map((s) => (
              <Link
                key={s.id}
                href={tautan(s.id, kategori)}
                className="saring-item"
                aria-current={s.id === situs.id ? 'true' : undefined}
              >
                {s.nama} ({s.terbuka})
              </Link>
            ))}
          </nav>
        )}
      </header>

      <nav className="tab" aria-label="Kategori">
        {KATEGORI.map((k) => (
          <Link
            key={k}
            href={tautan(situs.id, k)}
            className="tab-item"
            aria-current={k === kategori ? 'page' : undefined}
          >
            <span>{namaKategori(k)}</span>
            {/* Hitungan di tab, yang aplikasi sungguhan tidak punya. Di demo ia
                menggantikan tombol pindai sebagai penunjuk arah: tanpanya orang
                membuka tab kosong satu per satu dan menyimpulkan alatnya tidak
                menemukan apa-apa. */}
            {hitung[k]! > 0 && <span className="tab-ai-tag">{hitung[k]}</span>}
          </Link>
        ))}
      </nav>

      {sumberKategori(kategori) === 'claude-seo' && (
        <p className="akun" role="note">
          <Ikon nama="kompas" ukuran={13} />
          <span>
            Kategori ini dinilai <strong>claude-seo</strong> lewat Claude Code headless,
            dan demo ini tidak menjalankannya — butuh login OAuth yang tidak ada di
            server. Kosong di sini berarti tidak dijalankan, bukan tidak ada temuan.
          </span>
        </p>
      )}

      {tidakDijalankan ? null : kategori === 'lighthouse' ? (
        <>
          <GridSkor baris={skorDemo(situs.id)} baseUrl={situs.base_url} />
          <TabelDemo
            baris={temuanDemo(situs.id, 'lighthouse')}
            baseUrl={situs.base_url}
            waktu={situs.waktu}
          />
        </>
      ) : (
        <TabelDemo
          baris={temuanDemo(situs.id, kategori)}
          baseUrl={situs.base_url}
          waktu={situs.waktu}
        />
      )}
    </>
  )
}
