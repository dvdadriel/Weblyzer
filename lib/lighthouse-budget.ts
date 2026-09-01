export type HalamanTerpilih = {
  id: number
  url: string
  is_pinned: number
}

export const MAKS_SAMPLE = 25

/** Berapa banyak nilai berbeda pada satu posisi sebelum ia dianggap identitas. */
const AMBANG_IDENTITAS = 4

type Bagian = { segmen: string[]; kunciQuery: string }

function pecah(raw: string): Bagian {
  const url = new URL(raw)
  return {
    segmen: url.pathname.split('/').filter((s) => s.length > 0),
    kunciQuery: [...url.searchParams.keys()].sort().join(','),
  }
}

/**
 * Bentuk sebuah URL tanpa melihat URL lain: hanya angka murni dan heks panjang
 * yang disamarkan.
 *
 * Sengaja konservatif. Bentuk string tidak bisa membedakan slug dari nama path
 * tetap — `/store-location` dan `/news/artikel-pertama` sama-sama bertanda
 * hubung, tetapi yang pertama satu halaman tersendiri dan yang kedua satu dari
 * enam puluh. Menebak dari bentuk pernah menggabungkan `/store-location`
 * dengan `/exhibition-location` menjadi satu pola, sehingga salah satunya
 * tidak pernah diukur.
 *
 * Pengelompokan yang sesungguhnya dikerjakan `petaPola`, yang melihat seluruh
 * daftar dan memutuskan berdasarkan frekuensi — bukan dugaan.
 */
export function polaUrl(raw: string): string {
  const { segmen, kunciQuery } = pecah(raw)
  const disamarkan = segmen.map((s) =>
    /^\d+$/.test(s) || /^[0-9a-f]{16,}$/i.test(s) ? '*' : s,
  )
  return `/${disamarkan.join('/')}${kunciQuery ? `?${kunciQuery}` : ''}`
}

/**
 * Menentukan pola tiap URL dengan melihat seluruh daftar sekaligus.
 *
 * Caranya: URL dikelompokkan menurut kedalaman path dan nama parameter query,
 * lalu untuk setiap posisi segmen dihitung berapa nilai berbeda yang muncul di
 * kelompok itu. Posisi dengan banyak nilai berbeda adalah posisi identitas
 * (`/news/1`, `/news/2`, … enam puluh judul), sedangkan posisi dengan sedikit
 * nilai adalah bagian tetap dari struktur situs (`/store-location` melawan
 * `/exhibition-location` — dua halaman, bukan satu template).
 *
 * Berbasis data, bukan bentuk string. Inilah yang membuat enam puluh halaman
 * berita menyusut menjadi satu contoh tanpa ikut menelan halaman yang memang
 * berdiri sendiri.
 */
export function petaPola(urls: string[]): Map<string, string> {
  type Kelompok = { urls: string[]; nilai: Set<string>[] }
  const kelompok = new Map<string, Kelompok>()

  for (const raw of urls) {
    let bagian: Bagian
    try {
      bagian = pecah(raw)
    } catch {
      continue
    }
    const kunci = `${bagian.segmen.length}\n${bagian.kunciQuery}`
    let k = kelompok.get(kunci)
    if (k === undefined) {
      k = { urls: [], nilai: bagian.segmen.map(() => new Set<string>()) }
      kelompok.set(kunci, k)
    }
    k.urls.push(raw)
    bagian.segmen.forEach((s, i) => k!.nilai[i]?.add(s))
  }

  const hasil = new Map<string, string>()
  for (const [kunci, k] of kelompok) {
    const kunciQuery = kunci.split('\n')[1] ?? ''
    for (const raw of k.urls) {
      const { segmen } = pecah(raw)
      const pola = segmen.map((s, i) => {
        const berbeda = k.nilai[i]?.size ?? 1
        if (berbeda >= AMBANG_IDENTITAS) return '*'
        // Angka murni dan heks panjang selalu identitas, sekalipun kebetulan
        // hanya ada satu atau dua di daftar.
        return /^\d+$/.test(s) || /^[0-9a-f]{16,}$/i.test(s) ? '*' : s
      })
      hasil.set(raw, `/${pola.join('/')}${kunciQuery ? `?${kunciQuery}` : ''}`)
    }
  }

  return hasil
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

  const pola = petaPola(halaman.map((h) => h.url))
  const polaTerlihat = new Set<string>()
  for (const h of halaman) {
    if (terpilih.size >= MAKS_SAMPLE) break
    if (terpilih.has(h.url)) continue
    const p = pola.get(h.url)
    if (p === undefined) continue
    if (polaTerlihat.has(p)) continue
    polaTerlihat.add(p)
    terpilih.set(h.url, h)
  }

  return [...terpilih.values()]
}
