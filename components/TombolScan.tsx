'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { jalankanScan } from '../app/actions.ts'

export type Kategori = 'bugs' | 'console' | 'security' | 'lighthouse'

/**
 * Menjalankan pemindaian kategori ini, atau melaporkan bahwa satu pemindaian
 * sedang berjalan.
 *
 * Yang ditampilkan saat berjalan sengaja BUKAN progress bar dan bukan spinner.
 * Pemindaian berlangsung di proses lain dan kita tidak punya satu pun angka
 * progres darinya — batang yang bergerak tanpa tahu apa-apa adalah tepat jenis
 * kebohongan yang dilarang PRODUCT.md. Yang kita tahu cuma dua hal, dan cuma
 * itu yang ditulis: sedang berjalan, dan sejak jam berapa.
 *
 * Penandanya `[..]`, meneruskan kosakata penanda yang sudah ada
 * (`[!!] [!] [~] [.] [ok] [--]`) alih-alih memperkenalkan ikon. Titik ganda
 * terbaca sebagai "belum selesai" tanpa perlu animasi.
 */
export function TombolScan({
  siteId,
  kategori,
  path,
  berjalan,
}: {
  siteId: number
  kategori: Kategori
  path: string
  berjalan: { mulai: string } | null
}) {
  const [galat, setGalat] = useState<string | null>(null)
  const [menunggu, mulai] = useTransition()
  const router = useRouter()

  if (berjalan) {
    return (
      <p className="jalan" role="status">
        <span className="jalan-tanda" aria-hidden="true">
          [..]
        </span>
        {/* "situs ini", bukan kategori dan bukan tipe run: tombolnya memang mati
            di SEMUA tab karena satu crawl memakai satu browser. Tanpa kata itu,
            menekan "security" lalu menemukan tombol mati di "bugs" terbaca
            seperti kerusakan. Tipe run internal (`full`) sengaja tidak disebut —
            itu nama cara sistem dibangun, bukan nama yang dikenali pemakai. */}
        Memindai situs ini sejak {berjalan.mulai}.{' '}
        <button
          className="jalan-segarkan"
          type="button"
          onClick={() => router.refresh()}
        >
          periksa lagi
        </button>
      </p>
    )
  }

  return (
    <div className="bilah-aksi">
      <button
        className="tombol"
        type="button"
        disabled={menunggu}
        onClick={() =>
          mulai(async () => {
            const hasil = await jalankanScan(siteId, kategori, path)
            setGalat(hasil?.error ?? null)
          })
        }
      >
        {menunggu ? 'memulai' : `jalankan scan ${kategori}`}
      </button>

      {galat && (
        <span className="jalan-galat" role="alert">
          {galat}
        </span>
      )}
    </div>
  )
}
