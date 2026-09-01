export type HalamanTerpilih = {
  id: number
  url: string
  is_pinned: number
}

export const MAKS_SAMPLE = 25

/**
 * Bentuk path sebuah URL, dipakai untuk mengelompokkan halaman yang dibangun
 * dari template yang sama.
 *
 * Segmen yang tampak seperti identitas — angka, slug panjang, UUID — diganti
 * `*`. Enam puluh halaman berita menghasilkan enam puluh skor yang nyaris
 * identik, jadi satu contoh sudah memberi sinyal yang sama dengan biaya 1/60.
 *
 * Nama parameter query ikut dihitung tetapi nilainya tidak: `?locale=en` dan
 * `?locale=id` adalah template yang sama, sedangkan `?sort=asc` berbeda.
 */
export function polaUrl(raw: string): string {
  const url = new URL(raw)
  const segmen = url.pathname
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) =>
      /^\d+$/.test(s) || s.includes('-') || s.length > 12 || /^[0-9a-f-]{16,}$/i.test(s)
        ? '*'
        : s,
    )
  const kunciQuery = [...url.searchParams.keys()].sort().join(',')
  return `/${segmen.join('/')}${kunciQuery ? `?${kunciQuery}` : ''}`
}

/**
 * Memilih halaman mana yang diukur Lighthouse.
 *
 * `full` mengukur semuanya — 141 halaman berarti sekitar 25 menit. `sample`
 * mengambil akar, semua halaman yang dipin, dan satu contoh per pola URL,
 * dibatasi 25 halaman. Halaman yang dipin tidak pernah tergeser oleh batas itu:
 * pengguna sudah menyatakan halaman itu penting.
 */
export function pilihHalaman(
  halaman: HalamanTerpilih[],
  mode: 'sample' | 'full',
): HalamanTerpilih[] {
  if (mode === 'full') return [...halaman]

  const terpilih = new Map<string, HalamanTerpilih>()

  for (const h of halaman) {
    if (h.is_pinned) terpilih.set(h.url, h)
  }

  const akar = halaman.find((h) => {
    try {
      return new URL(h.url).pathname === '/'
    } catch {
      return false
    }
  })
  if (akar !== undefined) terpilih.set(akar.url, akar)

  const polaTerlihat = new Set<string>()
  for (const h of halaman) {
    if (terpilih.size >= MAKS_SAMPLE) break
    if (terpilih.has(h.url)) continue
    let pola: string
    try {
      pola = polaUrl(h.url)
    } catch {
      continue
    }
    if (polaTerlihat.has(pola)) continue
    polaTerlihat.add(pola)
    terpilih.set(h.url, h)
  }

  return [...terpilih.values()]
}
