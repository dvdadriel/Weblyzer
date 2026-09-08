import type { Kelompok } from '../ai/prompt.ts'
import type { Severity } from '../findings.ts'
import { sumberKategori } from '../kategori.ts'

/** Urutan keparahan. Sengaja disalin, tidak diimpor dari `ai/prompt.ts`:
 *  urutan kerja daftar tugas dan urutan kutipan prompt ringkasan kebetulan
 *  sama, tapi tidak wajib sama, dan menautkannya membuat perubahan di satu
 *  sisi diam-diam mengubah sisi lain. */
const URUTAN: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

/** Contoh halaman per tugas. Lebih banyak daripada prompt ringkasan (6):
 *  di sini contohnya dipakai untuk menelusuri kode, bukan memperlihatkan pola,
 *  dan tugas gabungan bisa menyentuh banyak bagian situs yang berbeda. */
const BATAS_CONTOH_TUGAS = 12

/**
 * Prompt perbaikan, satu per kelompok masalah.
 *
 * Isinya disusun deterministik dari template, bukan diminta ke AI. Dua
 * alasan, keduanya pernah terasa di proyek ini:
 *
 * 1. Ekspor harus jalan tanpa penyedia AI terpilih. Tabel `config` di mesin ini
 *    sedang kosong, dan tombol Export tidak boleh mati karena itu.
 * 2. Ekspor harus selesai dalam hitungan milidetik. Satu panggilan CLI butuh
 *    ~7 detik; 40 kelompok berarti route handler yang menggantung lima menit.
 *
 * Yang dihasilkan adalah prompt untuk ditempel ke asisten koding, bukan
 * jawabannya. Pembagian kerjanya jelas: alat ini tahu apa yang rusak dan di
 * mana, asisten yang membaca kode tahu kenapa.
 */

/** Satu prompt per KELOMPOK, bukan per temuan — 216 temuan Comforta jadi
 *  belasan baris, dan enam HTTP 500 dari satu controller rusak jadi satu
 *  tugas, bukan enam tugas kembar. */
export type BarisPrompt = {
  severity: string
  kategori: string
  rule: string
  masalah: string
  jumlah: number
  prompt: string
}

type Petunjuk = {
  /** Apa yang sebenarnya dilihat pemindai. Tanpa ini asisten menebak
   *  metodologinya, dan tebakan yang salah mengirimnya memburu hal lain. */
  deteksi: string
  /** Di mana biasanya penyebabnya, dan apa yang perlu dipastikan dulu. */
  periksa: string
}

/**
 * Petunjuk per aturan.
 *
 * Ini yang membuat sheet-nya berguna. Prompt generik ("perbaiki masalah ini")
 * tidak menghemat apa pun — pemakainya masih harus menjelaskan sendiri apa
 * yang rusak. Yang dihemat adalah kalimat yang harus ditulis ulang tiap kali,
 * dan itu berbeda untuk tiap aturan.
 *
 * Aturan yang tidak ada di sini tetap dapat prompt, hanya tanpa dua kalimat
 * ini — lihat `UMUM`. Jadi menambah analyzer baru tidak pernah menghasilkan
 * sheet yang rusak, cuma prompt yang lebih tumpul.
 */
