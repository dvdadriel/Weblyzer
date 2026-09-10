# Skill Weblyzer

Panduan aspek pemindaian untuk model bahasa, **tercommit di dalam proyek ini.**

Siapa pun yang meng-clone repositori ini mendapat berkas-berkas ini. Tidak ada
plugin yang harus dipasang lebih dulu, tidak ada langganan tertentu yang harus
dimiliki, dan tidak ada satu vendor pun yang disebut sebagai syarat.

## Kenapa ada

Sebelum ini, aspek GEO dan Audit menyebut nama skill dari plugin luar
(`claude-seo:seo-geo`). Akibatnya dua hal:

1. Orang yang meng-clone proyek ini tanpa plugin itu mendapat aspek yang gagal
   dengan pesan yang tidak menjelaskan apa pun.
2. Pengetahuan tentang **apa yang harus diperiksa** tinggal di luar proyek,
   jadi ia tidak bisa dibaca, tidak bisa ditinjau, dan tidak bisa diperbaiki
   oleh siapa pun yang memakai Weblyzer.

Berkas di direktori ini memindahkan pengetahuan itu ke dalam. Kalau plugin
`claude-seo` memang terpasang, skill di sini menyuruh memakainya — ia lebih
cepat dan sudah teruji. Kalau tidak, instruksinya lengkap untuk dikerjakan
sendiri dengan tool biasa.

## Apa yang bisa dan tidak bisa dipakai model mana pun

Ini pertanyaan yang paling penting, dan jawabannya bukan "semua bisa":

| Aspek | Butuh tool? | Bisa dijalankan model apa? |
|---|---|---|
| `mobile-parity` | tidak | **model apa pun**, termasuk lewat API key biasa (NIM, Groq, Ollama) — buktinya di bawah |
| `geo` | ya (ambil halaman, tulis berkas) | hanya CLI agentik: `claude`, `agy`, atau yang setara |
| `audit` | ya (jelajah, ambil halaman, tulis berkas) | hanya CLI agentik |

Bedanya bukan soal kecerdasan modelnya, tapi soal siapa yang mengumpulkan
buktinya:

- **Mobile Parity mengumpulkan buktinya sendiri.** Weblyzer membuka halaman di
  tiga lebar layar dengan Playwright dan mengukur angkanya
  (`lib/scanners/mobile-parity.ts`). Model hanya menerima angka sebagai teks,
  jadi ia tidak butuh tool apa pun — dan karena itu model mana pun bisa.
- **GEO dan Audit harus mengambil sendiri.** Keduanya perlu membuka halaman,
  membaca `robots.txt`, memeriksa schema, menjelajah tautan. Itu butuh tool,
  dan tool butuh runtime agentik. Model lewat API key biasa tidak punya
  keduanya.

Itu sebabnya Mobile Parity dibangun dengan pengukuran lebih dulu, bukan dengan
prompt lebih dulu.

## Kontrak keluaran — sama untuk semua aspek

Setiap skill yang menghasilkan temuan **wajib** mengembalikan JSON berbentuk:

```json
{"temuan": [
  {
    "rule": "kebab-case-stabil",
    "severity": "critical|high|medium|low|info",
    "title": "satu kalimat, maksimal 200 karakter",
    "url": "https://... atau null bila berlaku untuk seluruh situs",
    "detail": "penjelasan dan apa yang perlu diperbaiki"
  }
]}
```

Empat aturan keras, dan semuanya lahir dari kegagalan yang benar-benar
terjadi di proyek ini:

1. **`rule` harus stabil antar-run, dan tidak boleh memuat angka.**
   Nama aturan adalah identitas temuan di basis data. Dua analisis GEO
   berurutan atas satu situs tanpa mengubah apa pun pernah menghasilkan 10
   temuan ditandai "sudah diperbaiki" dan 12 dibuka sebagai baru — nol yang
   bertahan, karena modelnya menamai masalah yang sama dengan
   `product-schema-tanpa-penawaran` lalu `schema-produk-tanpa-penawaran`.
   Nama seperti `judul-pendek-12-halaman` sama buruknya: hitungannya berubah
   minggu depan.

2. **Satu temuan per masalah, bukan per halaman.** Aturan yang sama di 40
   halaman adalah satu masalah; 40 baris akan mengubur tabnya. Sebutkan
   jumlah halamannya di `detail`.

3. **Jangan mengarang.** Temuan yang tidak Anda periksa sendiri jangan
   disebut, dan URL yang tidak Anda buka jangan ditulis.

4. **Array kosong adalah jawaban yang sah.** `{"temuan":[]}` lebih baik
   daripada temuan yang dipaksa ada. Aspek yang selalu menemukan sesuatu akan
   diabaikan seluruhnya — termasuk saat temuannya sungguhan.

Kalau Anda dijalankan sebagai CLI dengan tool tulis-berkas, tulis JSON itu ke
berkas yang diminta pemanggil, **bukan** sebagai jawaban akhir. Alasannya
sudah terbukti: yang membaca hasil ini adalah program, dan program itu hanya
menerima pesan terakhir Anda — satu kalimat penutup setelah JSON menghapus
seluruh pekerjaan Anda.

## Daftar skill

- [`mobile-parity.md`](mobile-parity.md) — kesejajaran ponsel, tablet, dan
  desktop. Sudah terpasang sebagai aspek yang mengukur sendiri; skill-nya
  untuk menafsirkan dan memverifikasi perbaikan.
- [`geo.md`](geo.md) — keterlihatan di mesin jawab dan AI search.
- [`audit.md`](audit.md) — audit menyeluruh arsitektur konten.

## Severity: pakai yang mana

Dipakai seragam di seluruh Weblyzer, dan bukan selera:

| Severity | Artinya |
|---|---|
| `critical` | menghalangi pemakaian atau menghilangkan pendapatan hari ini |
| `high` | merugikan nyata, dan pemakainya akan menyadarinya |
| `medium` | salah, tapi bisa dijadwalkan |
| `low` | rapi-rapi; tidak menyentuh keputusan siapa pun |
| `info` | catatan, bukan masalah |

Kalau ragu antara dua tingkat, pilih yang lebih rendah. Aspek yang menandai
segalanya `critical` membuat kata itu tidak berarti apa-apa.
