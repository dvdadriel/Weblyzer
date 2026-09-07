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
      <p className="kartu-judul">
        <span className="kartu-nama">{s.name}</span>
        <span className="kartu-url">{s.base_url}</span>
      </p>
      <Tab siteId={s.id} />
      {children}
    </main>
  )
}
