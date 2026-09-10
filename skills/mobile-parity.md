# Skill: Mobile Parity

Memeriksa apakah tampilan ponsel dan tablet **sejalan** dengan desktop — bukan
apakah masing-masing "bagus" secara terpisah.

Baca [`README.md`](README.md) lebih dulu untuk kontrak keluarannya.

## Kenapa "parity", bukan "mobile-friendly"

Alat mobile-friendly yang sudah ada menjawab "apakah halaman ini bisa dibuka
di ponsel". Pertanyaan yang dijawab aspek ini berbeda: **apakah keputusan
desain yang dibuat untuk desktop ikut sampai ke ponsel.**

Empat keluhan yang melahirkannya, semuanya dari pengalaman nyata membangun
situs:

1. **Mobile terabaikan.** Semua perhatian ke desktop, dan hasil di ponsel
   ternyata jelek — bukan karena ada yang salah menulis CSS, tapi karena tidak
   ada yang pernah membukanya di lebar 390 piksel.
2. **Tata letak hancur di ponsel.** Kartu terpotong, tulisan terpotong, yang
   seharusnya satu kolom penuh jadi empat kolom sempit, jarak antar-elemen
   rapat sampai menempel.
3. **Gaya penulisan meleset.** Semuanya tebal di ponsel sehingga tidak ada
   yang menonjol; rasio ukuran judul terhadap deskripsi tidak sejalan dengan
   desktop.
4. **Fitur yang tidak bisa dipakai di layar sentuh.** Menu yang hanya muncul
   saat kursor lewat, tombol yang terlalu kecil untuk jempol, zoom yang
   dimatikan.

## Yang sudah diukur Weblyzer, dan Anda tidak perlu mengulanginya

Aspek ini **bukan** aspek yang menyerahkan penilaian ke model. Weblyzer membuka
setiap halaman terpilih pada tiga lebar dengan Playwright, lalu mengukur:

| Lebar | Ukuran | Sentuh |
|---|---|---|
| mobile | 390 × 844 | ya |
| tablet | 820 × 1180 | ya |
| desktop | 1440 × 900 | tidak |

Yang diukur per lebar (`lib/scanners/mobile-parity.ts`):

- lebar dokumen terhadap lebar viewport — menggulir menyamping atau tidak
- elemen yang melewati tepi kanan, **hanya yang terdalam** (satu tabel selebar
  900 piksel membuat seluruh induknya ikut lewat; yang bisa ditindaklanjuti
  adalah selnya)
- kotak yang memotong isinya sendiri, kecuali yang memakai `text-overflow:
  ellipsis` atau `-webkit-line-clamp` — pemotongan bersengaja bukan kerusakan
- porsi teks tebal, **ditimbang panjang teks** bukan jumlah elemen
- ukuran huruf isi (modus tertimbang) dan ukuran judul terbesar yang tampil
- jarak median antar-anak pada wadah flex/grid
- jumlah kolom pada setiap wadah grid
- target sentuh di bawah 24 piksel (WCAG 2.2 SC 2.5.8), hanya pada lebar sentuh
- aturan `:hover` yang **mengubah keterlihatan** — dibaca dari stylesheet

Kesebelas aturannya ada di `lib/analyzers/mobile-parity.ts`, dengan ambang dan
alasan setiap angkanya.

Selain angka, setiap pemindaian juga menyimpan **tangkapan layar**: satu
halaman penuh per lebar, ditambah potongan yang menunjuk tepat ke elemen
bermasalah. Semuanya JPEG kualitas 70 pada skala 1x — bawaan Playwright
(PNG pada device scale factor) adalah 463 MB untuk 25 halaman, sedangkan ini
26 MB. Hanya pemindaian terakhir yang disimpan, karena temuan menggambarkan
keadaan sekarang dan gambar lama bisa menunjukkan cacat yang sudah
diperbaiki.

**Semuanya deterministik.** Jawabannya sama setiap run selama situsnya tidak
berubah, jadi riwayat `open → fixed` di Weblyzer bisa dipercaya penuh. Itu
sebabnya penilaian model tidak pernah menjadi baris temuan di aspek ini.

## Tugas Anda sebagai model

Tiga hal, dan tidak satu pun di antaranya "cari masalah baru lalu tulis
temuan".

### 1. Menafsirkan: satu akar, bukan sebelas gejala

Temuan Mobile Parity sering berkerumun karena satu sebab. Yang berguna bagi
pemakainya adalah menyebut sebab itu.

Pola yang sudah terlihat berulang:

- `mobile-tanpa-penyesuaian` + `mobile-kolom-terlalu-banyak` +
  `mobile-jarak-sempit` bersamaan → hampir selalu **tidak ada breakpoint sama
  sekali**. Satu perbaikan (`grid-template-columns` di dalam media query)
  menghapus ketiganya. Jangan menyarankan tiga pekerjaan.
- `mobile-hierarki-rata` + `mobile-hampir-semua-tebal` → skala tipografinya
  memang tidak ada, bukan dua setelan yang meleset. Sarankan skala (mis. 1,25×
  atau 1,333×) dan satu berat huruf untuk isi.
- `mobile-elemen-keluar-viewport-*` dengan contoh berupa `td`, `pre`, atau
  `img` → satu elemen berlebar tetap, bukan tata letaknya. Perbaikannya lokal:
  `max-width: 100%`, `overflow-x: auto` pada pembungkusnya, atau
  `table-layout: fixed`.
