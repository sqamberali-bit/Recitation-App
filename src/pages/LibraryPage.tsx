import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchBar } from '@/components/SearchBar'
import { PoemCard } from '@/components/PoemCard'
import { EmptyState } from '@/components/EmptyState'
import { Sheet } from '@/components/Sheet'
import { IconFilter, IconGrid, IconList, IconUpload } from '@/components/icons'
import { useLibrary, useFilteredPoems } from '@/store/library'
import { LANGUAGES, POEM_KINDS, type LibraryQuery } from '@/types'
import { useNavigate } from 'react-router-dom'

const PAGE = 48

export function LibraryPage() {
  const { ready, poems, facets, authors, collections } = useLibrary()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [text, setText] = useState('')
  const [query, setQuery] = useState<LibraryQuery>({})
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [visible, setVisible] = useState(PAGE)

  // PWA shortcut deep-link: /?focus=search
  const autoFocus = params.get('focus') === 'search'
  useEffect(() => {
    if (autoFocus) {
      params.delete('focus')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fullQuery = useMemo<LibraryQuery>(() => ({ ...query, text }), [query, text])
  const results = useFilteredPoems(fullQuery)

  useEffect(() => setVisible(PAGE), [fullQuery])

  const activeFilters =
    (query.language ? 1 : 0) +
    (query.kind ? 1 : 0) +
    (query.category ? 1 : 0) +
    (query.authorId ? 1 : 0) +
    (query.collectionId ? 1 : 0) +
    (query.tag ? 1 : 0) +
    (query.favouritesOnly ? 1 : 0)

  // Infinite scroll sentinel.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => v + PAGE)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [results.length])

  const set = (patch: Partial<LibraryQuery>) => setQuery((q) => ({ ...q, ...patch }))
  const shown = results.slice(0, visible)

  return (
    <>
      <header className="appbar">
        <div className="appbar__title">Library</div>
        <div className="appbar__spacer" />
        <button className="iconbtn" onClick={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))} aria-label="Toggle view">
          {view === 'grid' ? <IconList /> : <IconGrid />}
        </button>
      </header>

      <div className="shell">
        <div className="row-flex" style={{ gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <SearchBar value={text} onChange={setText} autoFocus={autoFocus} placeholder="Search titles & verses…" />
          </div>
          <button
            className="btn btn--ghost"
            onClick={() => setFiltersOpen(true)}
            style={{ position: 'relative' }}
          >
            <IconFilter />
            <span className="hide-sm">Filters</span>
            {activeFilters > 0 && <span className="badge" style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}>{activeFilters}</span>}
          </button>
        </div>

        {/* Quick kind chips */}
        {facets.kinds.length > 1 && (
          <div className="scroller" style={{ marginBottom: 14 }}>
            <button className={`chip ${!query.kind ? 'chip--active' : ''}`} onClick={() => set({ kind: null })}>
              All
            </button>
            {facets.kinds.map((f) => (
              <button
                key={f.value}
                className={`chip ${query.kind === f.value ? 'chip--active' : ''}`}
                onClick={() => set({ kind: query.kind === f.value ? null : (f.value as LibraryQuery['kind']) })}
              >
                {f.value} <span className="chip__count">{f.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Category chips */}
        {facets.categories.length > 0 && (
          <div className="scroller" style={{ marginBottom: 14 }}>
            <button className={`chip ${!query.category ? 'chip--active' : ''}`} onClick={() => set({ category: null })}>
              All categories
            </button>
            {facets.categories.map((f) => (
              <button
                key={f.value}
                className={`chip ${query.category === f.value ? 'chip--active' : ''}`}
                onClick={() => set({ category: query.category === f.value ? null : f.value })}
                dir="auto"
              >
                {f.value} <span className="chip__count">{f.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="row-flex" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="muted text-sm">{results.length} {results.length === 1 ? 'poem' : 'poems'}</span>
          <select
            className="select"
            style={{ width: 'auto', padding: '6px 30px 6px 12px' }}
            value={query.sort ?? (text.trim() ? 'relevance' : 'recent')}
            onChange={(e) => set({ sort: e.target.value as LibraryQuery['sort'] })}
            aria-label="Sort results"
          >
            {text.trim() && <option value="relevance">Best match</option>}
            <option value="recent">Recently updated</option>
            <option value="created">Newest added</option>
            <option value="title">Title A–Z</option>
            <option value="views">Most read</option>
          </select>
        </div>

        {!ready ? (
          <div className="grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 150 }} />
            ))}
          </div>
        ) : poems.length === 0 ? (
          <EmptyState
            title="Your library is empty"
            message="Add your first poem or noha, or bulk-import your existing collection from OneNote."
            action={
              <div className="row-flex" style={{ justifyContent: 'center', gap: 10 }}>
                <button className="btn btn--primary" onClick={() => navigate('/editor/new')}>Add a poem</button>
                <button className="btn btn--ghost" onClick={() => navigate('/import')}><IconUpload /> Import</button>
              </div>
            }
          />
        ) : results.length === 0 ? (
          <EmptyState icon="🔍" title="No matches" message="Try a different search or clear your filters." />
        ) : (
          <>
            <div className={view === 'grid' ? 'grid' : 'rows'}>
              {shown.map((p) => (
                <PoemCard key={p.id} poem={p} />
              ))}
            </div>
            {visible < results.length && <div ref={sentinel} style={{ height: 40 }} />}
          </>
        )}
      </div>

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        query={query}
        set={set}
        clearAll={() => setQuery({ sort: query.sort })}
        facets={facets}
        authors={authors}
        collections={collections}
      />
    </>
  )
}

/* --------------------------------------------------------------------- */

import type { Facets } from '@/store/library'
import type { Author, Collection } from '@/types'

interface FilterSheetProps {
  open: boolean
  onClose: () => void
  query: LibraryQuery
  set: (patch: Partial<LibraryQuery>) => void
  clearAll: () => void
  facets: Facets
  authors: Author[]
  collections: Collection[]
}

function FilterSheet({ open, onClose, query, set, clearAll, facets, authors, collections }: FilterSheetProps) {
  return (
    <Sheet open={open} title="Filters" onClose={onClose}>
      <div className="field">
        <label>Language</label>
        <div className="chips">
          <button className={`chip ${!query.language ? 'chip--active' : ''}`} onClick={() => set({ language: null })}>Any</button>
          {LANGUAGES.map((l) => (
            <button key={l.value} className={`chip ${query.language === l.value ? 'chip--active' : ''}`} onClick={() => set({ language: query.language === l.value ? null : l.value })}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Type</label>
        <div className="chips">
          <button className={`chip ${!query.kind ? 'chip--active' : ''}`} onClick={() => set({ kind: null })}>Any</button>
          {POEM_KINDS.map((k) => (
            <button key={k} className={`chip ${query.kind === k ? 'chip--active' : ''}`} onClick={() => set({ kind: query.kind === k ? null : k })}>
              {k}
            </button>
          ))}
        </div>
      </div>

      {authors.length > 0 && (
        <div className="field">
          <label>Author</label>
          <select className="select" value={query.authorId ?? ''} onChange={(e) => set({ authorId: e.target.value || null })}>
            <option value="">Any author</option>
            {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}

      {collections.length > 0 && (
        <div className="field">
          <label>Collection</label>
          <select className="select" value={query.collectionId ?? ''} onChange={(e) => set({ collectionId: e.target.value || null })}>
            <option value="">Any collection</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {facets.categories.length > 0 && (
        <div className="field">
          <label>Category</label>
          <div className="chips">
            {facets.categories.slice(0, 20).map((f) => (
              <button key={f.value} className={`chip ${query.category === f.value ? 'chip--active' : ''}`} onClick={() => set({ category: query.category === f.value ? null : f.value })}>
                {f.value} <span className="chip__count">{f.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {facets.tags.length > 0 && (
        <div className="field">
          <label>Tag</label>
          <div className="chips">
            {facets.tags.slice(0, 24).map((f) => (
              <button key={f.value} className={`chip ${query.tag === f.value ? 'chip--active' : ''}`} onClick={() => set({ tag: query.tag === f.value ? null : f.value })}>
                {f.value} <span className="chip__count">{f.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="switch-row">
        <span>Favourites only</span>
        <label className="switch">
          <input type="checkbox" checked={!!query.favouritesOnly} onChange={(e) => set({ favouritesOnly: e.target.checked })} />
          <span />
        </label>
      </div>

      <div className="row-flex mt-4" style={{ gap: 10 }}>
        <button className="btn btn--ghost btn--block" onClick={clearAll}>Clear all</button>
        <button className="btn btn--primary btn--block" onClick={onClose}>Show results</button>
      </div>
    </Sheet>
  )
}