const PETUNJUK: Record<string, Petunjuk> = {
  // ── bugs ────────────────────────────────────────────────────────────────
  'http-error': {
    deteksi: 'Halaman diminta dengan GET biasa dan server membalas status 4xx atau 5xx.',
    periksa:
      'Kalau responsnya cepat (di bawah 200 ms) ini error aplikasi, bukan timeout. Beberapa URL yang polanya mirip biasanya berasal dari SATU route atau controller yang rusak — cari kesamaan jalurnya dulu sebelum memperbaiki satu per satu.',
  },
  'blank-page': {
    deteksi:
      'Halaman membalas 200 tetapi teks yang terbaca setelah render hampir nol.',
    periksa:
      'Bedakan tiga sebab: konten yang memang belum ada, JavaScript yang gagal sehingga isinya tidak pernah dirender, atau data yang kosong tanpa keadaan kosong yang dirancang. Periksa tab Console untuk situs yang sama — exception di halaman itu menjawabnya langsung.',
  },
  'broken-resource': {
    deteksi:
      'Halaman memuat aset (gambar, CSS, JS, font) dan permintaan aset itu dibalas 4xx atau 5xx.',
    periksa:
      'Biasanya path yang salah setelah pindah folder, berkas yang tidak ikut ter-deploy, atau referensi ke aset yang sudah dihapus. Pastikan dulu asetnya memang seharusnya ada — referensi ke aset yang sudah tidak dipakai lebih baik dibuang daripada dikembalikan.',
  },
  'load-timeout': {
    deteksi:
      'Halaman mulai termuat tetapi tidak pernah mencapai keadaan idle dalam batas waktu.',
    periksa:
      'Cari permintaan yang tidak pernah selesai: polling tanpa henti, koneksi yang menggantung, atau redirect ke endpoint yang diam. Ini bukan soal lambat — halaman lambat tetap selesai.',
  },
  'redirect-chain': {
    deteksi: 'Satu URL melewati beberapa redirect sebelum sampai ke halaman akhir.',
    periksa:
      'Rantai biasanya tumbuh dari aturan yang bertumpuk: http→https, tanpa-www→www, lalu garis miring akhir. Gabungkan jadi satu lompatan ke tujuan akhir. Tiap lompatan tambahan adalah perjalanan bolak-balik yang dibayar setiap pengunjung.',
  },
  'redirect-loop': {
    deteksi: 'URL mengarahkan ke dirinya sendiri, langsung atau lewat perantara.',
    periksa:
      'Dua aturan redirect yang saling membatalkan, atau middleware yang mengarahkan berdasarkan keadaan yang tidak pernah berubah (locale, sesi, atau flag yang tidak pernah tersimpan). Halaman ini tidak bisa dibuka siapa pun — perlakukan sebagai mendesak.',
  },

  // ── console ─────────────────────────────────────────────────────────────
  'uncaught-exception': {
    deteksi: 'Exception JavaScript tidak tertangkap saat halaman dimuat di Chromium.',
    periksa:
      'Pesan galatnya ada di judul masalah di atas. Galat pada elemen null hampir selalu berarti skrip berjalan sebelum elemennya ada, atau elemennya hanya ada di sebagian halaman padahal skriptnya dimuat di semua halaman.',
  },
  'console-error': {
    deteksi: 'Kode di halaman memanggil console.error saat dimuat.',
    periksa:
      'Tentukan dulu apakah ini galat sungguhan atau catatan diagnostik yang tertinggal. Kalau diagnostik, buang panggilannya — console.error yang bukan galat membuat galat sungguhan tidak terlihat.',
  },
  'console-warning': {
    deteksi: 'Kode di halaman memanggil console.warn saat dimuat.',
    periksa:
      'Peringatan pustaka soal API yang akan dihapus layak dikerjakan sebelum naik versi. Peringatan dari kode sendiri biasanya bisa dibuang.',
  },
  'failed-request': {
    deteksi:
      'Permintaan jaringan dari halaman gagal di tingkat jaringan — bukan status HTTP, tapi tidak pernah sampai.',
    periksa:
      'Sebabnya beragam: host yang tidak ada, CORS, atau permintaan yang dibatalkan. Yang dibatalkan sering bukan bug — navigasi yang mendahului permintaannya sendiri terlihat seperti ini. Pastikan permintaannya memang seharusnya selesai sebelum memperbaiki apa pun.',
  },

  // ── security ────────────────────────────────────────────────────────────
  'exposed-file': {
    deteksi:
      'Path yang biasanya tidak untuk publik diminta dengan GET dan dibalas isi berkas sungguhan, bukan halaman aplikasi.',
    periksa:
      'Periksa dulu apa isinya. Kalau memuat kredensial, rotasi kredensialnya lebih dulu — menutup aksesnya saja tidak membatalkan apa yang mungkin sudah terambil. Lalu tutup di tingkat server, bukan dengan menghapus berkasnya.',
  },
  'directory-listing': {
    deteksi: 'Permintaan ke sebuah direktori membalas daftar isinya.',
    periksa:
      'Matikan autoindex di konfigurasi server. Yang bocor bukan cuma nama berkas — struktur folder memperlihatkan apa lagi yang bisa dicoba.',
  },
  'tls-expiring': {
    deteksi: 'Sertifikat TLS host ini kedaluwarsa dalam waktu dekat.',
    periksa:
      'Kalau pembaruannya otomatis, cari kenapa perpanjangan terakhir tidak jalan. Sertifikat yang lewat tanggal membuat seluruh situs tidak bisa dibuka, bukan sebagian.',
  },
  'mixed-content': {
    deteksi: 'Halaman https memuat sumber daya lewat http biasa.',
    periksa:
      'Browser memblokir sebagiannya diam-diam, jadi halamannya bisa terlihat rusak tanpa galat yang jelas. Ganti ke https; kalau sumbernya tidak mendukung https, sumbernya yang harus diganti.',
  },
  'insecure-cookie': {
    deteksi: 'Server mengirim Set-Cookie tanpa flag yang seharusnya ada untuk cookie itu.',
    periksa:
      'Cookie sesi tanpa Secure bisa terkirim lewat koneksi biasa; tanpa HttpOnly bisa dibaca JavaScript. Diperbaiki di tempat sesi dikonfigurasi, bukan di kode yang menulis cookie satu per satu.',
  },
  'missing-security-header': {
    deteksi: 'Respons server tidak memuat header keamanan yang diperiksa. Nama headernya ada di judul di atas.',
    periksa:
      'Dipasang sekali di tingkat server atau middleware, bukan per halaman. Content-Security-Policy perlu diuji sebelum dinyalakan penuh — CSP yang terlalu ketat mematikan halaman yang sebelumnya jalan.',
  },

  // ── seo ─────────────────────────────────────────────────────────────────
  'judul-hilang': {
    deteksi: 'Halaman tidak punya elemen <title> atau isinya kosong.',
    periksa:
      'Judul adalah baris yang dipakai hasil pencarian dan tab browser. Kalau halamannya dihasilkan template, perbaiki templatenya — halaman tanpa judul biasanya datang berkelompok.',
  },
  'judul-kembar': {
    deteksi: 'Beberapa halaman berbeda memakai <title> yang sama persis.',
    periksa:
      'Mesin pencari memakai judul untuk membedakan halaman, jadi judul kembar membuat keduanya bersaing satu sama lain. Biasanya template yang tidak menyisipkan nama produk atau kategori. Halaman dua bahasa yang berjudul identik adalah bentuk khusus dari masalah ini.',
  },
  'judul-panjang': {
    deteksi: 'Panjang <title> melewati batas yang biasanya masih ditampilkan utuh.',
    periksa:
      'Yang terpotong adalah ujungnya, jadi pastikan kata terpentingnya ada di depan. Nama situs di akhir judul adalah bagian yang paling aman dipotong.',
  },
  'deskripsi-hilang': {
    deteksi: 'Halaman tidak punya meta description.',
    periksa:
      'Bukan faktor peringkat, tapi ia yang menentukan cuplikan di hasil pencarian. Tanpa itu mesin pencari memotong sendiri dari isi halaman, dan hasilnya sering kalimat yang tidak utuh.',
  },
  'deskripsi-kembar': {
    deteksi: 'Beberapa halaman berbeda memakai meta description yang sama persis.',
    periksa: 'Sama seperti judul kembar: hampir selalu template yang tidak menyisipkan isi khas halaman itu.',
  },
  'deskripsi-panjang': {
    deteksi: 'Meta description melewati panjang yang biasanya ditampilkan utuh.',
    periksa: 'Potong di kalimat, bukan di tengah kalimat, supaya cuplikan yang muncul tetap terbaca.',
  },
  'h1-hilang': {
    deteksi: 'Halaman tidak punya elemen h1.',
    periksa:
      'Ini soal struktur dokumen, bukan cuma SEO: pembaca layar memakai heading untuk melompat, dan halaman tanpa h1 tidak punya titik masuk. Beberapa h1 di satu halaman bukan masalah — yang tidak ada sama sekali baru masalah.',
  },
  'h1-kosong': {
    deteksi: 'Elemen h1 ada tetapi tidak memuat teks sama sekali.',
    periksa:
      'Hampir selalu h1 yang hanya memuat logo sebagai gambar. Beri gambarnya alt yang berarti, atau pindahkan h1 ke judul halaman yang sebenarnya.',
  },
  'canonical-hilang': {
    deteksi: 'Halaman tidak punya link rel=canonical.',
    periksa:
      'Paling berarti pada halaman yang bisa dicapai lewat lebih dari satu URL — parameter query, garis miring, atau varian huruf besar-kecil. Tanpa canonical, mesin pencari memilih sendiri mana yang asli.',
  },
  'canonical-lintas-domain': {
    deteksi: 'Canonical halaman ini menunjuk ke domain lain.',
    periksa:
      'Ini memberi tahu mesin pencari untuk mengabaikan halaman ini dan memakai yang di domain lain. Kalau itu tidak disengaja — dan pada situs yang dikelola sendiri biasanya tidak — halaman ini sedang membuang seluruh nilai pencariannya. Sering sisa dari lingkungan staging.',
  },
  'hreflang-hilang': {
    deteksi:
      'Situs menyajikan lebih dari satu nilai lang tetapi tidak ada satu pun anotasi hreflang.',
    periksa:
      'Tanpa hreflang, versi bahasa yang berbeda terlihat seperti halaman kembar, dan mesin pencari bisa menampilkan bahasa yang salah. Tiap halaman perlu menunjuk seluruh versi bahasanya, termasuk dirinya sendiri.',
  },
  noindex: {
    deteksi: 'Meta robots halaman ini meminta mesin pencari untuk tidak mengindeksnya.',
    periksa:
      'Pastikan dulu apakah ini disengaja. Halaman admin dan halaman terima kasih memang seharusnya noindex. Yang perlu dikhawatirkan adalah noindex yang tertinggal dari staging di halaman yang seharusnya bisa ditemukan.',
  },

  // ── lighthouse ──────────────────────────────────────────────────────────
  'lighthouse-audit': {
    deteksi:
      'Audit Lighthouse yang gagal. Hanya audit lulus-atau-tidak yang dilaporkan, dan hanya yang gagal di DUA pengukuran terpisah — jadi ini bukan hasil yang berubah-ubah antar run. Awalan [mobile] atau [desktop] menyebutkan strategi mana yang diukur.',
    periksa:
      'Nama auditnya ada di judul di atas; dokumentasi Lighthouse menjelaskan tiap audit beserta cara memperbaikinya. Audit yang sama gagal di banyak halaman biasanya berasal dari template atau layout bersama, bukan dari halamannya masing-masing.',
  },
  'lighthouse-gagal': {
    deteksi: 'Lighthouse tidak berhasil mengukur halaman ini sama sekali.',
    periksa:
      'Hampir selalu halamannya sendiri yang tidak bisa dimuat, bukan alatnya yang rusak. Periksa tab Bug untuk URL yang sama — halaman yang 404 atau menggantung juga gagal diukur.',
  },
}

