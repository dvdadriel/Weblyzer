# Skill: GEO (keterlihatan di mesin jawab)

Memeriksa apakah sebuah situs bisa **dikutip** oleh mesin jawab dan AI search —
Google AI Overviews, ChatGPT, Perplexity, Bing Copilot — bukan apakah ia
peringkat satu di hasil biru.

Baca [`README.md`](README.md) lebih dulu untuk kontrak keluarannya. Aspek ini
menghasilkan temuan, jadi kontrak itu berlaku penuh.

## Butuh tool, dan karena itu butuh CLI agentik

Aspek ini harus membuka halaman, membaca `robots.txt`, memeriksa schema, dan
mengikuti tautan. Model lewat API key biasa tidak punya tool untuk itu.

Kalau plugin `claude-seo` terpasang, **pakai skill `claude-seo:seo-geo`** — ia
lebih cepat dan sudah teruji, dan berkas ini tidak berpura-pura
menggantikannya. Kalau tidak terpasang, kerjakan sendiri dengan urutan di
bawah. Jangan gagal hanya karena pluginnya tidak ada.

## Jangan ulangi yang sudah diperiksa

Weblyzer sudah memeriksa situs ini dengan 12 aturan SEO deterministik: judul
hilang, judul kembar, meta description, h1, canonical, hreflang, noindex.
Semuanya sudah jadi temuan di tab SEO.

Melaporkannya lagi di sini berarti satu masalah muncul di dua tab, dan
pemakainya mengerjakannya dua kali. **Laporkan hanya yang di luar daftar itu.**

## Yang diperiksa

### 1. Keterjangkauan crawler AI

- `robots.txt`: apakah `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`
  diblokir? Blokir yang **sengaja** bukan temuan — sebutkan sebagai info kalau
  terlihat seperti keputusan, dan sebagai temuan kalau terlihat seperti
  kelalaian (mis. `Disallow: /` untuk semua agen di situs pemasaran).
- Apakah isi utamanya butuh JavaScript? Sebagian mesin jawab tidak
  menjalankannya. Bandingkan HTML mentah dengan hasil render.
- Status HTTP dan redirect pada halaman yang paling mungkin dikutip.

### 2. `llms.txt`

Ada atau tidak. **Severity paling tinggi `low`,** dan itu disengaja: tidak satu
pun mesin pencari besar mengumumkan bahwa mereka memakainya, jadi menandainya
`high` menyuruh orang mengerjakan hal yang belum terbukti berguna. Sebutkan apa
adanya: murah dibuat, manfaatnya belum pasti.

### 3. Bisa dikutip per paragraf

Ini inti aspeknya. Mesin jawab mengutip **potongan**, bukan halaman.

- Apakah setiap bagian menjawab satu pertanyaan yang utuh sendiri, atau ia
  hanya bermakna setelah membaca tiga paragraf sebelumnya?
- Apakah angka, harga, dan klaim punya konteks di paragraf yang sama? "Naik
  23%" tanpa menyebut dari kapan tidak bisa dikutip.
- Apakah ada blok tanya-jawab untuk pertanyaan yang memang dicari orang?
- Apakah jawabannya ada di awal bagian, atau tertimbun setelah dua paragraf
  pembuka yang tidak menjawab apa pun?

### 4. Sinyal entitas brand

- `Organization` schema dengan `sameAs` ke profil yang benar-benar ada.
- Konsistensi nama, alamat, dan telepon antar-halaman.
- Halaman tentang-kami yang menyebut siapa, sejak kapan, dan di mana — bukan
  hanya kalimat visi-misi.
- Penulis dengan identitas yang bisa diverifikasi pada konten yang
  membutuhkannya.

### 5. Kesiapan per platform

Jangan menulis empat temuan terpisah untuk empat platform kalau sebabnya satu.
Yang berbeda nyata:

- **AI Overviews** — bergantung pada indeks Google, jadi schema dan
  keterjangkauan biasa berlaku penuh.
- **ChatGPT dan Perplexity** — mengambil langsung; keterjangkauan `robots.txt`
  dan HTML tanpa JavaScript lebih menentukan.
- **Bing Copilot** — butuh terindeks Bing, yang sering terlupakan sepenuhnya.
  Periksa apakah situsnya ada di Bing.

## Batas

- **Jangan menebak angka trafik atau peringkat.** Kalau tidak punya akses ke
  Search Console atau alat peringkat, jangan menyebut angka. Temuan yang
  angkanya dikarang lebih buruk daripada tidak ada temuan.
- **Jangan menilai kualitas tulisan sebagai selera.** "Prosanya kurang
  menarik" bukan temuan; "paragraf ini tidak bisa dikutip karena angkanya
  tanpa periode waktu" adalah temuan.
- **Jangan menyentuh performa dan keamanan.** Keduanya sudah diukur
  deterministik.
