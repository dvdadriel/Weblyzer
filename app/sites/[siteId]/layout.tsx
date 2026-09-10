import { notFound } from 'next/navigation'
import { db } from '../../../lib/ui/db.ts'
import { situs, ringkasanAi, statusAi } from '../../../lib/ui/queries.ts'
import { tServer, localeSekarang } from '../../../lib/i18n/server.ts'
import { Tab } from '../../../components/Tab.tsx'
import { Ikon } from '../../../components/Ikon.tsx'
import { RingkasanAi } from '../../../components/RingkasanAi.tsx'
import Link from 'next/link'

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params
  const t = await tServer()
  const locale = await localeSekarang()
  const id = Number(siteId)

  // Satu pemeriksaan keberadaan untuk SELURUH pohon `/sites/[siteId]/*`.
  //
  // Di layout, bukan di setiap halaman: layout ini membungkus ketujuh tab
  // kategori, halaman Lighthouse, dan halaman pengaturan. Tanpa ini, id yang
  // tidak ada akan merender kerangka halaman lengkap dengan nama situs kosong,
  // dan itu tampak seperti data yang hilang alih-alih alamat yang salah.
  const s = situs(db(), id)
  if (!s) notFound()

  return (
    <>
      {/* Tautan kembali yang kontekstual, di samping navbar yang global.
          Keduanya menuju index, dan itu memang lazim: yang ini muncul hanya di
          tempat yang punya asal untuk dikembalikan. */}
      <Link href="/" className="kembali">
        <Ikon nama="kembali" ukuran={14} />
        {t('nav.semuaSitus')}
      </Link>
      <div className="kartu-judul" style={{ marginBottom: 'var(--s-1)' }}>
        <h1 className="kartu-nama">{s.name}</h1>
        <a
          href={s.base_url}
          target="_blank"
          rel="noopener noreferrer"
          className="kartu-url"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          title={t('umum.kunjungi', { url: s.base_url })}
        >
          <span>{s.base_url}</span>
          <Ikon nama="eksternal" ukuran={12} />
        </a>
      </div>
      <p className="unduh">
        <a className="unduh-tautan" href={`/sites/${s.id}/export`} download>
          <Ikon nama="unduh" ukuran={14} />
          <span>{t('unduh.excel')}</span>
          <span className="unduh-tag">.xlsx</span>
        </a>
        {/* Di sebelah unduhan, bukan sebagai tab: pengaturan bukan kategori
            temuan, dan menaruhnya di bilah tab akan menyiratkan ia punya
            temuannya sendiri. Keduanya aksi tingkat situs, jadi duduk bersama. */}
        <Link className="unduh-tautan" href={`/sites/${s.id}/pengaturan`}>
          <Ikon nama="segarkan" ukuran={14} />
          <span>{t('atur.pemicu')}</span>
        </Link>
        <span className="unduh-catatan">{t('unduh.catatan')}</span>
      </p>

      <Tab siteId={s.id} locale={locale} />

      {/* Di layout, bukan di halaman kategori: ringkasannya membahas seluruh
          situs, jadi menampilkannya per tab berarti empat salinan dari satu
          teks yang sama. Di sini ia muncul sekali, di atas tab mana pun. */}
      <RingkasanAi
        locale={locale}
        isi={ringkasanAi(db(), s.id)}
        status={statusAi(db(), s.id)}
        siteId={s.id}
        path={`/sites/${s.id}/bugs`}
      />

      {children}
    </>
  )
}
