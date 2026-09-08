import type { NewFinding, Severity } from '../findings.ts'

/**
 * Menafsirkan keluaran `claude -p` menjadi temuan.
 *
 * Fungsi murni, tanpa proses dan tanpa database — sama seperti `tafsirkan` di
 * `lib/ai/jalankan.ts`. Ini satu-satunya tempat di seluruh fitur claude-seo
 * yang bisa diuji penuh: pemanggilan CLI-nya butuh menit dan jawabannya
 * berbeda tiap kali, tapi penafsirannya adalah logika biasa.
 *
 * Di sinilah §2.1 ditegakkan atau jatuh. Lihat `normalkanRule`.
 */

const SEVERITY: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

/** Panjang judul maksimum. Model kadang mengembalikan satu paragraf sebagai
 *  judul; tabel temuan punya satu baris untuk itu. Sisanya pindah ke detail. */
const BATAS_JUDUL = 300

/** Batas jumlah temuan per pemanggilan. Bukan soal ruang — ini jaring untuk
 *  keluaran yang kabur, mis. model yang mengulang satu temuan seratus kali.
 *  Yang terpotong dilaporkan, tidak dibuang diam-diam. */
export const BATAS_TEMUAN = 200

export type HasilBaca =
  | { ok: true; temuan: NewFinding[]; terpotong: number }
  | { ok: false; galat: string }

/**
 * Mengubah nama aturan dari model menjadi kunci yang stabil antar run.
 *
 * INI YANG MENJAGA §2.1. Fingerprint temuan adalah `sha256(url + rule + key)`,
 * jadi nama aturan adalah identitas — dan identitas yang bergeser membuat
 * temuan yang sama menandai dirinya "sudah diperbaiki" lalu terbuka lagi
 * sebagai temuan baru, tanpa ada yang berubah di situs.
 *
 * Model tidak bisa dipaksa mengembalikan string yang sama persis tiap kali,
 * jadi yang dilakukan adalah mempersempit ruangnya sampai variasi yang wajar
 * runtuh ke nilai yang sama:
 *
 * - huruf besar-kecil disamakan (`LLMs-TXT` dan `llms-txt` satu aturan)
 * - spasi dan garis bawah jadi tanda hubung (`llms txt` = `llms_txt`)
 * - ANGKA DIBUANG. Model suka menyelipkan hitungan atau tahun ke nama aturan
 *   (`judul-pendek-12-halaman`, `csp-2026`), dan hitungan itu berubah tiap run
 *   sementara masalahnya sama.
 * - dipotong 60 karakter supaya kalimat yang menyusup tidak jadi identitas
 *
 * Yang TIDAK masuk fingerprint sama sekali: judul dan detail. Keduanya prosa
 * model dan pasti berbeda tiap kali. Judul yang berubah hanya memperbarui
 * barisnya; ia tidak pernah membuat temuan baru.
 */
export function normalkanRule(raw: string): string {
  const bersih = raw
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '')
  return bersih
}

/**
 * Mengambil JSON dari keluaran yang mungkin dibungkus prosa atau blok kode.
 *
 * Model diminta mengeluarkan JSON saja, dan kadang tetap menambahkan satu
 * kalimat pembuka atau ```json. Menolak keluaran seperti itu berarti kehilangan
 * audit yang sudah dibayar berjalan sepuluh menit, jadi yang dicari adalah
 * kurung kurawal terluar.
 */
