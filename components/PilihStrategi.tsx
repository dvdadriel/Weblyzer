'use client'

import { useState, useTransition } from 'react'
import { aturStrategi } from '../app/actions.ts'

/**
 * Menyalakan pengukuran desktop.
 *
 * Pilihan, bukan bawaan, karena biayanya nyata: setiap halaman diukur dua kali
 * per strategi — mekanisme irisan yang mematikan flapping Lighthouse — jadi
 * menyalakan desktop menggandakan waktu pengukuran. Angkanya disebut di layar
 * supaya keputusannya diambil dengan tahu harganya, bukan dengan menebak.
 */
export function PilihStrategi({
  siteId,
  keduanya,
}: {
  siteId: number
  keduanya: boolean
}) {
  const [galat, setGalat] = useState<string | null>(null)
  const [menunggu, mulai] = useTransition()
  // Keadaan lokal, bukan langsung dari prop.
  //
  // `checked` yang dibaca dari server baru berubah setelah `revalidatePath`
  // selesai, jadi selama transisi centangnya tetap terlihat mati — ditekan,
  // tidak terjadi apa-apa. Terbukti: Playwright menolak dengan "clicking the
  // checkbox did not change its state" padahal nilainya sudah tersimpan di
  // database. Ditampilkan optimistis, lalu dibalikkan kalau gagal.
  const [nyala, setNyala] = useState(keduanya)

  return (
    <span className="strategi">
      <label className="strategi-label">
        <input
          type="checkbox"
          checked={nyala}
          disabled={menunggu}
          onChange={(e) => {
            const minta = e.target.checked
            setNyala(minta)
            mulai(async () => {
              const hasil = await aturStrategi(siteId, minta)
              if (hasil?.error) {
                setGalat(hasil.error)
                // Dibalikkan ke keadaan server: centang yang tetap menyala
                // sesudah gagal akan membuat pemakai menunggu pengukuran
                // desktop yang tidak akan pernah dijalankan.
                setNyala(keduanya)
                return
              }
              setGalat(null)
            })
          }}
        />
        <span className="strategi-teks">Ukur desktop juga</span>
        <span className="strategi-biaya">
          {nyala ? ' · pengukuran jadi dua kali lebih lama' : ' · ~2x waktu pengukuran'}
        </span>
      </label>

      {galat !== null && (
        <span className="jalan-galat" role="alert">
          {galat}
        </span>
      )}
    </span>
  )
}
