'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { jalankanScan } from '../app/actions.ts'

export type Kategori = 'bugs' | 'console' | 'security' | 'lighthouse'

/**
 * Label tombol per kategori. Tunggal dan huruf besar, berpasangan dengan label
 * tab — DESIGN.md mensyaratkan nama aksi yang sama sepanjang alur, dan kata
 * "scan" karena itu ikut dipakai di baris keadaan berjalan di bawah.
 */
const LABEL: Record<Kategori, string> = {
  bugs: 'Scan Bug',
  console: 'Scan Console',
  security: 'Scan Security',
  lighthouse: 'Scan Lighthouse',
}

/**
 * Jeda penyegaran otomatis selagi pemindaian berjalan.
 *
 * Pemindaian berlangsung menit-menitan, jadi lima detik sudah terasa seketika
 * tanpa membanjiri server: tiap siklus hanya satu kueri SQLite lokal. Yang
 * digantinya bukan kenyamanan tapi kebingungan — tanpa ini satu-satunya cara
 * mengetahui pemindaian sudah selesai adalah menekan tombol.
 */
const JEDA_SEGARKAN_MS = 5000

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

  // Halaman memeriksa dirinya sendiri selagi pemindaian berjalan, lalu berhenti
  // begitu selesai: `berjalan` menjadi null, efeknya dibersihkan, dan tidak ada
  // timer yang menggantung. Inilah "notifikasi" yang dimiliki alat ini —
  // layarnya berganti sendiri ke hasil.
  useEffect(() => {
    if (!berjalan) return
    const timer = setInterval(() => router.refresh(), JEDA_SEGARKAN_MS)
    return () => clearInterval(timer)
  }, [berjalan, router])

  if (berjalan) {
    return (
      <p className="jalan" role="status">
        <span className="jalan-tanda" aria-hidden="true">
          [..]
        </span>
        {/* "situs ini", bukan kategori: tombolnya memang mati di SEMUA tab
            karena satu crawl memakai satu browser. Tanpa kata itu, menekan
            Scan Security lalu menemukan tombol mati di Bug terbaca seperti
            kerusakan. Tipe run internal (`full`) sengaja tidak disebut — itu
            nama cara sistem dibangun, bukan nama yang dikenali pemakai. */}
        Scan situs ini berjalan sejak {berjalan.mulai}. Halaman ini akan
        berganti sendiri saat selesai.{' '}
        <button className="jalan-segarkan" type="button" onClick={() => router.refresh()}>
          Periksa Sekarang
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
        {menunggu ? 'Memulai…' : LABEL[kategori]}
      </button>

      {galat && (
        <span className="jalan-galat" role="alert">
          {galat}
        </span>
      )}
    </div>
  )
}
