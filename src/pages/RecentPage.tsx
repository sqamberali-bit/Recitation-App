import { useMemo } from 'react'
import { PoemCard } from '@/components/PoemCard'
import { EmptyState } from '@/components/EmptyState'
import { useLibrary } from '@/store/library'

export function RecentPage() {
  const { poems } = useLibrary()
  const recent = useMemo(
    () =>
      poems
        .filter((p) => p.lastViewedAt)
        .sort((a, b) => (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0))
        .slice(0, 60),
    [poems],
  )

  return (
    <>
      <header className="appbar"><div className="appbar__title">Recently viewed</div></header>
      <div className="shell">
        {recent.length === 0 ? (
          <EmptyState icon="🕘" title="Nothing read yet" message="Poems you open will appear here for quick access." />
        ) : (
          <div className="grid">
            {recent.map((p) => <PoemCard key={p.id} poem={p} />)}
          </div>
        )}
      </div>
    </>
  )
}
