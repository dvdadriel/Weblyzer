/**
 * Wordmark di header. `judul` menentukan apakah dia *judul halaman* ini atau
 * cuma penanda merek.
 *
 * Di dashboard tidak ada judul lain, jadi "audit" memang judul halamannya dan
 * dirender `<h1>`. Di halaman situs, judulnya adalah nama situs — wordmark
 * turun jadi teks biasa supaya tidak ada dua `<h1>` yang bersaing.
 *
 * Tanpa ini tidak ada satu pun heading di seluruh aplikasi: struktur yang
 * terlihat jelas oleh mata sama sekali tidak ada di DOM, dan screen reader
 * kehilangan satu-satunya cara melompat antar wilayah. WCAG 2.2 AA disyaratkan
 * di PRODUCT.md, dan 1.3.1 menuntut heading visual ditandai sebagai heading.
 */
export function Wordmark({ judul = false }: { judul?: boolean } = {}) {
  return (
    <header className="wordmark">
      {judul ? (
        <h1 className="wordmark-teks">audit</h1>
      ) : (
        <span className="wordmark-teks">audit</span>
      )}
    </header>
  )
}
