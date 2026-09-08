import type { StatusAkun as Status } from '../lib/ai/akun.ts'
import { Ikon } from './Ikon.tsx'

/**
 * Panel akun untuk satu penyedia.
 *
 * Server component tanpa state: yang ditampilkan seluruhnya turunan dari
 * pemeriksaan di server, dan tidak ada yang bisa diklik selain menyalin satu
 * perintah.
 *
 * Tidak ada tombol Login, dan itu bukan kelalaian. `claude auth login` membuka
 * browser lalu **menunggu di terminal** sampai alurnya selesai. Dijalankan
 * dari server action, prosesnya menggantung di tempat yang tidak ada siapa pun
 * untuk menyelesaikannya, dan satu-satunya jejaknya adalah halaman yang diam
 * sampai batas waktu. Tombol yang tidak bisa menyelesaikan pekerjaannya lebih
 * buruk daripada tidak ada tombol — pelajaran yang sama dengan tombol Periksa
 * Lagi di tab Lighthouse.
 *
 * Yang muncul sebagai gantinya: perintahnya, apa adanya, untuk dijalankan di
 * terminal. Satu baris yang bisa disalin mengalahkan tombol yang berpura-pura.
 */
export function StatusAkun({ nama, status }: { nama: string; status: Status }) {
  // Penyedia yang terpasang tapi tidak bisa ditanyai status login-nya tetap
  // disebut. Dibiarkan kosong, ketiadaan panelnya terbaca sebagai "yang ini
  // tidak butuh login" — dan itu salah: mode headless Gemini menolak tanpa
  // GEMINI_API_KEY (exit 41). Yang benar adalah kita tidak tahu, dan tombol
  // Uji di bawah adalah satu-satunya cara mengetahuinya.
  if (status.keadaan === 'tak-didukung') {
    return (
      <p className="akun" role="status">
        <Ikon nama="kompas" ukuran={13} />
        <span>
          <strong>{nama}</strong> — status login tidak bisa dibaca dari luar; CLI-nya
          tidak menyediakannya. Pakai tombol Uji untuk memastikan ia benar-benar
          menjawab.
        </span>
      </p>
    )
  }

  if (status.keadaan === 'galat') {
    return (
      <p className="akun akun-galat" role="status">
        <Ikon nama="alert" ukuran={13} />
        <span>
          <strong>{nama}</strong> — status akun tidak bisa dibaca: {status.pesan}
        </span>
      </p>
    )
  }

  if (status.keadaan === 'keluar') {
    return (
      <p className="akun akun-keluar" role="status">
        <Ikon nama="alert" ukuran={13} />
        <span>
          <strong>{nama}</strong> — belum masuk. Ringkasan AI akan gagal sampai Anda
          masuk; jalankan <code className="akun-perintah">claude auth login</code> di
          terminal.
        </span>
      </p>
    )
  }

  // Nama akun dirakit dari yang ada saja. Sebagian medan bisa null pada akun
  // pribadi (tanpa organisasi), dan "null" yang tercetak di layar lebih buruk
  // daripada medan yang tidak muncul.
  const keterangan = [status.org, status.langganan].filter((x) => x !== null)

  return (
    <p className="akun akun-masuk" role="status">
      <Ikon nama="ceklis" ukuran={13} />
      <span>
        <strong>{nama}</strong> — masuk sebagai {status.email ?? '(email tidak disebut)'}
        {keterangan.length > 0 && <> &middot; {keterangan.join(' · ')}</>}
        {/* Metode login disebut karena menentukan siapa yang membayar:
            langganan Claude atau tagihan Console. Keduanya bekerja, tapi hanya
            satu yang gratis bagi pemakai yang sudah berlangganan. */}
        {status.metode !== null && <> &middot; lewat {status.metode}</>}
      </span>
    </p>
  )
}