/**
 * Aturan yang seluruhnya SATU tugas, apa pun judul temuannya.
 *
 * `kelompokkan` memecah menurut judul, dan untuk ringkasan AI itu benar —
 * judulnya memuat judul halaman yang kembar, dan ringkasan yang menyebut
 * "European Collection" lebih berarti daripada "46 judul kembar". Untuk daftar
 * tugas, pemecahan itu justru merugikan: Springair menghasilkan 46 baris
 * `judul-kembar` yang perbaikannya satu dan sama — template yang tidak
 * menyisipkan nama halaman. Membaca 46 prompt kembar bukan pekerjaan.
 *
 * Nilainya adalah label tingkat aturan, karena judul salah satu anggotanya
 * tidak boleh mewakili kelompok gabungan.
 */
const SATU_TUGAS: Record<string, string> = {
  'judul-kembar': 'Judul halaman kembar antar halaman berbeda',
  'judul-panjang': 'Judul melewati batas panjang yang ditampilkan utuh',
  'deskripsi-kembar': 'Meta description kembar antar halaman berbeda',
  'deskripsi-panjang': 'Meta description melewati batas panjang',
}

/** Awalan strategi pada judul temuan Lighthouse. */
const AWALAN_STRATEGI = /^\[(mobile|desktop)\]\s*/