export function cabutJson(raw: string): string | null {
  const tanpaFence = raw.replace(/```(?:json)?/gi, '')
  const mulai = tanpaFence.indexOf('{')
  const akhir = tanpaFence.lastIndexOf('}')
  if (mulai === -1 || akhir === -1 || akhir <= mulai) return null
  return tanpaFence.slice(mulai, akhir + 1)
}

function judulPendek(raw: string): string {
  const satuBaris = raw.replace(/\s+/g, ' ').trim()
  return satuBaris.length > BATAS_JUDUL ? `${satuBaris.slice(0, BATAS_JUDUL - 1)}…` : satuBaris
}

/**
 * Mencocokkan URL dari model ke halaman yang benar-benar tersimpan.
 *
 * Model bisa mengembalikan URL dengan garis miring akhir, skema berbeda, atau
 * jalur relatif. Yang tidak cocok TIDAK dibuang — ia jadi temuan tingkat situs
 * (`pageId: null`), karena membuang temuan hanya karena URL-nya tidak rapi
 * berarti kehilangan isi audit demi kerapian bookkeeping.
 */
function cocokkanHalaman(
  url: unknown,
  halaman: Map<string, number>,
  baseUrl: string,
): { url: string; pageId: number | null } {
  if (typeof url !== 'string' || url.trim() === '') return { url: baseUrl, pageId: null }
  const mentah = url.trim()

  const kandidat = [mentah, mentah.replace(/\/$/, ''), `${mentah.replace(/\/$/, '')}/`]
  if (mentah.startsWith('/')) {
    const absolut = `${baseUrl.replace(/\/$/, '')}${mentah}`
    kandidat.push(absolut, absolut.replace(/\/$/, ''))
  }

  for (const k of kandidat) {
    const id = halaman.get(k)
    if (id !== undefined) return { url: k, pageId: id }
  }

  // URL yang TIDAK cocok ke halaman tersimpan dipulangkan sebagai baseUrl,
  // bukan apa adanya — dan itu keputusan soal identitas, bukan soal kerapian.
  //
  // Diukur: `llms-txt-hilang` bergeser fingerprint antara dua analisis hanya
  // karena run pertama menyebut URL-nya `https://.../llms.txt` dan run kedua
  // menyebut akar domain. Masalahnya sama, halamannya sama-sama tidak ada di
  // tabel `pages` kita, tapi identitasnya berbeda — jadi temuan itu menandai
  // dirinya sudah diperbaiki.
  //
  // Model memilih halaman CONTOH yang berbeda tiap kali, dan halaman contoh
  // bukan identitas masalah. Yang jadi pembeda tinggal nama aturannya, dan itu
  // konsisten dengan perintah di prompt: satu temuan per masalah, bukan per
  // halaman. URL aslinya tidak hilang — ia tersimpan di `detail.urlAsli`.
  return { url: baseUrl, pageId: null }
}

/**
 * Menyusun temuan dari keluaran mentah.
 *
 * `halaman` memetakan URL tersimpan ke id-nya. `baseUrl` dipakai sebagai URL
 * temuan tingkat situs — bukan string kosong, karena fingerprint dihitung dari
 * URL dan temuan tingkat situs harus tetap punya identitas yang stabil.
 */
export function bacaTemuan(
  raw: string,
  halaman: Map<string, number>,
  baseUrl: string,
): HasilBaca {
  if (raw.trim() === '') return { ok: false, galat: 'claude-seo tidak mengembalikan apa pun' }

  const json = cabutJson(raw)
  if (json === null) {
    return { ok: false, galat: `Keluaran bukan JSON: ${judulPendek(raw).slice(0, 200)}` }
  }

  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err)
    return { ok: false, galat: `JSON tidak sah: ${pesan}` }
  }

  if (typeof data !== 'object' || data === null || !Array.isArray((data as { temuan?: unknown }).temuan)) {
    return { ok: false, galat: 'JSON tidak memuat array "temuan"' }
  }

  const masuk = (data as { temuan: unknown[] }).temuan
  const temuan: NewFinding[] = []
  let dilewati = 0

  for (const t of masuk.slice(0, BATAS_TEMUAN)) {
    if (typeof t !== 'object' || t === null) {
      dilewati += 1
      continue
    }
    const o = t as Record<string, unknown>

    const rule = normalkanRule(String(o.rule ?? ''))
    const judul = judulPendek(String(o.title ?? ''))
    // Temuan tanpa aturan tidak punya identitas, dan tanpa judul tidak punya
    // isi. Keduanya wajib; sisanya boleh kosong.
    if (rule === '' || judul === '') {
      dilewati += 1
      continue
    }

    const sev = String(o.severity ?? '').toLowerCase()
    const severity: Severity = (SEVERITY as string[]).includes(sev)
      ? (sev as Severity)
      // Severity yang tidak dikenal jadi `medium`, bukan dibuang: keparahan
      // yang salah label masih temuan, dan `info` akan menguburnya.
      : 'medium'

    const { url, pageId } = cocokkanHalaman(o.url, halaman, baseUrl)

    temuan.push({
      url,
      pageId,
      severity,
      rule,
      title: judul,
      detail: {
        sumber: 'claude-seo',
        catatan: typeof o.detail === 'string' ? o.detail : (o.detail ?? null),
        urlAsli: typeof o.url === 'string' ? o.url : null,
        ruleAsli: String(o.rule ?? ''),
      },
    })
  }

  const terpotong = Math.max(0, masuk.length - BATAS_TEMUAN) + dilewati
  return { ok: true, temuan, terpotong }
}
