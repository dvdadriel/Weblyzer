/**
 * Kamus bahasa Indonesia, dan sumber kebenaran untuk bentuk kamusnya.
 *
 * Tipe `en.ts` diturunkan dari berkas ini (`satisfies Kamus`), jadi kunci yang
 * ada di sini tapi hilang di sana adalah galat TypeScript — bukan `undefined`
 * yang muncul di layar pemakai. Arah sebaliknya juga: kunci yang ada di `en`
 * tapi tidak di sini ditolak sebagai properti berlebih.
 *
 * OBJEK DATAR dengan kunci bertitik, bukan objek bersarang. Bersarang terlihat
 * lebih rapi sampai satu kunci perlu dipindah, dan kemudian setiap pemanggilnya
 * ikut berubah bentuk. Datar juga membuat kunci yang hilang mudah dicari:
 * `grep 'temuan.kosong'` menemukan definisi dan seluruh pemakaiannya.
 *
 * YANG SENGAJA TIDAK DITERJEMAHKAN, konsisten dengan `docs/DESIGN.md`:
 * istilah teknis yang memang dipakai apa adanya (`console.error`, `redirect`,
 * `header`, `cookie`, `scan`), nama kategori (`Bug`, `Console`, `Security`,
 * `SEO`, `GEO`, `Audit`, `Lighthouse`), nama aturan pada temuan
 * (`http-error`, `missing-canonical`), dan nama severity (`critical`, `high`).
 * Yang dihindari adalah mencampur dua bahasa di dalam satu label.
 */