/** Aturan Lighthouse yang judulnya diawali strategi. Mobile dan desktop untuk
 *  hal yang sama adalah satu perbaikan yang diukur dua kali. */
const BERAWALAN_STRATEGI = new Set(['lighthouse-audit', 'lighthouse-gagal'])

const BATAS_RINCIAN = 20

export type Tugas = Kelompok & {
  /** Judul anggota yang digabung, bila kelompok ini gabungan dari beberapa.
   *  Kosong untuk kelompok yang berdiri sendiri. Di sinilah data yang hilang
   *  akibat penggabungan dikembalikan — daftar judul yang kembar justru bahan
   *  utama untuk memperbaikinya. */
  rincian: string[]
  /** Banyaknya kelompok yang digabung jadi tugas ini. 1 berarti tidak
   *  digabung. Dibawa terpisah dari `rincian.length` karena rincian dipotong
   *  di `BATAS_RINCIAN` — dan prompt yang menyebut "20" untuk 46 varian akan
   *  membuat asisten mengira sudah melihat semuanya. */
  anggota: number
}

/**
 * Menggabungkan kelompok yang perbaikannya sama menjadi satu tugas.
 *
 * Dua penggabungan, keduanya karena judul yang berbeda TIDAK selalu berarti
 * perbaikan yang berbeda:
 *
 * 1. Aturan di `SATU_TUGAS` — judulnya memuat nilai yang berbeda per halaman
 *    (judul yang kembar, jumlah karakter), sedangkan sebabnya satu template.
 * 2. `lighthouse-audit` — `[mobile]` dan `[desktop]` untuk audit yang sama
 *    adalah satu perbaikan yang diukur dua kali, bukan dua pekerjaan. Strategi
 *    yang terdampak pindah ke `rincian`, jadi tidak ada yang hilang.
 *
 * Yang TIDAK digabung: audit Lighthouse yang berbeda, pesan exception yang
 * berbeda, status HTTP yang berbeda, header keamanan yang berbeda. Di sana
 * judul yang berbeda memang pekerjaan yang berbeda.
 */
