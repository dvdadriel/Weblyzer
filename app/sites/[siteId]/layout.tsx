import { notFound } from 'next/navigation'
import { db } from '../../../lib/ui/db.ts'
import { situs } from '../../../lib/ui/queries.ts'
import { Wordmark } from '../../../components/Wordmark.tsx'
import { Tab } from '../../../components/Tab.tsx'

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
    <main className="wrap">
      <Wordmark />
      {/* `div`, bukan `p`: sebuah heading tidak boleh berada di dalam `<p>`, dan
          nama situs memang judul halaman ini. Kelasnya sama, jadi tampilannya
          tidak berubah — yang berubah cuma DOM-nya jadi jujur. */}
      <div className="kartu-judul">
        <h1 className="kartu-nama">{s.name}</h1>
        <span className="kartu-url">{s.base_url}</span>
      </div>
      <Tab siteId={s.id} />
      {children}
    </main>
  )
}
