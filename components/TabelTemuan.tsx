'use client'

import { useState, useTransition } from 'react'
import type { BarisTemuan, ScanKategori } from '../lib/ui/queries.ts'
import { SeverityChip } from './SeverityChip.tsx'
import { ubahStatusTemuan, periksaTemuan } from '../app/actions.ts'
import { Ikon } from './Ikon.tsx'

/**
 * Membuang awalan domain dari URL yang ditampilkan.
 *
 * Domainnya sudah tertulis di header dua baris di atas, jadi mengulangnya di
 * setiap baris membuat 24 karakter pertama tiap baris identik — dan bagian yang
 * sebenarnya dipindai, yaitu path yang membedakan, baru mulai setelah itu.
 * URL utuh tetap tersimpan di `title` untuk saat dibutuhkan.
 */
function jalur(url: string, baseUrl: string): string {
  return url.startsWith(baseUrl) ? url.slice(baseUrl.length) || '/' : url
}

/**
 * `detail_json` datang dari pemindai dan tidak dijamin JSON valid. Kalau tidak
 * bisa di-parse, teks aslinya ditampilkan apa adanya — pengukuran yang ada
 * lebih berguna daripada pesan error yang menyembunyikannya.
 */
function rapikan(detail: string): string {
  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}

function BarisDetail({
  b,
  status,
  path,
  lapor,
}: {
  b: BarisTemuan
  status: 'open' | 'ignored'
  path: string
  lapor: (h: { keadaan: string; pesan?: string; error?: string }) => void
}) {
  const [pending, mulai] = useTransition()
  const [memeriksa, mulaiPeriksa] = useTransition()

  // Lighthouse tidak punya jalur pemeriksaan per temuan: satu pengukuran ulang
  // yang jujur berarti mengukur dua kali lalu mengiris hasilnya, dan mesin itu
  // sudah ada sebagai Scan Lighthouse. Tombol yang selalu menolak lebih buruk
  // daripada tidak ada tombol, jadi yang muncul penjelasannya.
  const bisaPeriksa = b.category !== 'lighthouse'

  return (
    <tr id={`detail-${b.id}`} className="baris-detail">
      {/* colSpan, bukan `display: block`: reflow lewat display menghapus
          semantik tabel di sebagian screen reader, dan navigasi per kolom
          adalah syarat di PRODUCT.md. */}
      <td colSpan={4}>
        <p className="detail-judul">{b.title}</p>
        <pre className="detail-json">{rapikan(b.detail_json)}</pre>

        <p className="detail-aksi">
          {bisaPeriksa && status === 'open' && (
            <button
              type="button"
              className="tombol-teks"
              disabled={memeriksa || pending}
              onClick={() =>
                mulaiPeriksa(async () => {
                  lapor(await periksaTemuan(b.id, path))
                })
              }
            >
              <Ikon nama="scan" />
              {memeriksa ? 'Memeriksa…' : 'Periksa Lagi'}
            </button>
          )}

          <button
            type="button"
            className="tombol-teks"
            disabled={pending || memeriksa}
            onClick={() =>
              mulai(async () => {
                await ubahStatusTemuan(b.id, status === 'open' ? 'ignored' : 'open', path)
              })
            }
          >
            {status === 'open' ? 'Abaikan' : 'Buka Lagi'}
          </button>

          {!bisaPeriksa && status === 'open' && (
            <span className="detail-catatan">
              Pemeriksaan satu temuan belum ada untuk Lighthouse — jalankan Scan Lighthouse.
            </span>
          )}
        </p>

      </td>
    </tr>
  )
}

