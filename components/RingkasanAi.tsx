'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ulangiRingkasan } from '../app/actions.ts'
import { Ikon } from './Ikon.tsx'
import type { RingkasanAi as Isi, StatusAi } from '../lib/ui/queries.ts'

/**
 * Merender paragraf beserta `kode` inline-nya.
 *
 * Bukan parser markdown, dan sengaja: keluaran model di sini adalah prosa
 * dengan sesekali nama file atau path di dalam backtick. Menarik parser
 * markdown penuh berarti satu dependensi baru — plus permukaan sanitasi HTML —
 * untuk dua hal yang selesai dalam sepuluh baris.
 *
 * Aman dari injeksi karena yang dibangun elemen React, bukan innerHTML: teks
 * apa pun dari model berakhir sebagai teks, bukan markup.
 */
function Prosa({ teks }: { teks: string }) {
  return (
    <>
      {teks
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p !== '')
        .map((p, i) => (
          <p key={i} className="ringkas-p">
            {p.split('`').map((bagian, j) =>
              // Indeks ganjil berada di antara sepasang backtick. Backtick yang
              // tidak berpasangan otomatis jadi teks biasa, bukan kode yang
              // menelan sisa paragraf.
              j % 2 === 1 ? <code key={j}>{bagian}</code> : bagian,
            )}
          </p>
        ))}
    </>
  )
}

/**
 * Ringkasan AI untuk satu situs.
 *
 * Selalu diberi label sebagai tulisan model, dengan nama model dan waktunya.
 * Tanpa itu, tiga paragraf prosa berbaur dengan data terukur di halaman yang
 * sama — dan pembacanya tidak punya cara membedakan angka yang diukur dari
 * dugaan yang ditulis.
 *
 * `status` dan `isi` datang dari kueri berbeda dengan sengaja: sebuah situs
 * bisa punya ringkasan lama yang masih berguna DAN percobaan terbaru yang
 * gagal. Menggabungkannya akan menyembunyikan kegagalan itu.
 */
export function RingkasanAi({
  isi,
  status,
  siteId,
  path,
}: {
  isi: Isi | null
  status: StatusAi | null
  siteId: number
  path: string
}) {
  const [galat, setGalat] = useState<string | null>(null)
  const [menunggu, mulai] = useTransition()
  const router = useRouter()

  // Tidak pernah dicoba dan tidak ada apa pun untuk ditampilkan: panel yang
  // menjelaskan ketiadaan dirinya sendiri cuma memakan ruang.
  if (isi === null && (status === null || status.status === 'not_needed')) return null

  const gagal = status?.status === 'failed'
  const dilewati = status?.status === 'skipped'

  function ulangi() {
    mulai(async () => {
      const hasil = await ulangiRingkasan(siteId, path)
      setGalat(hasil?.error ?? null)
      if (!hasil?.error) router.refresh()
    })
  }

  return (
    <section className="ringkas" aria-label="Ringkasan AI">
      {/* Kegagalan berada DI LUAR lipatan, dan itu bukan kebetulan: panel yang
          terlipat akan menyembunyikannya, dan kegagalan yang tak terlihat
          adalah kegagalan yang tak pernah diperbaiki. Pesan CLI-nya ditulis
          mentah — inilah bedanya antara "AI gagal", yang tidak bisa
          ditindaklanjuti, dan "gemini butuh GEMINI_API_KEY", yang bisa. */}
      {gagal && (
        <p className="ringkas-gagal" role="alert">
          <Ikon nama="alert" ukuran={14} />
          <span>Percobaan terakhir gagal{status?.model ? ` (${status.model})` : ''}:{' '}
            <span className="ringkas-mentah">{status?.galat ?? 'tanpa pesan'}</span>
          </span>
        </p>
      )}

      {dilewati && isi === null && (
        <p className="ringkas-lewat">
          Belum ada penyedia AI yang dipilih, jadi pemindaian jalan tanpa ringkasan.
        </p>
      )}

      {isi !== null && (
        <details className="ringkas-lipat" open>
          <summary className="ringkas-label">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Ikon nama="sparkle" ukuran={14} />
              <span>Ringkasan AI</span>
            </span>
            {isi.model !== null && <span className="ringkas-model-pill">{isi.model}</span>}
            {isi.waktu !== null && (
              <span style={{ fontSize: 'var(--t-mikro)', color: 'var(--ink-2)', fontWeight: 400, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <Ikon nama="waktu" ukuran={12} />
                {isi.waktu}
              </span>
            )}
          </summary>

          <div className="ringkas-isi">
            <Prosa teks={isi.teks} />
            {gagal && (
              <p className="ringkas-basi">
                Ringkasan di atas berasal dari peringkasan terakhir yang berhasil, bukan
                dari percobaan yang baru gagal.
              </p>
            )}
          </div>
        </details>
      )}

      <p className="ringkas-aksi">
        <button className="ringkas-ulang" type="button" onClick={ulangi} disabled={menunggu}>
          <Ikon nama="segarkan" ukuran={13} />
          {menunggu ? 'Meringkas…' : isi === null ? 'Ringkas Sekarang' : 'Ringkas Ulang'}
        </button>
      </p>

      {galat && (
        <p className="ringkas-gagal" role="alert">
          {galat}
        </p>
      )}
    </section>
  )
}
