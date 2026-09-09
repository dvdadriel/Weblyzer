'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '../../lib/db.ts'
import { bacaRahasia } from '../../lib/auth/rahasia.ts'
import { wajibUser, wajibAdmin } from '../../lib/auth/konteks.ts'
import { simpanKunci, tandaiTerverifikasi, hapusKunci } from '../../lib/ai/kunci.ts'
import { validasiKunci } from '../../lib/ai/jalankan.ts'
import { gantiPassword, buatUser } from '../../lib/auth/pengguna.ts'
import { verifikasiPassword } from '../../lib/auth/password.ts'
import { tServer } from '../../lib/i18n/server.ts'

export type HasilForm = { ok: boolean; pesan: string } | null

/** Panjang minimum password. Cukup untuk menolak "123", tidak berpura-pura
 *  menjadi kebijakan keamanan yang tidak ditegakkan di tempat lain. */
const MIN_PASSWORD = 8

/**
 * Menyimpan lalu langsung memvalidasi. Satu tombol, bukan dua.
 *
 * "Tersimpan" yang berhasil untuk kunci yang salah adalah kebohongan yang
 * baru ketahuan saat pemindaian tengah malam gagal — dan itu persis kegagalan
 * yang halaman ini ada untuk mencegahnya. Kalau validasinya gagal, kuncinya
 * tetap tersimpan (supaya tidak perlu ditempel ulang) tapi `terverifikasi_at`
 * tetap NULL, jadi fitur AI tetap mati.
 */
export async function simpanDanUji(_sebelum: HasilForm, form: FormData): Promise<HasilForm> {
  const ctx = await wajibUser()
  const apiKey = String(form.get('apiKey') ?? '')
  const model = String(form.get('model') ?? '')

  try {
    simpanKunci(getDb(), bacaRahasia(), ctx.user.id, { model, apiKey })
  } catch (err) {
    return { ok: false, pesan: err instanceof Error ? err.message : String(err) }
  }

  const hasil = await validasiKunci(apiKey.trim())
  revalidatePath('/model')
  if (!hasil.ok) return { ok: false, pesan: hasil.pesan }

  tandaiTerverifikasi(getDb(), ctx.user.id)
  revalidatePath('/model')
  return { ok: true, pesan: (await tServer())('model.tersimpanBerlaku') }
}

export async function lupakanKunci(): Promise<void> {
  const ctx = await wajibUser()
  hapusKunci(getDb(), ctx.user.id)
  revalidatePath('/model')
}

export async function ubahPassword(_sebelum: HasilForm, form: FormData): Promise<HasilForm> {
  const ctx = await wajibUser()
  const t = await tServer()
  const lama = String(form.get('lama') ?? '')
  const baru = String(form.get('baru') ?? '')

  if (baru.length < MIN_PASSWORD) {
    return { ok: false, pesan: t('akun.passwordPendek', { n: MIN_PASSWORD }) }
  }

  // Password lama diminta walau session sudah terbukti. Tanpa itu, laptop yang
  // ditinggal terbuka satu menit cukup untuk mengambil alih akun secara
  // permanen. Akun yang lahir dari Google tidak punya password lama untuk
  // diminta, jadi dilewati — di sana yang menjadi pengaman adalah Google.
  if (ctx.user.password_hash !== null && !verifikasiPassword(lama, ctx.user.password_hash)) {
    return { ok: false, pesan: t('akun.passwordLamaSalah') }
  }

  gantiPassword(getDb(), ctx.user.id, baru)
  revalidatePath('/akun')
  return {
    ok: true,
    // Batasannya disebut apa adanya, bukan disembunyikan. Session di proyek ini
    // tidak punya tabel, jadi tidak ada yang bisa dicabut — lihat komentar di
    // `lib/auth/sesi.ts`. Membiarkan orang mengira dirinya sudah aman lebih
    // buruk daripada mengakui batasnya.
    pesan: t('akun.passwordDiganti'),
  }
}

/**
 * Membuat akun. Hanya admin.
 *
 * Instance ini tidak menerima pendaftaran mandiri: pendaftaran terbuka berarti
 * moderasi, verifikasi email, dan penyalahgunaan kuota — tiga masalah yang
 * belum ada. Akun dibuat oleh yang punya instance.
 */
export async function buatAkun(_sebelum: HasilForm, form: FormData): Promise<HasilForm> {
  await wajibAdmin()
  const t = await tServer()
  const email = String(form.get('email') ?? '')
  const password = String(form.get('password') ?? '')
  const admin = form.get('admin') === 'on'

  if (password.length < MIN_PASSWORD) {
    return { ok: false, pesan: t('akun.passwordPendek', { n: MIN_PASSWORD }) }
  }

  try {
    const u = buatUser(getDb(), { email, password, role: admin ? 'admin' : 'user' })
    revalidatePath('/akun')
    return { ok: true, pesan: t('akun.dibuat', { email: u.email }) }
  } catch (err) {
    return { ok: false, pesan: err instanceof Error ? err.message : String(err) }
  }
}
