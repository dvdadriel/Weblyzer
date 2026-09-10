import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dirSitus, namaSah } from '../../../../../lib/tangkapan.ts'

/**
 * Melayani tangkapan layar Mobile Parity.
 *
 * Route handler, BUKAN berkas di `public/`. Bedanya: berkas di `public/`
 * disajikan Next kepada siapa pun tanpa melewati kode kita, dan tangkapan
 * layar situs orang lain bukan hal yang diserahkan ke penyajian statis.
 *
 * Nama berkasnya divalidasi dengan ALLOWLIST, bukan dengan memeriksa `..`.
 * Nama yang sah hanya berisi delapan heks, nama lebar, dan satu angka; pola
 * itu menerima semuanya dan menolak segalanya yang lain — termasuk bentuk
 * traversal yang belum terpikirkan. Memeriksa `..` adalah daftar hitam, dan
 * daftar hitam selalu ketinggalan satu bentuk.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; nama: string }> },
) {
  const { siteId, nama } = await params
  const id = Number(siteId)

  if (!Number.isInteger(id) || id <= 0 || !namaSah(nama)) {
    return new Response('Tidak ditemukan', { status: 404 })
  }

  try {
    const isi = await readFile(join(dirSitus(id), nama))
    return new Response(new Uint8Array(isi), {
      headers: {
        'content-type': 'image/jpeg',
        // Tangkapan ditimpa setiap run dan namanya tetap, jadi cache panjang
        // akan menampilkan gambar cacat yang sudah diperbaiki. `must-revalidate`
        // membuat browser bertanya dulu.
        'cache-control': 'no-cache, must-revalidate',
      },
    })
  } catch {
    // Berkas yang tidak ada dan situs yang tidak ada dijawab sama: keduanya
    // "tidak ditemukan", dan membedakannya mengumumkan situs mana yang pernah
    // dipindai.
    return new Response('Tidak ditemukan', { status: 404 })
  }
}
