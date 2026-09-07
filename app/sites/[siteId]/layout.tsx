import { notFound } from 'next/navigation'
import { db } from '../../../lib/ui/db.ts'
import { situs, ringkasanAi, statusAi } from '../../../lib/ui/queries.ts'
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
  const s = situs(db(), Number(siteId))
  if (!s) notFound()

  return (
    <>
      {/* Tautan kembali yang kontekstual, di samping navbar yang global.
          Keduanya menuju index, dan itu memang lazim: yang ini muncul hanya di
          tempat yang punya asal untuk dikembalikan. */}
      <Link href="/" className="kembali">
        <Ikon nama="kembali" />
        Semua Situs
      </Link>
      {/* `div`, bukan `p`: sebuah heading tidak boleh berada di dalam `<p>`, dan
          nama situs memang judul halaman ini. Kelasnya sama, jadi tampilannya
          tidak berubah — yang berubah cuma DOM-nya jadi jujur. */}
      <div className="kartu-judul">
        <h1 className="kartu-nama">{s.name}</h1>
        <span className="kartu-url">{s.base_url}</span>
      </div>
      <Tab siteId={s.id} />

      {/* Di layout, bukan di halaman kategori: ringkasannya membahas seluruh
          situs, jadi menampilkannya per tab berarti empat salinan dari satu
          teks yang sama. Di sini ia muncul sekali, di atas tab mana pun. */}
      <RingkasanAi
        isi={ringkasanAi(db(), s.id)}
        status={statusAi(db(), s.id)}
        siteId={s.id}
        path={`/sites/${s.id}/bugs`}
      />

      {children}
    </>
  )
}
