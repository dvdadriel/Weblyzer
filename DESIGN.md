# Design

Sistem visual Web Audit Dashboard. Strategis "siapa/apa/kenapa" ada di `PRODUCT.md`; berkas ini menjawab "seperti apa".

## Theme

**Vintage terminal, dilunakkan.** Monospace di seluruh antarmuka, palet earth-tone 1970-an di atas kertas krem, penanda severity bergaya konsol (`[!!]`), dan sudut membulat 16px.

Dua keputusan yang membentuk semuanya:

**Terang, bukan gelap.** Alat ini dibuka pagi hari sambil minum kopi, di ruangan berjendela, untuk satu pemeriksaan singkat lalu ditutup. Terminal gelap dipilih orang untuk sesi berjam-jam di ruang redup; itu bukan adegan yang terjadi di sini. Latar krem juga membuat laporan yang di-screenshot atau di-print tetap terbaca.

**Membulat, bukan tajam.** Terminal sungguhan bersudut siku. Radius 16px sengaja melawan itu, dan hasilnya bukan kompromi melainkan rujukan yang lebih tepat: perangkat konsumer era 1970-an — badan televisi, radio Braun, panel instrumen — bersudut membulat dengan warna tanah yang sama. Tipografinya terminal; wujud fisiknya perabot 70-an.

Anti-referensi ada di `PRODUCT.md`. Yang paling relevan untuk berkas ini: **furnitur ASCII ditolak**. Garis adalah `border` CSS, tabel adalah `<table>`. Identitas terminal dibawa tipografi, palet, dan penanda — bukan karakter box-drawing yang pecah di layar sempit dan terbaca screen reader sebagai deretan simbol.

## Color

Strategi: **Restrained** (bawaan register product). Permukaan netral hangat, satu aksen untuk aksi utama, warna jenuh hanya untuk severity.

