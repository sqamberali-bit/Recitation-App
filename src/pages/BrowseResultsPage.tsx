import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PoemCard } from '@/components/PoemCard'
import { EmptyState } from '@/components/EmptyState'
import { IconBack } from '@/components/icons'
import { useLibrary } from '@/store/library'

/** Results for a browse facet (collection, author, category, topic, occasion, tag). */
export function BrowseResultsPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { poems } = useLibrary()

  const label = params.get('label') ?? 'Results'
  const collectionId = params.get('collectionId')
  const authorId = params.get('authorId')
  const category = params.get('category')
  const topic = params.get('topic')
  const occasion = params.get('occasion')
  const tag = params.get('tag')

  const results = useMemo(
    () =>
      poems
        .filter((p) => {
          if (collectionId && !p.collectionIds.includes(collectionId)) return false
          if (authorId && p.authorId !== authorId) return false
          if (category && p.category !== category) return false
          if (topic && !p.topics.includes(topic)) return false
          if (occasion && !p.occasions.includes(occasion)) return false
          if (tag && !p.tags.includes(tag)) return false
          return true
        })
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [poems, collectionId, authorId, category, topic, occasion, tag],
  )

  return (
    <>
      <header className="appbar">
        <button className="iconbtn" onClick={() => navigate(-1)} aria-label="Back"><IconBack /></button>
        <div className="appbar__title">{label}</div>
      </header>
      <div className="shell">
        <p className="muted text-sm" style={{ marginBottom: 14 }}>
          {results.length} {results.length === 1 ? 'poem' : 'poems'}
        </p>
        {results.length === 0 ? (
          <EmptyState icon="📭" title="Nothing here yet" />
        ) : (
          <div className="grid">
            {results.map((p) => <PoemCard key={p.id} poem={p} />)}
          </div>
        )}
      </div>
    </>
  )
}