- `mobile-scroll-menyamping-mobile` **tanpa** `mobile-elemen-keluar-viewport`
  → penyebabnya bukan elemen yang terlihat: biasanya margin negatif, `width:
  100vw` pada halaman yang punya scrollbar, atau `position: absolute` di luar
  aliran.

### 2. Memberi urutan yang benar

Urutkan menurut siapa yang paling dirugikan, bukan menurut severity mentah:

1. `mobile-viewport-meta-hilang` — seluruh halaman tak terbaca di ponsel. Satu
   baris HTML memperbaikinya. Selalu pertama.
2. `mobile-zoom-dimatikan` — merugikan orang yang perlu memperbesar tulisan,
   dan iOS mengabaikannya sejak lama, jadi ia merugikan tanpa memberi apa pun.
3. Gulir menyamping dan elemen yang keluar tepi — terlihat rusak, dan terlihat
   rusak menghilangkan kepercayaan sebelum isinya dibaca.
4. Target sentuh dan hover-saja — fiturnya ada tapi tidak bisa dipakai.
5. Tipografi dan jarak — nyata, tapi bisa dijadwalkan.

### 3. Memakai tangkapan layarnya

Kalau Anda bisa melihat gambar, potongan elemen adalah bukti termurah yang
tersedia: sekitar 30 kilobita untuk menjawab "yang mana". Ia menunjukkan
elemen bermasalah beserta sekelilingnya, jadi bisa dikenali di halaman.

Kalau Anda TIDAK bisa melihat gambar — model tanpa kemampuan visual, dan itu
termasuk sebagian model yang bisa dikonfigurasi di Weblyzer — jangan
berpura-pura. Angkanya sudah cukup untuk menjawab keempat keluhan; tangkapan
layar adalah bukti pendukung untuk mata manusia, bukan sumber temuan.

Jangan menilai dari tangkapan layar hal yang tidak diukur. "Warnanya kurang
serasi" bukan Mobile Parity, dan gambar tidak mengubah batas itu.

### 4. Memverifikasi perbaikan

Kalau Anda diminta memastikan sebuah perbaikan berhasil, **jangan menyimpulkan
dari kode.** Jalankan ulang pengukurannya:

```bash
npm run scan -- mobile <site-id>
```

Temuan yang hilang dari daftar terbuka adalah bukti; kode yang kelihatannya
benar bukan. `clamp()` yang terlihat masuk akal di editor rutin menghasilkan
angka yang tidak diduga di 390 piksel — itu justru salah satu sebab keluhan
nomor tiga.

## Kalau Anda TIDAK punya akses ke Weblyzer

Misalnya Anda dipanggil sebagai CLI agentik di repositori orang lain, atau
diminta memeriksa satu situs tanpa basis data ini. Kerjakan sendiri dengan
urutan yang sama, dan **ukur, jangan menebak dari CSS.**

Menebak dari sumber CSS tidak bisa dilakukan dengan benar: `clamp()`, unit
kontainer, `minmax()`, dan `flex-wrap` semuanya menghasilkan nilai yang hanya
diketahui setelah dirender. Jadi render.

Dengan Playwright atau Puppeteer:

```js
const { chromium } = require('playwright')
const b = await chromium.launch()
for (const v of [
  { nama: 'mobile', width: 390, height: 844, isMobile: true },
  { nama: 'desktop', width: 1440, height: 900, isMobile: false },
]) {
  const ctx = await b.newContext({ viewport: v, isMobile: v.isMobile, hasTouch: v.isMobile })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  console.log(v.nama, await page.evaluate(() => ({
    lebarDokumen: document.documentElement.scrollWidth,
    viewport: innerWidth,
    lewatTepi: [...document.body.querySelectorAll('*')]
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length,
  })))
  await ctx.close()
}
await b.close()
```

`isMobile: true` **wajib**: ia yang menyalakan pemrosesan meta viewport di
Chromium. Tanpa itu, halaman tanpa meta viewport tetap tampak rapi pada 390
piksel — dan keluhan nomor satu jadi tidak terlihat sama sekali.

`waitUntil: 'networkidle'` jangan dipakai: situs dengan polling atau widget
chat tidak pernah mencapainya, dan pengukuran Anda menggantung sampai timeout.

Kalau tidak ada browser sama sekali, **katakan begitu.** Jangan menilai tata
letak dari sumber HTML; jawaban yang dikarang di aspek ini akan terlihat
meyakinkan dan salah.

## Yang BUKAN tugas aspek ini

Batas ini penting, karena tanpanya aspek ini akan menelan seluruh tinjauan
desain:

- **Bukan penilaian selera.** "Warnanya kurang kontras" ada di aspek lain;
  "jaraknya kurang lega menurut saya" bukan temuan.
- **Bukan performa.** LCP, CLS, dan ukuran bundel adalah Lighthouse, dan
  Weblyzer sudah mengukurnya dua kali lalu mengiris hasilnya.
- **Bukan SEO mobile.** Canonical, hreflang, dan judul kembar ada di aspek SEO.
- **Bukan aksesibilitas menyeluruh.** Hanya bagian yang khas layar sentuh:
  ukuran target dan hover. Kontras, label form, dan urutan fokus di luar
  cakupan.

Kalau Anda menemukan sesuatu di luar batas ini dan itu penting, sebutkan
sebagai catatan dalam prosa — jangan jadikan temuan Mobile Parity.
