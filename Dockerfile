# Weblyzer
#
# Satu tahap, bukan multi-stage, dan itu keputusan sadar. Tahap terpisah untuk
# build biasanya menghemat ukuran image — tapi di sini muatan terbesarnya
# adalah Chromium (~400 MB) yang dibutuhkan RUNTIME, bukan artefak build. Yang
# dihemat multi-stage tinggal devDependencies, sementara yang dibayar adalah
# satu salinan node_modules lagi dan Dockerfile yang dua kali lebih panjang.
#
# Node 24 mengikuti `engines` di package.json, bukan versi mesin pengembang:
# `node:sqlite` dan type stripping keduanya ada di 24, dan menaikkannya berarti
# mengklaim syarat yang belum pernah diuji.
FROM node:24-bookworm-slim

# Dependensi sistem untuk Chromium. Playwright bisa memasangnya sendiri lewat
# `--with-deps`, dan itu yang dipakai di bawah — daftar manual di sini akan
# jadi basi setiap kali Playwright naik versi.
#
# `ca-certificates` dipisah karena bukan untuk Chromium: ia untuk pemindaian
# HTTPS dan pengiriman SMTP, dan tanpanya keduanya gagal dengan galat sertifikat
# yang tidak menyebut sebabnya.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# package.json dan lock lebih dulu, terpisah dari sumber: selama keduanya tidak
# berubah, layer install ini dipakai ulang. Menyalin seluruh repo lebih dulu
# akan membuat setiap perubahan satu baris kode mengunduh Chromium lagi.
COPY package.json package-lock.json ./

# `--omit=dev` adalah cara yang lazim dan benar untuk image produksi, dan
# INILAH yang dulu menjadi bug laten: `playwright` dan `lighthouse` ada di
# devDependencies padahal keduanya dependensi runtime scanner. Build-nya sukses
# dan setiap pemindaian gagal dengan module-not-found, sementara Next.js tetap
# jalan — jadi UI-nya terbuka normal dan hanya tombol scan yang mati. Sudah
# diperbaiki; baris ini yang membuktikannya tetap benar.
RUN npm ci --omit=dev

# Chromium dipasang SETELAH npm ci karena ia membutuhkan paket playwright yang
# baru saja terpasang. Hanya chromium — Firefox dan WebKit tidak pernah dipakai
# dan masing-masing menambah ratusan megabyte.
RUN npx playwright install --with-deps chromium

COPY . .

# Build Next.js. Butuh devDependencies untuk TypeScript dan tipe React, jadi
# keduanya dipasang sementara lalu dibuang — ini pengganti multi-stage yang
# lebih pendek: satu layer, bukan satu tahap.
RUN npm ci \
    && npm run build \
    && npm ci --omit=dev \
    && npm cache clean --force

# data.db WAJIB volume. Tanpa ini riwayat `open → fixed` hilang setiap kali
# container diganti — dan riwayat itu adalah seluruh nilai alat ini. Direktori,
# bukan berkas: WAL menulis `data.db-wal` dan `data.db-shm` di sebelahnya, dan
# me-mount satu berkas akan meninggalkan keduanya di dalam container.
ENV DB_PATH=/data/data.db
VOLUME /data

# LAPISAN AI TIDAK JALAN DI CONTAINER, dan itu bukan sesuatu yang bisa
# ditambal di sini. Ringkasan AI, tab GEO, dan tab Audit memanggil CLI `claude`
# yang butuh login OAuth interaktif — browser plus terminal. Di container tidak
# ada keduanya, dan menyalin kredensial host ke dalam image berarti menaruh
# token di layer yang bisa di-push.
#
# Yang tetap jalan: keempat kategori deterministik, Lighthouse, ekspor Excel,
# scheduler, dan notifikasi email. Itu bagian yang memang tidak butuh siapa pun
# untuk login.
#
# Notifikasi email dibaca dari environment saat dijalankan, bukan dipanggang ke
# image: WEBLYZER_SMTP_URL, WEBLYZER_MAIL_FROM, WEBLYZER_MAIL_TO. Sengaja TIDAK
# ada `ENV` untuk ketiganya di sini — nilai kredensial di Dockerfile akan
# tersimpan di layer image.
ENV NODE_ENV=production
EXPOSE 3000

# Node langsung, bukan `npm start`: npm menambahkan satu proses di antara PID 1
# dan server, dan proses itu tidak meneruskan SIGTERM — jadi `docker stop`
# menunggu sepuluh detik lalu membunuh paksa, tepat saat SQLite mungkin sedang
# menulis.
CMD ["node", "node_modules/next/dist/bin/next", "start"]
