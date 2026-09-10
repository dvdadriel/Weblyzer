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
  'nav.masuk': 'Masuk',
  'nav.keluar': 'Keluar',
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
  'kosong.butuhAkun': 'Butuh akun',
  'kosong.butuhAkunTeks':
    'Aspek ini memakai API key milik Anda sendiri, jadi ia butuh tempat untuk menyimpannya. Aspek pemindaian lainnya tetap jalan tanpa akun.',
  'kosong.adminSaja': 'Hanya untuk pemilik instance',
  'kosong.adminSajaTeks':
    'Aspek ini dijalankan oleh CLI Claude di mesin server, bukan oleh API key Anda, jadi hanya pemilik instance yang bisa memicunya. Temuan yang sudah ada tetap terlihat di bawah.',

  // ── Pemindaian ────────────────────────────────────────────────────────────
  'scan.tombol': 'Scan {kategori}',
  'scan.berjalan': '{nama} berjalan sejak {mulai}. Halaman ini akan berganti sendiri saat selesai.',
  'scan.sedangBerjalan': 'Pemindaian situs ini sedang berjalan.',
  'scan.gagalJalan': 'Pemindaian gagal dijalankan. Periksa log server.',
  'scan.tungguSelesai': 'Situs ini sedang dipindai. Tunggu sampai selesai.',
  'scan.adminSaja':
    'Aspek ini berjalan di server dengan CLI-nya sendiri, jadi hanya pemilik instance yang bisa memicunya.',

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

  // ── Masuk ─────────────────────────────────────────────────────────────────
  'masuk.judul': 'Masuk',
  'masuk.teks':
    'Tanpa akun, semua aspek pemindaian tetap bisa dipakai — yang butuh akun hanya ringkasan AI, karena ia memakai API key milik Anda sendiri.',
  'masuk.email': 'Email',
  'masuk.password': 'Password',
  'masuk.tombol': 'Masuk',
  'masuk.memeriksa': 'Memeriksa…',
  'masuk.google': 'Masuk dengan Google',
  'masuk.tanpaDaftar': 'Instance ini tidak menerima pendaftaran mandiri. Akun dibuat oleh pemiliknya.',
  'masuk.kosong': 'Email dan password harus diisi.',
  'masuk.salah': 'Email atau password salah.',
  'masuk.lewatGoogle': 'Akun ini masuk lewat Google. Pakai tombol di bawah.',
  'masuk.galatOauthMati': 'Masuk lewat Google belum dikonfigurasi di instance ini.',
  'masuk.galatState': 'Permintaan masuk kedaluwarsa atau tidak cocok. Coba lagi dari awal.',
  'masuk.galatTukar': 'Google menolak menukar kode masuk. Coba lagi.',
  'masuk.galatToken': 'Identitas dari Google tidak bisa diverifikasi.',
  'masuk.galatTidakTerdaftar':
    'Akun Google itu belum terdaftar di instance ini. Instance ini tidak menerima pendaftaran mandiri — minta pemiliknya membuatkan akun.',

  // ── Akun ──────────────────────────────────────────────────────────────────
  'akun.judul': 'Akun',
  'akun.masukSebagai': 'Masuk sebagai',
  'akun.gantiPassword': 'Ganti password',
  'akun.passwordSekarang': 'Password sekarang',
  'akun.passwordBaru': 'Password baru',
  'akun.tombolGanti': 'Ganti Password',
  'akun.menyimpan': 'Menyimpan…',
  'akun.tanpaPassword':
    'Akun ini masuk lewat Google dan belum punya password. Mengisi form ini menambahkan satu, jadi Anda bisa masuk dengan cara mana pun.',
  'akun.passwordPendek': 'Password baru minimal {n} karakter.',
  'akun.passwordLamaSalah': 'Password lama salah.',
  'akun.passwordDiganti':
    'Password diganti. Sesi yang sudah terbit di perangkat lain tidak ikut tercabut.',
  'akun.peringatanSesi':
    'Sesi di proyek ini tidak punya tabel, jadi mengganti password tidak mengeluarkan Anda dari perangkat lain yang sudah masuk. Kalau ada perangkat yang hilang, hubungi pemilik instance untuk menghapus dan membuat ulang akunnya.',
  'akun.daftarJudul': 'Akun di instance ini',
  'akun.kolomEmail': 'Email',
  'akun.kolomPeran': 'Peran',
  'akun.kolomCaraMasuk': 'Cara masuk',
  'akun.kolomDibuat': 'Dibuat',
  'akun.caraGoogle': 'Google saja',
  'akun.caraPassword': 'Password',
  'akun.buatJudul': 'Buat akun',
  'akun.buatTeks':
    'Instance ini tidak menerima pendaftaran mandiri, jadi akun dibuat di sini. Pendaftaran terbuka berarti moderasi, verifikasi email, dan penyalahgunaan kuota — tiga masalah yang belum ada.',
  'akun.passwordAwal': 'Password awal',
  'akun.jadikanAdmin': 'Jadikan admin',
  'akun.jadikanAdminTeks': 'bisa memicu aspek GEO dan Audit',
  'akun.buatTombol': 'Buat Akun',
  'akun.membuat': 'Membuat…',
  'akun.dibuat': 'Akun {email} dibuat.',
  'akun.butuhAkun': 'Aksi ini butuh akun. Masuk dulu.',
  'akun.hanyaAdmin': 'Aksi ini hanya untuk admin.',

  // ── Model AI ──────────────────────────────────────────────────────────────
  'model.judul': 'Model AI',
  'model.teks1':
    'Ringkasan AI memakai API key Anthropic milik Anda sendiri, dan tagihannya milik Anda. Kuncinya disimpan terenkripsi dan tidak pernah dikirim kembali ke browser — yang ditampilkan di sini hanya empat karakter terakhirnya.',
  'model.teks2':
    'Kunci baru diperiksa dulu terhadap Anthropic sebelum dianggap berlaku, dan ringkasan AI tetap mati sampai pemeriksaan itu lolos. Pemeriksaannya tidak memakai token.',
  'model.labelModel': 'Model',
  'model.labelKunci': 'API key',
  'model.simpanUji': 'Simpan & Periksa',
  'model.memeriksa': 'Memeriksa…',
  'model.lupakan': 'Lupakan kunci',
  'model.menghapus': 'Menghapus…',
  'model.gantiPetunjuk': 'Isi untuk mengganti kunci yang tersimpan',
  'model.berlaku': 'Kunci berlaku untuk {model}',
  'model.berakhiran': 'berakhiran {ekor}',
  'model.belumTerbukti':
    'Kunci tersimpan tapi belum terbukti berlaku. Ringkasan AI mati sampai ia lolos pemeriksaan.',
  'model.tersimpanBerlaku': 'Kunci tersimpan dan berlaku. Ringkasan AI sekarang aktif.',
  'model.labelPenyedia': 'Penyedia',
  'model.kunciTakPerlu': 'Tidak perlu API key — agy memakai login mesin server.',
  'model.cliBerjalan': 'agy menjawab. Ringkasan AI sekarang aktif lewat CLI di server.',
  'model.cliBerlaku': 'agy siap dengan {model}',
  'model.cliCatatan':
    'Penyedia agy CLI hanya untuk admin, dan itu batas keamanan bukan preferensi: ia menjalankan CLI di mesin server, jadi kredensial dan tagihannya milik mesin — sama seperti aspek GEO dan Audit. Penyedia ini juga tidak berjalan di dalam container.',
  'model.catatanAi':
    'Lapisan AI hanya menyusun rangkuman dari temuan yang sudah ada. Ketujuh aspek pemindaian berjalan sendiri tanpa AI, dan skor Lighthouse tetap hasil pengukuran — bukan tebakan model.',
  'model.catatanAdmin':
    'Aspek GEO dan Audit tidak memakai kunci ini. Keduanya menjalankan CLI claude di mesin server dengan plugin claude-seo, jadi kredensialnya milik mesin. Karena itu keduanya hanya bisa dipicu admin.',

  // ── Kuota guest ───────────────────────────────────────────────────────────
  'kuota.situs': 'Tanpa akun, hanya {n} situs yang bisa dipantau. Masuk untuk menambah lagi.',
  'kuota.scan': 'Tanpa akun, {n} pemindaian per {jam} jam. Masuk untuk memindai tanpa batas.',

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
