import type { Pesan } from './pesan.ts'

/**
 * Pengiriman email lewat SMTP.
 *
 * Kredensialnya dibaca dari **environment variable, bukan database** — dan itu
 * keputusan yang menahan asas proyek ini tetap utuh. `data.db` sampai sekarang
 * nol kredensial dan tidak terenkripsi; menaruh password SMTP di sana adalah
 * hal yang sama yang sudah ditolak untuk token OAuth di `lib/ai/akun.ts`.
 * Dengan env var, aplikasi ini tidak menyimpan apa pun: yang mengelolanya
 * adalah operator, lewat crontab, launchd, atau Docker.
 *
 * Konsekuensinya jujur: tidak ada halaman konfigurasi SMTP, dan tidak akan
 * ada. Tanpa env var, fiturnya mati — pola yang sama dengan lapisan AI.
 */

export type Konfigurasi = {
  url: string
  dari: string
  ke: string
}

export type HasilKirim = { ok: true } | { ok: false; galat: string }

/**
 * Membaca konfigurasi dari environment.
 *
 * Fungsi murni yang menerima env sebagai argumen, bukan membaca `process.env`
 * langsung — supaya bisa diuji tanpa mengotori environment proses test.
 *
 * `null` berarti fitur dimatikan, dan itu keadaan NORMAL, bukan galat.
 * Konfigurasi yang setengah terisi adalah galat: orang yang mengisi dua dari
 * tiga variabel bermaksud menyalakan notifikasi, dan diam akan membuatnya
 * menunggu email yang tidak akan pernah datang.
 */
export function bacaKonfigurasi(
  env: Record<string, string | undefined>,
): { ada: false } | { ada: true; nilai: Konfigurasi } | { ada: 'rusak'; galat: string } {
  const url = env.WEBLYZER_SMTP_URL?.trim() ?? ''
  const dari = env.WEBLYZER_MAIL_FROM?.trim() ?? ''
  const ke = env.WEBLYZER_MAIL_TO?.trim() ?? ''

  const terisi = [url, dari, ke].filter((v) => v !== '').length
  if (terisi === 0) return { ada: false }
  if (terisi < 3) {
    const kurang = [
      url === '' ? 'WEBLYZER_SMTP_URL' : null,
      dari === '' ? 'WEBLYZER_MAIL_FROM' : null,
      ke === '' ? 'WEBLYZER_MAIL_TO' : null,
    ].filter((x) => x !== null)
    return { ada: 'rusak', galat: `Notifikasi email setengah terisi; belum ada: ${kurang.join(', ')}` }
  }

  // Skema diperiksa di sini, bukan diserahkan ke nodemailer: pesan galatnya
  // muncul saat pengiriman, yaitu tengah malam, di log yang tidak dibaca.
  if (!/^smtps?:\/\//i.test(url)) {
    return { ada: 'rusak', galat: `WEBLYZER_SMTP_URL harus diawali smtp:// atau smtps:// — diterima: ${url.slice(0, 40)}` }
  }

  return { ada: true, nilai: { url, dari, ke } }
}

/** Batas waktu satu pengiriman. Notifikasi yang menggantung menahan seluruh
 *  perintah `jadwal` selesai, dan kabar yang terlambat semalam tidak berguna. */
const BATAS_MS = 30_000

/**
 * Mengirim satu email.
 *
 * `nodemailer` diimpor secara dinamis supaya perintah `scan` yang tidak
 * memakai notifikasi tidak membayar biaya memuatnya — dan supaya pemasangan
 * yang tanpa notifikasi tetap jalan seandainya paketnya belum terpasang.
 */
export async function kirimEmail(k: Konfigurasi, pesan: Pesan): Promise<HasilKirim> {
  try {
    const { createTransport } = await import('nodemailer')
    // Satu OBJEK, bukan `createTransport(url, opsi)`: argumen kedua bertipe
    // `MailDefaults` dan menelan opsi transport tanpa mengeluh — compiler yang
    // menangkapnya, bukan runtime.
    //
    // Ketiga batas waktu diperlukan karena kegagalan SMTP punya tiga bentuk
    // yang berbeda: koneksi tidak pernah terbuka, server tidak pernah menyapa,
    // dan sesi yang menggantung di tengah percakapan.
    const transport = createTransport({
      url: k.url,
      connectionTimeout: BATAS_MS,
      greetingTimeout: BATAS_MS,
      socketTimeout: BATAS_MS,
    })
    await transport.sendMail({
      from: k.dari,
      to: k.ke,
      subject: pesan.subjek,
      text: pesan.teks,
    })
    // Koneksi ditutup supaya proses `jadwal` tidak menggantung menunggu socket
    // yang masih hidup — `execFile` di CLI menunggu prosesnya benar-benar
    // keluar, dan pool nodemailer bisa menahannya.
    transport.close()
    return { ok: true }
  } catch (err) {
    // Pesan mentah dipertahankan. "Gagal mengirim email" tidak bisa
    // ditindaklanjuti, sedangkan "535 Authentication failed" atau
    // "ECONNREFUSED" langsung menunjuk apa yang harus diperbaiki.
    return { ok: false, galat: (err instanceof Error ? err.message : String(err)).slice(0, 500) }
  }
}
