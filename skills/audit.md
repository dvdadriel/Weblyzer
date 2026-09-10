# Skill: Audit (arsitektur konten menyeluruh)

Audit yang menjawab pertanyaan yang tidak bisa dijawab satu halaman: **apakah
situs ini disusun untuk orang yang sedang memutuskan sesuatu.**

Baca [`README.md`](README.md) lebih dulu untuk kontrak keluarannya.

## Butuh tool, dan ini yang paling mahal

Aspek ini menjelajah, mengambil halaman, dan menulis berkas. Ia hanya bisa
dijalankan CLI agentik — `claude`, `agy`, atau yang setara. Lamanya bisa
puluhan menit dan memakai banyak token, jadi jangan dijalankan untuk memeriksa
satu perubahan kecil.

Kalau plugin `claude-seo` terpasang, **pakai skill `claude-seo:seo-audit`**,
termasuk pendeteksian jenis bisnis dan pendelegasian ke spesialisnya. Lewati
spesialis yang butuh kredensial API yang tidak tersedia — jangan gagal karena
itu, dan **jangan menebak datanya.**

Batasi penjelajahan pada jumlah halaman yang diberikan pemanggil.

## Jangan ulangi yang sudah diperiksa

Weblyzer sudah memeriksa situs ini secara deterministik untuk: status HTTP,
halaman kosong, resource rusak, redirect, exception dan pesan console, header
keamanan, cookie, mixed content, TLS, 12 aturan SEO on-page, skor Lighthouse
mobile dan desktop, serta — sejak Mobile Parity ada — kesejajaran tata letak
dan tipografi antar-lebar layar.

Semuanya sudah menjadi temuan di tabnya masing-masing. **Laporkan yang belum
tercakup.**

## Yang diperiksa

### 1. Arsitektur konten dan klaster topik

- Apakah ada halaman untuk setiap tahap keputusan, atau hanya halaman produk
  dan beranda? Yang paling sering hilang: perbandingan, panduan ukuran,
  penjelasan istilah, dan halaman harga.
- Apakah halaman yang saling berkaitan benar-benar bertaut, atau masing-masing
  berdiri sendiri?
- Apakah ada satu halaman yang menjadi pusat sebuah topik, atau isinya
  tersebar di enam artikel berita yang saling menimpa?

### 2. Kecocokan jenis halaman dengan intent

Ini yang paling sering menjelaskan kenapa halaman yang "sudah dioptimasi"
tetap tidak berguna: bentuk halamannya tidak sesuai dengan yang dicari orang.

- Kata kunci yang bermaksud transaksi tetapi mendarat di artikel blog.
- Kata kunci yang bermaksud belajar tetapi mendarat di halaman produk.
- Halaman "beli X" yang tidak memuat harga, stok, atau cara membeli.

### 3. E-E-A-T

Bukan daftar centang. Yang ditanyakan: adakah alasan bagi orang asing untuk
memercayai halaman ini?

- Pengalaman langsung yang terlihat: foto sendiri, angka sendiri, kasus
  sendiri — bukan stok dan klaim umum.
- Penulis atau penanggung jawab yang bisa diverifikasi, khususnya untuk topik
  yang menyentuh uang atau kesehatan.
- Sitasi ke sumber luar yang memang ada.

### 4. Schema markup

- `Product` tanpa `offers` adalah kegagalan yang paling sering: tanpa harga dan
  ketersediaan, hasil kaya tidak muncul sama sekali.
- `@id` yang menghubungkan entitas antar-halaman, bukan tiap halaman
  mendeklarasikan organisasi baru.
- `LocalBusiness` dengan NAP yang konsisten untuk bisnis yang punya lokasi.
- Schema yang **berbohong** — menyebut rating yang tidak ada di halaman —
  adalah `high`, bukan `medium`: itu bisa membuat seluruh domain kehilangan
  hasil kaya.

### 5. Konten tipis dan kembar

- Halaman yang isinya template dengan satu kata berganti.
- Paragraf yang sama disalin di banyak halaman.
- Halaman yang ada hanya untuk mengisi menu.

Sebut jumlah halamannya di `detail`, bukan satu temuan per halaman.

### 6. Cakupan sitemap

- Halaman penting yang tidak ada di sitemap.
- Sitemap yang memuat URL redirect, 404, atau noindex.
- Halaman lokasi yang dibuat massal tanpa isi yang berbeda — sebut apa adanya;
  ini merugikan, bukan menambah.

### 7. Khas industrinya

Deteksi dulu jenis bisnisnya, lalu periksa yang khas untuknya. E-commerce
butuh harga dan stok; jasa lokal butuh area layanan dan jam buka; B2B butuh
studi kasus dan halaman harga yang tidak menyembunyikan harga.

## Batas

- **Satu temuan per masalah.** Audit adalah aspek yang paling mudah
  menghasilkan enam puluh baris untuk satu kesenjangan strategi. Kalau tujuh
  temuan berakar pada satu hal, tulis satu temuan dan sebutkan ketujuh
  gejalanya di `detail`.
- **Jangan menebak angka.** Trafik, peringkat, volume pencarian, dan pangsa
  pasar tanpa akses ke datanya jangan disebut.
- **Jangan mengulang Mobile Parity.** Tata letak dan tipografi antar-lebar
  sudah diukur deterministik; penilaian model atas hal yang sudah terukur
  hanya menambah keraguan.
- **Boleh menjawab "sudah rapi".** `{"temuan":[]}` adalah jawaban yang sah dan
  lebih berguna daripada sepuluh temuan `low` yang dipaksa ada.