Palet dasar dari [colorhunt.co/palette/1d4533f7eae0f9d2ba5e3122](https://colorhunt.co/palette/1d4533f7eae0f9d2ba5e3122).

### Permukaan dan tinta

```css
--bg:        oklch(94.5% 0.019 60);   /* #F7EAE0 krem — latar utama        */
--surface:   oklch(89.1% 0.055 53);   /* #F9D2BA peach — panel, baris aktif */
--ink:       oklch(35.6% 0.056 162);  /* #1D4533 hijau tua — teks utama    */
--ink-2:     oklch(36.8% 0.070 39);   /* #5E3122 cokelat tua — teks kedua  */
--line:      oklch(35.6% 0.056 162 / 0.22);  /* garis, dari --ink          */
--line-kuat: oklch(35.6% 0.056 162 / 0.45);  /* pemisah struktural         */
```

`--ink` di atas `--bg` = **9.12:1**. `--ink-2` di atas `--bg` = **9.18:1**. Keduanya lewat AA dengan lapang, jadi teks sekunder memakai warna penuh dengan ukuran/bobot lebih kecil — **bukan abu-abu pudar**. Teks abu-abu di latar bernada hangat adalah kegagalan kontras paling umum, dan di sini tidak dibutuhkan sama sekali.

### Severity

Setiap nilai diverifikasi terhadap **`--surface`**, bukan `--bg`. Angka di komentar adalah hasil ukur.

```css
/*                                        di --surface / di --bg          */
--sev-critical: oklch(49.9% 0.147 33);   /* #A63A24  4.60:1 / 5.47:1  rust    */
--sev-high:     oklch(49.7% 0.120 57);   /* #944D00  4.50:1 / 5.36:1  amber   */
--sev-medium:   oklch(48.8% 0.100 91);   /* #755D00  4.50:1 / 5.36:1  mustard */
--sev-low:      oklch(48.2% 0.075 127);  /* #536636  4.50:1 / 5.36:1  olive   */
--sev-fixed:    oklch(35.6% 0.056 162);  /* #1D4533  7.66:1 / 9.12:1  = --ink */
--sev-ignored:  oklch(48.8% 0.031 50);   /* #6F5B50  4.55:1 / 5.41:1  taupe   */
```

**Kenapa diukur terhadap `--surface`, bukan `--bg`.** Versi pertama palet ini hanya diverifikasi terhadap `--bg` dan lolos. Tetapi `--surface` juga dipakai untuk panel, header tabel, dan **baris yang di-hover atau terpilih** — dan lencana severity hidup persis di baris tabel. Begitu barisnya di-hover, empat dari enam warna jatuh ke 3.78–3.88:1 dan gagal AA.

`--surface` lebih gelap dari `--bg`, jadi mengukur terhadapnya menjamin keduanya lolos. Latar yang paling ketat adalah yang menentukan, bukan yang paling sering.

Empat dari enam nilai **lebih gelap dari palet retro yang enak dipandang**, karena versi cerahnya gagal telak (amber asli 2.81:1, mustard 2.19:1, taupe 2.95:1). Jangan mencerahkannya kembali "supaya lebih hidup" tanpa mengukur ulang **terhadap `--surface`**.

Warna severity duduk di rentang lightness sempit (50–54%), jadi pembedanya hue. Itu justru alasan aturan berikutnya wajib.

### Aturan warna

- **Severity tidak pernah disampaikan lewat warna saja.** Setiap tingkat punya penanda tekstualnya sendiri:

  | severity | penanda |
  |---|---|
  | critical | `[!!]` |
  | high | `[!]` |
  | medium | `[~]` |
  | low | `[.]` |
  | fixed | `[ok]` |
  | ignored | `[--]` |

  Enam penanda untuk enam tingkat, bukan empat. Versi pertama memakai `[!!]` untuk critical *dan* high, dan `[! ]` untuk medium *dan* low — artinya penandanya menandai kelompok, bukan tingkat, sementara teksnya mengklaim menandai tingkat. Bobot visualnya menurun berurutan (`!!` → `!` → `~` → `.`), jadi urutannya terbaca tanpa warna, saat di-print, dan di screenshot hitam-putih.
- **Aksen = `--ink`.** Aksi utama, tab aktif, cincin fokus. Tidak ada warna aksen kelima; palet ini sudah punya cukup suara.
- **Warna jenuh tidak pernah untuk keadaan nonaktif.** Tab yang tidak aktif memakai `--ink-2` pada bobot lebih ringan, bukan versi pudar dari warna aktifnya.
- **`--surface` adalah satu-satunya lapisan kedua.** Panel, header tabel, baris terpilih. Tidak ada lapisan ketiga; kalau butuh, susunannya yang salah.

## Typography

**Satu keluarga untuk seluruh antarmuka: IBM Plex Mono.** Data, label, tombol, isi, semuanya. Silsilahnya memang terminal mainframe, x-height-nya tinggi, dan angkanya rata per kolom — yang penting karena tabel skor dan hitungan temuan adalah muatan utama aplikasi ini.

**Space Mono hanya untuk wordmark.** Tepat satu tempat per layar, di header. Space Mono adalah monospace retro-futuris dengan karakter kuat yang menyenangkan pada ukuran besar dan mengganggu pada 13px di tabel padat. Membatasinya ke logotipe memberi kepribadian tanpa merusak keterbacaan data.

> **Cara mengetahui ini gagal:** Space Mono muncul di label tabel, tombol, atau angka. Register product melarang display font di data, dan dua monospace yang dipakai berdampingan akan terbaca sebagai kecelakaan, bukan pilihan.

```css
--font-ui:   'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
--font-mark: 'Space Mono', var(--font-ui);
```

Skala tetap dalam rem, bukan `clamp()` — pengguna melihat pada DPI konsisten, dan judul yang menciut di panel sempit terlihat lebih buruk, bukan lebih baik. Rasio ±1.15, rapat, karena elemen tipografinya banyak.

```css
--t-mark:  1.5rem;    /* 24px  wordmark, Space Mono 700, tracking 0.02em */
--t-judul: 1.25rem;   /* 20px  nama situs, judul halaman, 600            */
--t-sub:   1.0625rem; /* 17px  judul bagian, 600                         */
--t-body:  0.9375rem; /* 15px  isi, detail temuan, 400                   */
--t-data:  0.8125rem; /* 13px  sel tabel, label, 400/500                 */
--t-mikro: 0.75rem;   /* 12px  timestamp, jumlah, 500                    */
```

- Bobot yang dipakai: 400, 500, 600. Tidak ada 300 — di monospace, bobot tipis merusak keterbacaan angka.
- Panjang baris prosa dibatasi 68ch. Tabel boleh melebar sampai 120ch+; itu memang gunanya.
- `text-wrap: balance` pada judul, `pretty` pada prosa panjang.
- Tanpa `text-transform: uppercase` untuk isi. Huruf besar dipakai hanya pada wordmark dan label tab.

## Spacing

Basis 4px, tapi **langkah yang dipakai dimulai dari 8**. Ruang lapang adalah permintaan eksplisit dan cocok dengan tujuannya: kepadatan ada di dalam tabel, bukan di antara wilayah.

```css
--s-1:  0.5rem;   /*  8px  jarak dalam chip, celah ikon-teks   */
--s-2:  0.75rem;  /* 12px  padding vertikal baris tabel        */
--s-3:  1rem;     /* 16px  padding dalam kontrol               */
--s-4:  1.5rem;   /* 24px  padding panel                       */
--s-5:  2rem;     /* 32px  celah antar blok                    */
--s-6:  3rem;     /* 48px  celah antar wilayah halaman         */
--s-7:  4rem;     /* 64px  ruang di sekitar keadaan kosong     */
```

Aturan yang membedakan "padat" dari "sempit":

- **Baris tabel: padding vertikal `--s-2` (12px), horizontal `--s-3` (16px).** Cukup untuk dipindai tanpa jadi renggang.
- **Antar wilayah minimal `--s-6` (48px).** Header, tab, tabel, dan kaki tidak pernah bersentuhan.
- **Panel diberi napas `--s-4` (24px) di dalam.** Isi tidak pernah menempel di border.
- **Keadaan kosong mendapat `--s-7` (64px) di atas dan bawah.** Layar kosong adalah hasil paling sering; dia harus terasa disengaja, bukan seperti data yang gagal dimuat.

## Radius

**16px adalah radius tanda tangan.** Ini yang membedakan tampilan ini dari terminal siku — rujukannya perangkat konsumer 70-an, bukan emulator VT100.

```css
--r-panel:   16px;  /* panel, kartu situs, dialog, blok keadaan kosong */
--r-kontrol: 10px;  /* tombol, input, select                          */
--r-chip:     6px;  /* lencana severity, tag kecil                    */
```

Dua langkah kecil itu bukan pelemahan permintaan, melainkan syarat geometris: elemen setinggi 24px dengan radius 16px menjadi kapsul, dan kapsul berarti "pil status", bukan "lencana". Radius harus di bawah setengah tinggi elemen agar bentuknya tetap terbaca sebagai persegi lunak.

Baris tabel tidak diberi radius. Yang membulat adalah wadahnya; barisnya lurus supaya kolomnya rata.

## Components

Setiap komponen interaktif punya tujuh keadaan: default, hover, focus, active, disabled, loading, error. Tidak ada yang dikirim setengah jadi.

- **Cincin fokus:** `outline: 2px solid var(--ink); outline-offset: 2px`. Terlihat di setiap elemen interaktif, tidak pernah `outline: none` tanpa pengganti. Alur utama — pilih situs, pindah tab, buka temuan, tandai abaikan — harus bisa diselesaikan tanpa mouse.
- **Tabel adalah `<table>` semantik** dengan `<thead>` dan `<th scope="col">` sungguhan. Data padat adalah inti aplikasi ini; screen reader harus bisa menavigasinya per kolom.
- **Lencana severity:** penanda tekstual + warna, `--r-chip`, `--t-mikro`, bobot 500. Tidak pernah warna saja.
- **Tab adalah tautan** (`/sites/3/bugs`), bukan state. Bisa di-bookmark, tombol back berfungsi, refresh tidak melempar balik ke tab pertama.
- **Keadaan memuat: skeleton baris tabel**, bukan spinner di tengah konten. Bentuk halamannya sudah diketahui sebelum datanya tiba.
- **Keadaan kosong mengajarkan antarmuka**, bukan "tidak ada data". Bedakan tiga hal yang mudah tertukar: belum pernah dipindai, dipindai dan bersih, dan pemindaian gagal. Ketiganya terlihat sama kalau ditulis malas, padahal artinya sangat berbeda.
- **Tanpa modal sebagai pilihan pertama.** Detail temuan mengembang di tempat.
- **Kartu dipakai hanya untuk daftar situs** di dashboard, tempat tiap item memang objek terpisah. Tidak ada kartu di dalam kartu.

### Kosakata tulisan

- Nama tombol tetap sama sepanjang alur: tombol `Pindai` menghasilkan `Memindai…` lalu `Selesai`.
- Error menjelaskan yang terjadi dan langkah berikutnya. Tidak minta maaf, tidak samar. `Situs tidak terjangkau — pemindaian dibatalkan agar temuan lama tidak salah ditandai selesai.`
- Kalimat biasa, bukan Title Case. Istilah teknis yang memang dipakai sehari-hari dibiarkan bahasa Inggris: `console.error`, `redirect`, `header`, `cookie`.

## Motion

150–250ms, `ease-out`. Gerakan menyampaikan keadaan, bukan hiasan.

```css
--e-out: cubic-bezier(0.22, 1, 0.36, 1);
--d-cepat: 150ms;
--d-normal: 220ms;
```

- **Tanpa urutan animasi saat halaman dimuat.** Alat ini dibuka ke dalam sebuah tugas; tidak ada yang mau menonton dashboard-nya masuk.
- **Satu gerakan bertanda tangan:** kursor garis bawah berkedip di samping status pemindaian yang sedang berjalan. Satu-satunya tempat aplikasi ini terasa hidup, dan hanya saat memang ada yang berjalan.
- Baris temuan mengembang dengan transisi tinggi 220ms; hover berpindah warna latar 150ms.
- **`prefers-reduced-motion: reduce` menghentikan kursor berkedip** menjadi garis diam, dan mengganti pengembangan menjadi tampil seketika.
- Konten tidak pernah disembunyikan menunggu animasi. Reveal memperkuat yang sudah terlihat.

## Layout

- **Header + navigasi tab.** Tanpa sidebar; jumlah situsnya sedikit dan pemilihnya muat di header.
- Responsif secara struktural, bukan lewat tipografi cair: pemilih situs mengecil jadi dropdown, tabel mengalihkan kolom sekunder ke baris kedua di bawah 720px.
- Lebar konten maksimum 1180px. Tabel boleh menggulir horizontal di dalam wadahnya sendiri; badan halaman tidak pernah menggulir ke samping.
- Skala z-index bernama: `dropdown → sticky → backdrop → dialog → toast`. Tidak ada 999.

## Cara mengetahui ini gagal

Daftar periksa jujur, dipakai saat kritik nanti:

1. Ada warna severity yang dicerahkan tanpa diukur ulang kontrasnya.
2. Space Mono muncul di luar wordmark.
3. Severity disampaikan lewat warna saja di suatu tempat.
4. Keadaan kosong tidak membedakan "bersih" dari "pemindaian gagal".
5. Muncul kartu berisi ikon bulat dan angka besar — anti-referensi template admin yang secara eksplisit ditolak.
6. Ada teks abu-abu di latar krem, padahal `--ink-2` tersedia pada 9.18:1.