export function tugasPerbaikan(kelompok: Kelompok[]): Tugas[] {
  const peta = new Map<string, Tugas>()

  for (const k of kelompok) {
    const label = SATU_TUGAS[k.rule]
    const judul =
      label ?? (BERAWALAN_STRATEGI.has(k.rule) ? k.judul.replace(AWALAN_STRATEGI, '') : k.judul)
    // Kunci gabungan: untuk SATU_TUGAS cukup aturannya, selain itu judul yang
    // sudah dinormalkan ikut supaya masalah yang berbeda tetap terpisah.
    const kunci = label !== undefined ? `${k.category}\n${k.rule}` : `${k.category}\n${k.rule}\n${judul}`

    const ada = peta.get(kunci)
    if (ada === undefined) {
      peta.set(kunci, { ...k, judul, contoh: [...k.contoh], rincian: [], anggota: 1 })
      // Judul aslinya tetap dicatat sebagai rincian hanya kalau memang diganti;
      // kalau tidak, rincian akan mengulang judul kelompoknya sendiri.
      if (judul !== k.judul) peta.get(kunci)!.rincian.push(k.judul)
      continue
    }

    ada.jumlah += k.jumlah
    ada.anggota += 1
    if (URUTAN.indexOf(k.severity) < URUTAN.indexOf(ada.severity)) ada.severity = k.severity
    for (const c of k.contoh) {
      if (ada.contoh.length < BATAS_CONTOH_TUGAS && !ada.contoh.includes(c)) ada.contoh.push(c)
    }
    if (judul !== k.judul && ada.rincian.length < BATAS_RINCIAN && !ada.rincian.includes(k.judul)) {
      ada.rincian.push(k.judul)
    }
  }

  return [...peta.values()].sort(
    (a, b) => URUTAN.indexOf(a.severity) - URUTAN.indexOf(b.severity) || b.jumlah - a.jumlah,
  )
}

