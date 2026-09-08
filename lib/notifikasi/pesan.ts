/**
 * Menyusun isi email hasil pemindaian terjadwal.
 *
 * Fungsi murni: tanpa jaringan, tanpa database, tanpa env. Ini satu-satunya
 * bagian notifikasi yang bisa diuji penuh, dan yang paling perlu — subjek
 * email yang salah adalah kabar yang salah, dan tidak ada yang memeriksanya
 * pukul tiga pagi.
 */

export type HasilSitus = {
  nama: string
  /** Langkah yang gagal, mis. `['scan']`. Kosong berarti semuanya berhasil. */
  gagal: string[]
  /** Temuan yang pertama kali terlihat pada pemindaian ini. */
  baru: number
  /** Temuan yang tadinya terbuka dan kini beres. */
  beres: number
  /** Total temuan terbuka setelah pemindaian. */
  terbuka: number
}

export type Pesan = { subjek: string; teks: string }

/**
 * Apakah ada yang perlu dikabarkan.
 *
 * Diam kalau tidak ada kegagalan, tidak ada temuan baru, dan tidak ada yang
 * beres. Alasannya: email tiap malam untuk tiga situs adalah 365 email setahun
 * yang isinya "tidak ada yang berubah", dan kotak masuk seperti itu berhenti
 * dibaca — lalu email yang benar-benar penting ikut tidak terbaca.
 *
 * KONSEKUENSINYA JUJUR: diam berarti "tidak ada yang berubah", BUKAN "jadwal
 * berjalan". Kalau cron sendiri mati, tidak ada email — dan tidak ada email
 * yang bisa mengabarkan itu. Yang menjawabnya adalah kolom "terakhir dipindai"
 * di dashboard.
 */
export function perluDikirim(hasil: HasilSitus[]): boolean {
  return hasil.some((h) => h.gagal.length > 0 || h.baru > 0 || h.beres > 0)
}

/**
 * Subjek yang bisa dibaca tanpa membuka isinya.
 *
 * Urutannya sengaja: kegagalan lebih dulu, karena situs yang gagal dipindai
 * membuat SELURUH angkanya tidak bisa dipercaya — bukan cuma menambah satu
 * masalah. Ini urutan yang sama dengan kartu dashboard.
 */
export function subjek(hasil: HasilSitus[]): string {
  const gagal = hasil.filter((h) => h.gagal.length > 0)
  const baru = hasil.reduce((n, h) => n + h.baru, 0)
  const beres = hasil.reduce((n, h) => n + h.beres, 0)

  const bagian: string[] = []
  if (gagal.length > 0) bagian.push(`${gagal.length} situs gagal`)
  if (baru > 0) bagian.push(`${baru} temuan baru`)
  if (beres > 0) bagian.push(`${beres} beres`)
  // Dipanggil pada hasil yang tidak perlu dikirim tetap harus menghasilkan
  // subjek yang benar, bukan string kosong: `perluDikirim` adalah penjaganya,
  // tapi fungsi ini tidak boleh bergantung pada pemanggil yang tertib.
  if (bagian.length === 0) return 'Weblyzer: tidak ada perubahan'
  return `Weblyzer: ${bagian.join(', ')}`
}

function barisSitus(h: HasilSitus): string[] {
  if (h.gagal.length > 0) {
    return [
      `${h.nama} — GAGAL (${h.gagal.join(', ')})`,
      // Angka dari situs yang gagal sengaja TIDAK ditulis. Melaporkan
      // "3 temuan terbuka" untuk situs yang crawl-nya gagal berarti
      //  menyodorkan angka kemarin sebagai angka hari ini.
      '    Angkanya tidak dilaporkan: pemindaiannya tidak selesai, jadi',
      '    keadaan situs ini tidak diketahui.',
    ]
  }

  const perubahan: string[] = []
  if (h.baru > 0) perubahan.push(`+${h.baru} baru`)
  if (h.beres > 0) perubahan.push(`-${h.beres} beres`)
  const ekor = perubahan.length > 0 ? ` (${perubahan.join(', ')})` : ' (tidak ada perubahan)'
  return [`${h.nama} — ${h.terbuka} terbuka${ekor}`]
}

export function susunPesan(hasil: HasilSitus[], waktu: string): Pesan {
  const gagal = hasil.filter((h) => h.gagal.length > 0)

  return {
    subjek: subjek(hasil),
    teks: [
      `Pemindaian terjadwal selesai ${waktu}.`,
      '',
      ...hasil.flatMap(barisSitus),
      '',
      gagal.length > 0
        ? 'Situs yang gagal disebut lebih dulu karena kegagalan membuat seluruh angkanya tidak bisa dipercaya, bukan cuma menambah satu masalah.'
        : 'Semua situs terpindai sampai selesai.',
      '',
      'Buka dashboard untuk rinciannya. Email ini hanya dikirim bila ada',
      'kegagalan atau perubahan — tidak ada email berarti tidak ada yang',
      'berubah, BUKAN berarti jadwalnya berjalan. Yang menjawab itu adalah',
      'kolom "terakhir dipindai" di dashboard.',
    ].join('\n'),
  }
}
