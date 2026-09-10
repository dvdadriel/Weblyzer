'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '../../lib/db.ts'
import { simpanPilihanCli, hapusPilihanCli } from '../../lib/repos/konfig.ts'
import { ujiCli, CLI, type NamaCli } from '../../lib/ai/cli.ts'
import { tServer } from '../../lib/i18n/server.ts'

export type HasilForm = { ok: boolean; pesan: string } | null

/**
 * Menyimpan pilihan CLI lalu langsung memanggilnya sekali. Satu tombol.
 *
 * "Tersimpan" untuk CLI yang tidak menjawab adalah kebohongan yang baru
 * ketahuan saat pemindaian tengah malam gagal — dan pemindaian tengah malam
 * tidak ada yang menonton. Jadi hasil pemanggilannya ditunjukkan sekarang.
 *
 * Bedanya dengan versi lama yang menyimpan API key: pilihannya TETAP TERSIMPAN
 * walau ujinya gagal, dan fitur AI tetap menyala. Tidak ada lagi keadaan
 * "tersimpan tapi belum terbukti" yang menahan fitur — keadaan tersembunyi
 * seperti itu bisa basi, sedangkan CLI yang sedang rusak biasanya akan pulih
 * tanpa perlu ada yang menyimpan ulang apa pun.
 */
export async function pilihCli(_sebelum: HasilForm, form: FormData): Promise<HasilForm> {
  const t = await tServer()
  const cli = String(form.get('cli') ?? '')
  const model = String(form.get('model') ?? '')

  if (!(cli in CLI)) return { ok: false, pesan: t('model.cliTakDikenal', { cli }) }

  try {
    simpanPilihanCli(getDb(), { cli: cli as NamaCli, model })
  } catch (err) {
    return { ok: false, pesan: err instanceof Error ? err.message : String(err) }
  }
  revalidatePath('/model')

  const hasil = await ujiCli(cli as NamaCli, model.trim())
  if (!hasil.ok) {
    return { ok: false, pesan: t('model.cliGagal', { cli, galat: hasil.galat }) }
  }
  return { ok: true, pesan: t('model.cliJawab', { cli, jawab: hasil.teks }) }
}

/** Kembali memakai `.env`. */
export async function pakaiEnv(): Promise<void> {
  hapusPilihanCli(getDb())
  revalidatePath('/model')
}
