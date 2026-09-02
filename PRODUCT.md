# Product

## Register

product

## Users

Satu orang: David, yang memiliki dan mengurus sendiri sekitar 5–20 situs — sebagian besar toko dan situs perusahaan berbahasa Indonesia dan Inggris, berjalan di Rails dan WordPress.

Konteks pemakaiannya ada dua, dan keduanya berbeda tajam:

- **Pagi, satu menit.** Membuka dashboard sambil ngopi untuk menjawab satu pertanyaan: *apa yang rusak semalam?* Kalau tidak ada yang baru, dia harus bisa menutupnya dalam sepuluh detik tanpa membaca apa pun.
- **Setelah memperbaiki sesuatu.** Kembali beberapa hari kemudian untuk memeriksa: *yang kemarin saya perbaiki, benar-benar beres atau belum?* Ini bukan pertanyaan yang bisa dijawab daftar temuan hari ini — butuh riwayat.

Dia menulis kode sendiri. Aplikasi ini tidak memperbaiki apa pun dan tidak berpura-pura bisa; tugasnya melapor dengan cukup presisi supaya perbaikannya bisa langsung dikerjakan.

Aplikasi ini juga karya portfolio. Tapi urutannya jelas: kalau "berkesan di screenshot" bertabrakan dengan "enak dipakai tiap hari", yang kedua menang.

## Product Purpose

Menjawab dua pertanyaan tentang situs sendiri, dengan bukti, tanpa membuka DevTools satu per satu di 141 halaman:

1. **Apa yang rusak sekarang?** — halaman error, exception JavaScript, resource gagal muat, header keamanan hilang, cookie tanpa flag, skor Lighthouse.
2. **Apa yang sudah beres?** — tiap temuan punya identitas yang bertahan antar pemindaian, jadi temuan yang hilang otomatis ditandai selesai dan yang kembali muncul dibuka lagi.

Pertanyaan kedua adalah alasan aplikasi ini ada. Daftar masalah hari ini bisa didapat dari alat mana pun; **riwayat yang bisa dipercaya** tidak.

Konsekuensinya menentukan banyak keputusan produk: temuan yang berkedip — muncul dan hilang tanpa ada yang berubah di situs — lebih merusak daripada temuan yang tidak pernah dilaporkan. Temuan yang berkedip menandai dirinya sendiri "sudah diperbaiki" padahal tidak, dan sekali angkanya berbohong, seluruh alat berhenti dipercaya.

Berhasil kalau: dibuka tiap pagi selama berbulan-bulan tanpa jadi kebiasaan yang ditinggalkan, dan angka "12 diperbaiki minggu ini" benar-benar berarti dua belas.

## Brand Personality

**Teliti, terus terang, tenang.**

Suaranya seperti kolega yang sudah memeriksa dan membawa hasilnya — bukan alat yang menjual temuannya. Menyebut yang ditemukan dan di mana. Tidak membesar-besarkan severity untuk menarik perhatian, tidak minta maaf saat gagal, tidak menyemangati saat bersih.

Emosinya bukan kegembiraan, tapi **kelegaan yang bisa dipercaya**. Layar kosong artinya benar-benar tidak ada yang rusak — bukan bahwa pemindaiannya gagal diam-diam.

Kalau ada yang tidak terukur, aplikasi mengatakannya. Pengukuran yang tidak terjadi bukan pengukuran bernilai nol.

## Anti-references

**Template dashboard admin generik.** Kartu-kartu seragam berisi ikon bulat, sidebar biru, grafik donat yang tidak menjawab pertanyaan apa pun. Tampak sibuk, tidak memberi tahu apa yang harus dikerjakan. Ini "slop" yang secara eksplisit ditolak di awal proyek.

**Google Analytics dan Search Console.** Padat tapi dingin. Banyak angka tanpa arah, dan perlu dipelajari dulu sebelum berguna. Kesalahannya bukan kepadatan — kepadatan justru dibutuhkan di sini — melainkan menyerahkan seluruh pekerjaan interpretasi ke pengguna.

**Furnitur ASCII sebagai chrome.** Ditolak setelah dipertimbangkan, bukan karena tidak menarik. Border yang digambar dengan karakter box-drawing pecah di layar sempit dan terbaca screen reader sebagai deretan simbol. Identitas terminal dibawa oleh tipografi, palet, dan penanda severity — bukan oleh perabot yang berpura-pura jadi garis.

**Lingkaran skor besar warna-warni ala PageSpeed Insights.** Satu angka raksasa yang menutupi pertanyaan sebenarnya: halaman mana, berubah ke arah mana, sejak kapan.

## Design Principles

**1. Layar kosong adalah jawaban, bukan kegagalan.**
Nol temuan adalah hasil paling sering dan paling diinginkan. Keadaan itu harus terlihat sengaja dan menenangkan — dan harus bisa dibedakan dari "pemindaian gagal". Jangan menyembunyikannya di balik grafik agar layar terasa penuh.

**2. Angka yang bisa dipercaya lebih penting daripada angka yang banyak.**
Setiap hitungan yang ditampilkan harus tahan diperiksa. Lebih baik melaporkan enam temuan yang pasti daripada delapan belas yang tiga di antaranya duplikat dan dua berkedip. Kepercayaan hilang sekali, dan tidak kembali.

**3. Riwayat setara dengan keadaan sekarang.**
"Terbuka sejak 12 hari lalu" dan "muncul lagi setelah ditandai selesai" adalah informasi utama, bukan detail di halaman kedua. Bedakan temuan baru, yang masih ada, dan yang kembali muncul — di permukaan.

**4. Sebutkan yang ditemukan, di mana persisnya.**
"HTTP 500 pada /american-collection/accessories/divan?locale=en" bisa langsung dikerjakan. "Ada masalah performa" tidak. URL, aturan, dan konteksnya adalah muatan utama tiap baris — bukan metadata yang disembunyikan di balik klik.

**5. Alat ini melapor, tidak menebak.**
Semua yang ditampilkan berasal dari pengukuran, bukan simpulan. Ketika lapisan AI ditambahkan nanti, hasilnya harus jelas terpisah dari yang terukur, dan kegagalannya tidak boleh menyamar sebagai hasil.

## Accessibility & Inclusion

- **WCAG 2.2 AA.** Teks isi ≥4.5:1, teks besar ≥3:1. Palet earth-tone di latar krem adalah titik paling rawan gagal — tiap pasangan warna diverifikasi, bukan dikira-kira.
- **Severity tidak pernah disampaikan lewat warna saja.** Setiap tingkat punya penanda tekstualnya sendiri (`[!!]` `[!]` `[~]` `[.]` `[ok]` `[--]`) supaya urutannya terbaca oleh pengguna buta warna, saat di-print, dan di screenshot hitam-putih.
- **Tabel adalah `<table>` semantik** dengan header sungguhan. Data padat adalah inti aplikasi ini; screen reader harus bisa menavigasinya per kolom.
- **Fokus keyboard terlihat jelas** di setiap elemen interaktif. Alur utama — pilih situs, pindah tab, buka temuan, tandai abaikan — harus bisa diselesaikan tanpa mouse.
- **`prefers-reduced-motion` dihormati.** Satu-satunya gerakan yang direncanakan adalah indikator pemindaian berjalan; itu pun punya alternatif statis.
- **Bahasa Indonesia sebagai bahasa antarmuka**, dengan istilah teknis yang memang dipakai sehari-hari dibiarkan dalam bahasa Inggris (`console.error`, `redirect`, `header`) alih-alih diterjemahkan paksa.
