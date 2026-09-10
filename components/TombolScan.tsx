'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { jalankanScan } from '../app/actions.ts'
import { Ikon } from './Ikon.tsx'
import { GLIF_BERJALAN } from '../lib/glif.ts'
import { penerjemah, type Locale, type Kunci } from '../lib/i18n/index.ts'

export type Kategori =
  | 'bugs'
  | 'console'
  | 'security'
  | 'seo'
  | 'mobile'
  | 'geo'
  | 'audit'
  | 'lighthouse'

/** Kategori yang dijalankan claude-seo, bukan aturan deterministik. Keduanya
 *  jauh lebih lama dan memakai token, jadi tombolnya menyebutkan itu. */
const LEWAT_AI = new Set<Kategori>(['geo', 'audit'])

/**
 * Label tombol per kategori. Tunggal dan huruf besar, berpasangan dengan label
 * tab — DESIGN.md mensyaratkan nama aksi yang sama sepanjang alur, dan kata
 * "scan" karena itu ikut dipakai di baris keadaan berjalan di bawah.
 */
const LABEL: Record<Kategori, Kunci> = {
  bugs: 'scan.bugs',
  console: 'scan.console',
  security: 'scan.security',
  seo: 'scan.seo',
  mobile: 'scan.mobile',
  geo: 'scan.geo',
  audit: 'scan.audit',
  lighthouse: 'scan.lighthouse',
}

/**
 * Perkiraan lama untuk kategori yang lewat claude-seo.
 *
 * Ditulis di sebelah tombolnya, sebelum ditekan. Tombol yang tidak
 * memberitahukan bahwa ia akan sibuk sembilan puluh menit dan memakai token
 * adalah tombol yang menipu — dan ini satu-satunya aksi di seluruh aplikasi
 * yang biayanya tidak nol.
 */
const LAMA: Partial<Record<Kategori, string>> = {
  // Mobile Parity tidak memakai token sama sekali, tapi tetap disebut lamanya:
  // tiga konteks browser per halaman, dan orang yang menekan tombol tanpa
  // peringatan akan menyimpulkan tombolnya rusak.
  mobile: 'beberapa menit, tanpa token',
  geo: 'beberapa menit, memakai token',
  audit: 'bisa puluhan menit, memakai banyak token',
}

/**
 * Nama kategori dari tipe run yang tersimpan, untuk menyebut pemindaian yang
 * sedang berjalan. `full` muncul hanya dari pemindaian lewat CLI tanpa argumen
 * kategori; dari UI selalu satu kategori.
 */
const NAMA_RUN: Record<string, Kunci> = {
  bugs: 'scan.bugs',
  console: 'scan.console',
  security: 'scan.security',
  seo: 'scan.seo',
  mobile: 'scan.mobile',
  geo: 'scan.geo',
  audit: 'scan.audit',
  lighthouse: 'scan.lighthouse',
  full: 'run.full',
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
 * Penandanya elipsis, sejalan dengan glif severity di `lib/glif.ts`
 * alih-alih memperkenalkan ikon. Elipsis
 * terbaca sebagai "belum selesai" tanpa perlu animasi.
 */
export function TombolScan({
  siteId,
  kategori,
  path,
  berjalan,
  children,  locale,
}: {
  siteId: number
  kategori: Kategori
  path: string
  berjalan: { type: string; mulai: string } | null
  children?: React.ReactNode
  locale: Locale
}) {
  const t = penerjemah(locale)
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
    const jalanEl = (
      <p className="jalan" role="status">
        <span className="jalan-tanda" aria-hidden="true">
          {GLIF_BERJALAN}
        </span>
        <span>
          {t('scan.berjalan', {
            nama: NAMA_RUN[berjalan.type] ? t(NAMA_RUN[berjalan.type]!) : 'Scan',
            mulai: berjalan.mulai,
          })}
          {NAMA_RUN[berjalan.type] !== LABEL[kategori] &&
            (berjalan.type === 'geo' || berjalan.type === 'audit' ? (
              <> Tab ini ikut menunggu supaya dua analisis tidak menimpa hasil satu sama lain.</>
            ) : (
              <> Tab ini ikut menunggu karena satu penjelajahan memakai satu browser.</>
            ))}
        </span>
        <button className="jalan-segarkan" type="button" onClick={() => router.refresh()}>
          <Ikon nama="segarkan" ukuran={13} />
          Periksa Sekarang
        </button>
      </p>
    )

    if (children) {
      return (
        <div className="bilah-aksi">
          {jalanEl}
          {children}
        </div>
      )
    }

    return jalanEl
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
        <Ikon nama="scan" ukuran={15} />
        {menunggu ? t('scan.memulai') : t(LABEL[kategori])}
      </button>

      {children}

      {LEWAT_AI.has(kategori) && <span className="unduh-catatan">{LAMA[kategori]}</span>}

      {galat && (
        <span className="jalan-galat" role="alert" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <Ikon nama="alert" ukuran={13} />
          {galat}
        </span>
      )}
    </div>
  )
}
