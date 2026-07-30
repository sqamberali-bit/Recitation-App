import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { SearchIndex } from '@/lib/search'
import type { Author, Collection, LibraryQuery, Poem } from '@/types'

/** A facet value with an occurrence count, for filter chips. */
export interface Facet {
  value: string
  count: number
}

export interface Facets {
  categories: Facet[]
  tags: Facet[]
  topics: Facet[]
  occasions: Facet[]
  kinds: Facet[]
  languages: Facet[]
}

interface LibraryContextValue {
  ready: boolean
  poems: Poem[]
  byId: Map<string, Poem>
  authors: Author[]
  collections: Collection[]
  searchIndex: SearchIndex
  facets: Facets
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

/** Shared empty array so the loading state keeps a stable reference. */
const EMPTY_POEMS: Poem[] = []

function tally(values: Iterable<string>): Facet[] {
  const counts = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** Read a list field defensively — a malformed record must not break browsing. */
function listOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function computeFacets(poems: Poem[]): Facets {
  return {
    categories: tally(poems.map((p) => p.category ?? '').filter(Boolean)),
    tags: tally(poems.flatMap((p) => listOf(p.tags))),
    topics: tally(poems.flatMap((p) => listOf(p.topics))),
    occasions: tally(poems.flatMap((p) => listOf(p.occasions))),
    kinds: tally(poems.map((p) => p.kind)),
    languages: tally(poems.map((p) => p.language)),
  }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const poems = useLiveQuery(() => db.poems.toArray(), [], undefined)
  const authors = useLiveQuery(() => db.authors.orderBy('name').toArray(), [], [])
  const collections = useLiveQuery(() => db.collections.orderBy('name').toArray(), [], [])

  const ready = poems !== undefined
  // Stable identity while loading: a fresh `[]` each render would rebuild the
  // search index and recompute every facet on every render.
  const list = useMemo(() => poems ?? EMPTY_POEMS, [poems])

  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list])

  const [searchIndex, setSearchIndex] = useState(() => new SearchIndex())
  const listRef = useRef(list)
  listRef.current = list
  useEffect(() => {
    const poems = listRef.current
    if (!poems.length) return
    const id = requestAnimationFrame(() => {
      const idx = new SearchIndex()
      idx.rebuild(poems)
      setSearchIndex(idx)
    })
    return () => cancelAnimationFrame(id)
  }, [list])

  const facets = useMemo(() => computeFacets(list), [list])

  const value = useMemo<LibraryContextValue>(
    () => ({ ready, poems: list, byId, authors: authors ?? [], collections: collections ?? [], searchIndex, facets }),
    [ready, list, byId, authors, collections, searchIndex, facets],
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider')
  return ctx
}

/**
 * Pure filter+search+sort over a poem set. Kept outside the component so it can
 * be unit-tested and reused.
 */
export function runQuery(
  poems: Poem[],
  byId: Map<string, Poem>,
  index: SearchIndex,
  q: LibraryQuery,
): Poem[] {
  const hasText = !!q.text && q.text.trim().length > 0
  let list: Poem[]

  if (hasText) {
    const ids = index.search(q.text!)
    list = ids.map((id) => byId.get(id)).filter((p): p is Poem => !!p)
  } else {
    list = [...poems]
  }

  list = list.filter((p) => {
    if (q.language && p.language !== q.language) return false
    if (q.kind && p.kind !== q.kind) return false
    if (q.authorId && p.authorId !== q.authorId) return false
    if (q.collectionId && !listOf(p.collectionIds).includes(q.collectionId)) return false
    if (q.category && p.category !== q.category) return false
    if (q.tag && !listOf(p.tags).includes(q.tag)) return false
    if (q.favouritesOnly && !p.favourite) return false
    return true
  })

  // While searching, relevance is the most useful order — honour an explicit
  // sort only when the user picks something other than the default.
  if (hasText && (!q.sort || q.sort === 'relevance')) return list

  const sort = q.sort ?? 'recent'
  const cmp: Record<string, (a: Poem, b: Poem) => number> = {
    recent: (a, b) => b.updatedAt - a.updatedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    views: (a, b) => b.viewCount - a.viewCount || b.updatedAt - a.updatedAt,
    title: (a, b) => (a.titleNative || a.title).localeCompare(b.titleNative || b.title),
  }
  return list.sort(cmp[sort] ?? cmp.recent)
}

/** Reactive filtered list for the current query. */
export function useFilteredPoems(q: LibraryQuery): Poem[] {
  const { poems, byId, searchIndex } = useLibrary()
  return useMemo(
    () => runQuery(poems, byId, searchIndex, q),
    [poems, byId, searchIndex, q],
  )
}
