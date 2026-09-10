import type { StripHalaman } from '../lib/ui/tangkapan.ts'
import { LEBAR } from '../lib/scanners/mobile-parity.ts'
import type { T } from '../lib/i18n/index.ts'

/**
 * Tiga lebar berdampingan, satu baris per halaman.
 *
 * ============================================================================
 * KENAPA BERDAMPINGAN DAN BUKAN SATU-SATU
 * ============================================================================
 * Aspek ini seluruhnya tentang PERBANDINGAN. Satu tangkapan ponsel tidak
 * menjawab apa pun — yang menjawab adalah melihat 390 di sebelah 1440, karena
 * di situlah "kartunya terpotong" dan "judulnya tidak ikut mengecil" terlihat
 * dalam satu pandangan, tanpa membaca satu angka pun.
 *
 * Skalanya sengaja proporsional terhadap lebar aslinya, bukan disamakan
 * tingginya. Menyamakan tinggi akan membuat tangkapan ponsel tampak selebar
 * desktop, dan seluruh gunanya hilang.
 */
export function StripTangkapan({ siteId, strip, t }: { siteId: number; strip: StripHalaman[]; t: T }) {
  if (strip.length === 0) return null

  return (
    <section className="strip" aria-label={t('mobile.stripLabel')}>
      <p className="strip-catatan">{t('mobile.stripCatatan')}</p>

      {strip.map((h) => (
        <div key={h.url} className="strip-halaman">
          {/* URL-nya ditulis penuh, bukan dipotong: yang membedakan dua
              halaman produk seringkali justru ujung path-nya. */}
          <p className="strip-url">{h.url}</p>
          <div className="strip-baris">
            {LEBAR.map((l) => {
              const berkas = h.berkas[l.nama]
              if (!berkas) return null
              return (
                <figure key={l.nama} className="strip-item">
                  <figcaption className="strip-lebar">
                    {l.nama} &middot; {l.width}px
                  </figcaption>
                  {/* `<a>` pembungkus: tangkapan halaman penuh bisa 6000
                      piksel tingginya, jadi yang di layar adalah pratinjau
                      dan yang penuh dibuka di tab baru. */}
                  <a href={`/sites/${siteId}/tangkapan/${berkas}`} target="_blank" rel="noreferrer">
                    <img
                      src={`/sites/${siteId}/tangkapan/${berkas}`}
                      alt={t('mobile.stripAlt', { lebar: l.nama, url: h.url })}
                      // `loading="lazy"` penting di sini: satu situs bisa punya
                      // dua puluh lima halaman dikali tiga lebar, dan memuat
                      // tujuh puluh lima gambar sekaligus membuat tab ini
                      // terasa rusak.
                      loading="lazy"
                      className="strip-gambar"
                      style={{ width: `${l.width / 6}px` }}
                    />
                  </a>
                </figure>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
