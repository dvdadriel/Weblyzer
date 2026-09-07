import writeXlsx from 'write-excel-file/node'
import { getDb } from '../../../../lib/db.ts'
import { susunSheet, namaBerkas } from '../../../../lib/export/excel.ts'

/**
 * Mengunduh seluruh temuan satu situs sebagai satu berkas .xlsx.
 *
 * Route handler, bukan server action: yang dikirim balik adalah berkas biner
 * beserta header `Content-Disposition`, dan server action mengembalikan nilai
 * ke React — bukan respons HTTP yang bisa diunduh browser.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await ctx.params
  const id = Number(siteId)
  if (!Number.isInteger(id)) return new Response('siteId tidak sah', { status: 400 })

  const db = getDb()
  const situs = db.prepare('SELECT name FROM sites WHERE id = ?').get(id) as
    | { name: string }
    | undefined
  if (!situs) return new Response('Situs tidak ditemukan', { status: 404 })

  const sekarang = db
    .prepare("SELECT strftime('%Y-%m-%d %H:%M', 'now', 'localtime') AS w")
    .get() as { w: string }

  const sheets = susunSheet(db, id, sekarang.w)

  // Tanpa `filePath`, pustakanya mengembalikan objek dengan
  // toBuffer/toStream/toFile — bukan Buffer, dan bukan berkas di disk. Opsi
  // `{ buffer: true }` yang mula-mula saya pakai tidak ada di tipenya sama
  // sekali; runtime mengabaikannya diam-diam, dan hanya compiler yang
  // memberi tahu.
  const buf = await writeXlsx(
    sheets.map((s) => ({
      data: s.data,
      sheet: s.sheet,
      columns: s.columns,
      // Baris judul tetap terlihat saat menggulir. Sheet SEO punya 210 baris;
      // tanpa ini kolom keempat tidak lagi diketahui isinya di baris ke-80.
      stickyRowsCount: 1,
    })),
  ).toBuffer()

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${namaBerkas(situs.name, sekarang.w.slice(0, 10))}"`,
      // Berkas ini dirakit dari database pada saat diminta. Cache-nya akan
      // menyajikan angka lama kepada orang yang baru selesai memindai.
      'Cache-Control': 'no-store',
    },
  })
}