const UMUM: Petunjuk = {
  deteksi: 'Terdeteksi oleh pemindaian otomatis pada halaman yang tercantum di bawah.',
  periksa: 'Pastikan dulu masalahnya masih ada dengan membuka salah satu halaman contoh.',
}

/**
 * Fallback untuk temuan dari claude-seo.
 *
 * Aturannya tidak bisa didaftar di `PETUNJUK`: namanya dikarang model per
 * temuan, jadi daftarnya tak berhingga. Yang bisa dijamin adalah asal-usulnya
 * — dan itu justru keterangan yang paling penting di sini.
 *
 * Kalimat "verifikasi dulu" bukan kehati-hatian berlebih. Temuan `aturan`
 * diukur: `judul-hilang` berarti elemen `<title>` benar-benar tidak ada.
 * Temuan claude-seo adalah PENILAIAN, dan penilaian bisa keliru dengan cara
 * yang tidak bisa dilakukan pengukuran. Asisten yang tidak diberi tahu bedanya
 * akan memperlakukan keduanya sama yakinnya.
 */
const UMUM_AI: Petunjuk = {
  deteksi:
    'Dinilai oleh claude-seo (model bahasa yang memeriksa situs), bukan diukur aturan deterministik. Rincian penilaiannya ada di kolom Detail pada sheet temuan.',
  periksa:
    'VERIFIKASI DULU. Ini penilaian, bukan pengukuran — buka salah satu halaman contoh dan pastikan masalahnya nyata sebelum mengubah apa pun. Kalau ternyata keliru, katakan; itu jawaban yang lebih berguna daripada tambalan untuk masalah yang tidak ada.',
}

/**
 * Menyusun satu prompt siap tempel untuk satu kelompok masalah.
 *
 * Ditutup dengan aturan keras, dan itu bukan hiasan. Dua di antaranya menutup
 * kesalahan yang mahal: contoh URL bisa jadi tidak lengkap (asisten yang
 * mengira sudah melihat semuanya akan menyatakan selesai terlalu cepat), dan
 * pemindai ini bisa salah (aturan yang menuntut perbaikan tanpa verifikasi
 * akan menghasilkan tambalan untuk masalah yang tidak ada).
 */
