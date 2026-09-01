/**
 * Menyeragamkan URL agar satu halaman tidak tercatat berkali-kali. Fragment
 * dibuang (tidak menghasilkan dokumen berbeda) dan parameter query diurutkan
 * (urutannya tidak bermakna bagi server).
 */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw)
  // Skema non-khusus (mailto:, javascript:, about:) tidak punya host, dan
  // menyusunnya kembali menghasilkan string ngawur alih-alih error. Memilih
  // melempar supaya pemanggil berikutnya mendapat kesalahan yang bisa ditangkap.
  if (url.host === '') throw new Error(`URL tanpa host: ${raw}`)
  url.hash = ''
  url.searchParams.sort()
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')
  const query = url.searchParams.toString()
  return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ''}`
}