export function TabelTemuan({
  baris,
  baseUrl,
  status = 'open',
  path,
  waktuScan,
}: {
  baris: BarisTemuan[]
  baseUrl: string
  status?: 'open' | 'ignored'
  path: string
  waktuScan: ScanKategori | null
}) {
  const [terbuka, setTerbuka] = useState<number | null>(null)
  // Hasil pemeriksaan disimpan DI SINI, bukan di baris detailnya.
  //
  // Saat temuan ternyata sudah beres, `revalidatePath` menghapus barisnya dari
  // tabel — dan baris detail yang memuat pesannya ikut hilang sebelum pesan itu
  // sempat terbaca. Terbukti: pengujian browser menunggu pesan itu selama enam
  // puluh detik dan tidak pernah melihatnya, padahal statusnya di database
  // sudah `fixed`. Diangkat ke sini, pesannya bertahan setelah barisnya pergi.
  const [periksaan, setPeriksaan] = useState<
    { id: number; keadaan: string; pesan?: string; error?: string } | null
  >(null)

  return (
    <div className="tabel-bungkus">
      {periksaan !== null && (
        <p
          className={`detail-hasil ${periksaan.keadaan === 'beres' ? 'beres' : periksaan.keadaan === 'masih-ada' ? 'masih' : 'galat'}`}
          role="status"
        >
          {periksaan.keadaan === 'beres' && 'Sudah beres — temuan itu ditutup dan hilang dari daftar.'}
          {periksaan.keadaan === 'masih-ada' &&
            'Masih ada. Belum ada yang berubah di halaman itu.'}
          {periksaan.keadaan === 'tak-terjangkau' &&
            `Halamannya tidak bisa dibuka, jadi statusnya tidak diketahui — bukan berarti sudah beres. ${periksaan.pesan ?? ''}`}
          {periksaan.keadaan === 'tak-didukung' && periksaan.pesan}
          {(periksaan.keadaan === 'sibuk' || periksaan.keadaan === 'galat') && periksaan.error}
        </p>
      )}
      <table className="tabel">
        {/* Urutan mengikuti kolom: severity, aturan, halaman, terlihat.
            Hanya `halaman` yang lentur — dialah yang panjang. */}
        <colgroup>
          <col className="k-sev" />
          <col className="k-rule" />
          <col />
          <col className="k-lihat" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Severity</th>
            <th scope="col">Aturan</th>
            <th scope="col">Halaman</th>
            <th scope="col">Terlihat</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => {
            const buka = terbuka === b.id
            return [
              <tr key={b.id}>
                <td>
                  <button
                    type="button"
                    className="tombol-sev"
                    aria-expanded={buka}
                    // Hanya saat terbuka: baris detail baru ada di DOM ketika
                    // mengembang, dan `aria-controls` yang menunjuk id yang
                    // tidak ada adalah referensi rusak — screen reader
                    // menawarkan "lompat ke elemen terkait" lalu tidak sampai
                    // ke mana pun. `aria-expanded` tetap selalu ada; itulah
                    // yang mengumumkan keadaannya.
                    aria-controls={buka ? `detail-${b.id}` : undefined}
                    onClick={() => setTerbuka(buka ? null : b.id)}
                  >
                    <SeverityChip severity={b.severity} />
                  </button>
                </td>
                <td className="sel-rule">{b.rule}</td>
                <td className="sel-url" title={b.url ?? undefined}>
                  {b.url === null ? b.title : jalur(b.url, baseUrl)}
                </td>
                <td className="sel-mikro">
                  run {b.first_seen_run}
                  {b.first_seen_run !== b.last_seen_run && `–${b.last_seen_run}`}
                </td>
              </tr>,
              // Dirender hanya saat mengembang: isinya tidak pernah ada di DOM
              // sambil disembunyikan menunggu animasi.
              buka ? (
                <BarisDetail
                  key={`d-${b.id}`}
                  b={b}
                  status={status}
                  path={path}
                  lapor={(h) => setPeriksaan({ id: b.id, ...h })}
                />
              ) : null,
            ]
          })}
        </tbody>
      </table>
      {/* Waktu pemindaian ada di sini karena inilah pertanyaan yang dibawa
          pembaca tabel: apa yang saya lihat ini masih berlaku? Kolom
          `Terlihat run 2–10` tidak menjawabnya — nomor run bukan waktu, dan
          tidak ada apa pun di layar yang menerjemahkannya ke tanggal. */}
      <p className="tabel-kaki">
        {baris.length} temuan {status === 'open' ? 'terbuka' : 'diabaikan'}.
        {waktuScan !== null && (
          <span className="tabel-waktu">
            <Ikon nama="waktu" />
            dipindai {waktuScan.waktu}
            {/* Kata sifat, bukan lencana tersendiri: pertanyaannya bukan "apa
                pemicunya" melainkan "angka ini masih berlaku atau tidak", dan
                pemicu cuma satu keterangan dari jawaban itu. Lencana terpisah
                akan menuntut perhatian yang tidak sepadan. */}
            {waktuScan.terjadwal && ' · terjadwal'}
          </span>
        )}
      </p>
    </div>
  )
}
