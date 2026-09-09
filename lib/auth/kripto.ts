import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { subKunci } from './rahasia.ts'

export type Kotak = { ciphertext: Buffer; iv: Buffer; tag: Buffer }

/**
 * AES-256-GCM, bukan AES-CBC.
 *
 * GCM memberi otentikasi: ciphertext yang diubah orang yang punya akses tulis
 * ke `data.db` gagal didekripsi alih-alih menghasilkan kunci API lain yang
 * lalu dikirim ke Anthropic atas nama pemakainya. Tanpa tag itu, berkas
 * database yang bisa ditulis berarti API key yang bisa diganti.
 */
export function enkripsi(rahasia: string, teks: string): Kotak {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', subKunci(rahasia, 'ai-kunci'), iv)
  const ciphertext = Buffer.concat([c.update(teks, 'utf8'), c.final()])
  return { ciphertext, iv, tag: c.getAuthTag() }
}

/**
 * Melempar kalau tag tidak cocok — sengaja tidak mengembalikan `null`.
 *
 * Gagal dekripsi berarti salah satu dari dua hal: `WEBLYZER_SECRET` berubah,
 * atau baris itu dirusak. Keduanya butuh perhatian orang, dan `null` yang
 * mengalir ke pemanggil akan muncul di layar sebagai "AI tidak aktif" —
 * gejala yang menyesatkan untuk sebab yang serius.
 */
export function dekripsi(rahasia: string, kotak: Kotak): string {
  const d = createDecipheriv('aes-256-gcm', subKunci(rahasia, 'ai-kunci'), kotak.iv)
  d.setAuthTag(kotak.tag)
  return Buffer.concat([d.update(kotak.ciphertext), d.final()]).toString('utf8')
}