export const id = {
  // ── Navigasi dan kerangka ─────────────────────────────────────────────────
  'nav.home': 'Home',
  'nav.model': 'Model',
  'nav.bagianUtama': 'Bagian utama',
  'nav.tema': 'Tema',
  'nav.semuaSitus': 'Semua Situs',

  'tema.system': 'Sistem',
  'tema.light': 'Terang',
  'tema.dark': 'Gelap',

  'locale.label': 'Bahasa',
  'locale.id': 'Indonesia',
  'locale.en': 'English',

  // ── Dashboard ─────────────────────────────────────────────────────────────
  'dash.judul': 'Situs',
  'dash.teks': 'Pantauan berkala kesehatan, performa, dan riwayat temuan situs Anda.',
  'dash.metrikSitus': 'Situs',
  'dash.metrikTemuan': 'Temuan terbuka',
  'dash.metrikBersih': 'Situs bersih',
  'dash.ringkasanLabel': 'Ringkasan pemantauan',
  'dash.buka': 'Buka',
  'dash.belumAdaSitus': 'Belum ada situs yang dipantau',
  'dash.belumAdaSitusTeks':
    'Tambahkan situs pertama Anda, lalu jalankan pemindaian untuk melihat apa yang rusak.',

  // ── Tambah situs ──────────────────────────────────────────────────────────
  'tambah.pemicu': 'Tambah Situs',
  'tambah.nama': 'Nama',
  'tambah.namaPetunjuk': 'mis. Springair',
  'tambah.url': 'Alamat',
  'tambah.simpan': 'Simpan Situs',
  'tambah.batal': 'Batal',
  'tambah.namaKosong': 'Nama situs belum diisi.',
  'tambah.urlKosong': 'Alamat situs belum diisi.',
  'tambah.sudahAda': 'Anda sudah memantau situs dengan alamat itu.',

  // ── Hapus situs ───────────────────────────────────────────────────────────
  'hapus.pemicu': 'Hapus',
  'hapus.tanya': 'Hapus situs ini?',
  'hapus.teks':
    '{temuan} temuan dan {run} run akan hilang permanen. Tidak ada undo.',
  'hapus.konfirmasi': 'Hapus Permanen',
  'hapus.batal': 'Batal',
  'hapus.sedangDipindai': 'Situs ini sedang dipindai. Tunggu sampai selesai, lalu hapus.',

  // ── Tab dan kategori ──────────────────────────────────────────────────────
  'tab.aspek': 'Aspek pemindaian',
  'tab.tagAi': 'AI',
  'tab.tagAdmin': 'ADMIN',
  'kategori.dinilaiAi':
    'Dinilai claude-seo, bukan diukur aturan. Jawabannya bisa bergeser antar analisis walau situsnya tidak berubah, jadi "sudah diperbaiki" di sini lebih lemah artinya daripada di kategori lain.',

  // ── Tabel temuan ──────────────────────────────────────────────────────────
  'tabel.severity': 'Severity',
  'tabel.aturan': 'Aturan',
  'tabel.halaman': 'Halaman',
  'tabel.terlihat': 'Terlihat',
  'tabel.aksi': 'Aksi',
  'tabel.lihat': 'Lihat',
  'tabel.temuanTerbuka': '{n} temuan terbuka.',
  'tabel.temuanDiabaikan': '{n} temuan diabaikan.',
  'tabel.dipindai': 'dipindai {waktu}',
  'tabel.terlewat': 'terlewat {n}×',
  'tabel.run': 'run {n}',

  'saring.status': 'Status temuan',
  'saring.terbuka': 'Terbuka',
  'saring.diabaikan': 'Diabaikan',
  'saring.belumAdaDiabaikan': 'Belum ada temuan yang diabaikan di kategori ini.',

  'temuan.abaikan': 'Abaikan',
  'temuan.bukaLagi': 'Buka Lagi',
  'temuan.periksa': 'Periksa Sekarang',
  'temuan.memeriksa': 'Memeriksa…',
  'temuan.beres': 'beres',
  'temuan.masihAda': 'masih ada',
  'temuan.detail': 'Detail',

  // ── Keadaan kosong ────────────────────────────────────────────────────────
  'kosong.belumDipindai': 'Belum pernah dipindai',
  'kosong.belumDipindaiTeks': 'Jalankan pemindaian untuk melihat keadaan situs ini.',
  'kosong.bersih': 'Tidak ada yang rusak di sini',
  'kosong.bersihTeks': 'Pemindaian terakhir tidak menemukan apa pun di kategori ini.',
  'kosong.gagal': 'Pemindaian terakhir gagal',
  'kosong.gagalTeks':
    'Hasilnya tidak diketahui — ini bukan berarti situsnya bersih. Coba pindai lagi.',

  // ── Pemindaian ────────────────────────────────────────────────────────────
  'scan.tombol': 'Scan {kategori}',
  'scan.berjalan': '{nama} berjalan sejak {mulai}. Halaman ini akan berganti sendiri saat selesai.',
  'scan.sedangBerjalan': 'Pemindaian situs ini sedang berjalan.',
  'scan.gagalJalan': 'Pemindaian gagal dijalankan. Periksa log server.',
  'scan.tungguSelesai': 'Situs ini sedang dipindai. Tunggu sampai selesai.',

  // ── Ringkasan AI ──────────────────────────────────────────────────────────
  'ai.judul': 'Ringkasan AI',
  'ai.ulangi': 'Ringkas Ulang',
  'ai.mengulang': 'Meringkas…',
  'ai.gagal': 'Ringkasan gagal dibuat.',
  'ai.dilewati': 'Ringkasan dilewati: belum ada API key yang terverifikasi.',
  'ai.gagalJalan': 'Peringasan gagal dijalankan. Periksa log server.',
  'ai.lipatBuka': 'Lihat selengkapnya',
  'ai.lipatTutup': 'Ringkas',

  // ── Lighthouse ────────────────────────────────────────────────────────────
  'lh.judul': 'Lighthouse',
  'lh.perf': 'Perf',
  'lh.a11y': 'A11y',
  'lh.best': 'Best',
  'lh.seo': 'SEO',
  'lh.mobile': 'Mobile',
  'lh.desktop': 'Desktop',
  'lh.pengukuran': '{n} pengukuran ({strategi}).',
  'lh.belumDiukur': 'Belum ada pengukuran',
  'lh.belumDiukurTeks': 'Jalankan Scan Lighthouse untuk mengukur halaman situs ini.',
  'lh.ukurDesktop': 'Ukur desktop juga',
  'lh.ukurDesktopBiaya': 'pengukuran jadi dua kali lebih lama',

  // ── Unduh dan pengaturan situs ────────────────────────────────────────────
  'unduh.excel': 'Unduh Excel',
  'unduh.catatan': 'seluruh kategori, termasuk yang sudah beres dan diabaikan',
  'atur.pemicu': 'Pengaturan',
  'atur.judul': 'Pengaturan Situs',
  'atur.maxPages': 'Batas halaman',
  'atur.mode': 'Mode Lighthouse',
  'atur.sitemap': 'Alamat sitemap',
  'atur.aktif': 'Aktifkan pemindaian terjadwal',
  'atur.simpan': 'Simpan',
  'atur.tersimpan': 'Tersimpan.',



  // ── Model AI ──────────────────────────────────────────────────────────────
  'model.judul': 'Model AI',
  'model.teks1':
    'claude dan agy dipilih di sini — keduanya punya login sendiri di mesin ini, jadi tidak ada API key yang perlu disimpan. Pilihannya berlaku seketika, tanpa jalan ulang server.',
  'model.teks2':
    'Model yang memakai API key dikonfigurasi lewat .env, dan hanya dari sana. Tidak ada daftar model di dalam kode: isi WEBLYZER_AI_MODEL dengan apa pun yang dikenali penyedianya, dan model yang salah tulis akan ditolak penyedianya dengan pesannya sendiri.',
  'model.labelCli': 'CLI di mesin ini',
  'model.labelModel': 'Model',
  'model.cli.claude': 'Langganan Claude Anda',
  'model.cli.agy': 'Langganan agy Anda',
  'model.simpanUji': 'Simpan & Periksa',
  'model.memeriksa': 'Memanggil CLI…',
  'model.pakaiEnv': 'Lepaskan, pakai .env',
  'model.melepas': 'Melepaskan…',
  'model.cliJawab': '{cli} menjawab: {jawab}',
  'model.cliGagal': '{cli} tersimpan, tapi gagal saat dipanggil: {galat}',
  'model.cliTakDikenal': 'CLI tidak dikenal: {cli}',
  'model.sumberWeb': 'dipilih di halaman ini',
  'model.sumberEnv': 'dari .env',
  'model.catatanKunci':
    'Hanya jalur CLI yang bisa dipilih di sini, dan itu batas yang disengaja: claude dan agy memakai loginnya sendiri di mesin ini, jadi yang tersimpan cuma nama CLI dan nama model. API key tidak pernah lewat form — ia hanya dibaca dari .env, supaya rahasia tidak menyeberang lewat browser dan tidak tersimpan di berkas database yang tidak terenkripsi.',
  'model.aktif': 'Aktif lewat jalur {jalur} dengan model {model}',
  'model.catatanNama':
    'Nama penyedia yang base URL-nya sudah diketahui: {daftar}. Nama lain tetap bisa dipakai asal ia bicara protokol OpenAI — sebutkan base URL-nya di WEBLYZER_AI_BASE_URL. Tidak ada daftar model di dalam kode, jadi menambah model berarti mengganti satu baris di .env, bukan mengedit program.',
  'model.catatanAi':
    'Lapisan AI hanya menyusun rangkuman dari temuan yang sudah ada. Ketujuh aspek pemindaian berjalan sendiri tanpa AI, dan skor Lighthouse tetap hasil pengukuran — bukan tebakan model.',


  // ── Umum ──────────────────────────────────────────────────────────────────
  'umum.situsTidakDitemukan': 'Situs {id} tidak ditemukan.',
  'umum.temuanTidakDitemukan': 'Temuan {id} tidak ditemukan.',
  'umum.kunjungi': 'Kunjungi {url}',
  // ── Nama tombol scan per aspek ────────────────────────────────────────────
  'scan.bugs': 'Scan Bug',
  'scan.console': 'Scan Console',
  'scan.security': 'Scan Security',
  'scan.seo': 'Scan SEO',
  'scan.geo': 'Analisis GEO',
  'scan.audit': 'Audit Full',
  'scan.lighthouse': 'Scan Lighthouse',
  'scan.memulai': 'Memulai…',

  // ── Tambahan komponen ─────────────────────────────────────────────────────
  'temuan.periksaLagi': 'Periksa Lagi',
  'temuan.beresPesan': 'Sudah beres — temuan itu ditutup dan hilang dari daftar.',
  'temuan.masihAdaPesan': 'Masih ada. Belum ada yang berubah di halaman itu.',
  'ai.ringkasSekarang': 'Ringkas Sekarang',
  'ai.gagalTag': 'AI gagal',
  'hapus.yakin': 'Anda yakin?',
  'hapus.riwayat': 'Seluruh riwayat pemindaiannya ikut hilang.',
  'hapus.menghapus': 'Menghapus…',
  'tambah.contoh': 'Misal: Toko Online Saya',
  'tambah.menyimpan': 'Menyimpan…',
  'atur.ikutJadwal': 'Ikut pemindaian terjadwal',
  'atur.menyimpan': 'Menyimpan…',
  'lh.strategy': 'Strategy',
  'tab.kategori': 'Kategori',
  // ── Lighthouse: keadaan kosong khusus halaman ini ─────────────────────────
  'lh.belumCrawl': 'Belum pernah dipindai',
  'lh.belumCrawlTeks':
    'Halamannya pun belum diketahui. Lighthouse mengukur halaman yang sudah tersimpan, jadi pemindaian harus jalan lebih dulu.',
  'lh.bukaTabBug': 'Buka tab Bug untuk memindai',
  'lh.strategiPengukuran': 'Strategi pengukuran',
  'lh.desktopMati': 'Pengukuran desktop belum dinyalakan',
  'lh.desktopMatiTeks': 'Nyalakan di atas, lalu jalankan Scan Lighthouse.',
  'lh.gagal': 'Pemindaian terakhir gagal',
  'lh.gagalTeks': 'Skornya tidak diketahui — ini bukan berarti halamannya cepat. Ukur lagi.',
  'lh.desktopBelumTerukur': 'Desktop sudah dinyalakan tapi belum sempat terukur. Jalankan Scan Lighthouse.',
  'lh.belumSatuPun': 'Halamannya sudah diketahui, tapi belum satu pun diukur.',
  'run.full': 'Scan lengkap',
  'meta.deskripsi': 'Apa yang rusak di situs saya, dan apa yang sudah beres.',
} as const

export type Kamus = Record<keyof typeof id, string>