export function promptPerbaikan(
  k: Tugas,
  situs: { nama: string; baseUrl: string },
): string {
  const p = PETUNJUK[k.rule] ?? (sumberKategori(k.category) === 'claude-seo' ? UMUM_AI : UMUM)
  const gabungan = k.anggota > 1
  const rincianTerpotong = k.rincian.length < k.anggota

  // `jumlah` adalah jumlah TEMUAN. Untuk aturan biasa satu temuan menempel di
  // satu halaman, jadi menyebutnya "halaman" benar dan lebih mudah dibaca.
  // Untuk tugas gabungan itu tidak lagi berlaku: 46 temuan judul-kembar
  // Springair semuanya menempel di halaman akar, dan menulis "46 halaman"
  // sementara daftar contohnya cuma memuat "/" adalah angka yang salah unit.
  const semuaTercantum = !gabungan && k.contoh.length >= k.jumlah

  return [
    `Saya mengelola situs "${situs.nama}" (${situs.baseUrl}). Sebuah audit otomatis menemukan masalah berikut dan saya ingin memperbaikinya.`,
    '',
    `Masalah: ${k.judul}`,
    `Aturan: ${k.category}/${k.rule} — keparahan ${k.severity}`,
    gabungan
      ? `Terdampak: ${k.anggota} varian, ${k.jumlah} temuan`
      : k.jumlah === 1
        ? 'Terdampak: 1 halaman'
        : `Terdampak: ${k.jumlah} halaman`,
    '',
    gabungan
      ? 'Halaman contoh:'
      : semuaTercantum
        ? 'Halaman terdampak (lengkap):'
        : `Contoh halaman terdampak (${k.contoh.length} dari ${k.jumlah}):`,
    ...k.contoh.map((c) => `- ${c}`),
    // Rincian varian yang digabung. Untuk `judul-kembar` inilah bahan
    // utamanya: daftar judul yang bertabrakan, bukan daftar halamannya.
    ...(k.rincian.length === 0
      ? []
      : [
          '',
          rincianTerpotong
            ? `Rincian (${k.rincian.length} dari ${k.anggota}):`
            : `Rincian (${k.anggota}):`,
          ...k.rincian.map((r) => `- ${r}`),
        ]),
    '',
    `Cara pemindai mendeteksinya: ${p.deteksi}`,
    '',
    `Yang perlu diperiksa: ${p.periksa}`,
    '',
    'Tugas Anda:',
    '1. Telusuri kode saya dan tentukan penyebabnya. Sebutkan berkas dan barisnya.',
    '2. Kalau beberapa halaman di atas berasal dari satu sebab yang sama, katakan — saya lebih ingin satu perbaikan daripada beberapa tambalan.',
    '3. Usulkan perbaikan yang paling kecil yang benar-benar menyelesaikannya.',
    '4. Sebutkan cara saya memastikan perbaikannya berhasil.',
    '',
    'Aturan:',
    '- Jangan menebak framework atau struktur proyek saya. Baca dulu, atau tanya.',
    gabungan
      ? `- ${k.anggota} varian di atas digabung karena perbaikannya sama. ${
          rincianTerpotong
            ? `Rincian yang ditampilkan hanya ${k.rincian.length} dari ${k.anggota}, jadi jangan mengaku sudah melihat semuanya.`
            : 'Rinciannya lengkap.'
        } Perbaikannya harus mengenai seluruh varian, bukan hanya yang tercantum.`
      : semuaTercantum
        ? '- Daftar halaman di atas lengkap untuk masalah ini.'
        : `- Daftar di atas hanya contoh. Ada ${k.jumlah - k.contoh.length} halaman lain dengan masalah yang sama, jadi perbaikannya harus mengenai seluruh kelompok, bukan hanya yang tercantum.`,
    '- Kalau menurut Anda temuan ini keliru atau tidak perlu diperbaiki, katakan dan sebutkan alasannya. Itu jawaban yang sah.',
    '- Jangan menyatakan sudah beres tanpa sesuatu yang bisa saya jalankan atau buka untuk membuktikannya.',
  ].join('\n')
}

/** Satu baris per kelompok, urutannya mengikuti `kelompokkan`: paling parah
 *  dulu, lalu yang paling banyak halaman terdampak. Itu urutan kerja, jadi
 *  membaca sheet ini dari atas ke bawah sudah benar. */
export function barisPrompt(
  kelompok: Kelompok[],
  situs: { nama: string; baseUrl: string },
): BarisPrompt[] {
  return tugasPerbaikan(kelompok).map((k) => ({
    severity: k.severity,
    kategori: k.category,
    rule: k.rule,
    masalah: k.judul,
    jumlah: k.jumlah,
    prompt: promptPerbaikan(k, situs),
  }))
}
