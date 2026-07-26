/**
 * Full-text search over the whole library using MiniSearch. The index is built
 * in memory from poem rows (no blobs) — fast enough for many thousands of
 * poems and works entirely offline. Rebuilt only when poem data changes, not
 * on every keystroke (see store/library).
 */
import MiniSearch from 'minisearch'
import { normalizeToken, tokenize } from './text'
import type { Poem } from '@/types'

interface IndexedPoem {
  id: string
  title: string
  titleNative: string
  text: string
  translation: string
  transliteration: string
  authorName: string
  tags: string
  topics: string
  occasions: string
  category: string
}

const FIELDS: (keyof Omit<IndexedPoem, 'id'>)[] = [
  'title',
  'titleNative',
  'text',
  'translation',
  'transliteration',
  'authorName',
  'tags',
  'topics',
  'occasions',
  'category',
]

function toDoc(p: Poem): IndexedPoem {
  return {
    id: p.id,
    title: p.title ?? '',
    titleNative: p.titleNative ?? '',
    text: p.text ?? '',
    translation: p.translation ?? '',
    transliteration: p.transliteration ?? '',
    authorName: p.authorName ?? '',
    tags: p.tags.join(' '),
    topics: p.topics.join(' '),
    occasions: p.occasions.join(' '),
    category: p.category ?? '',
  }
}

function createIndex(): MiniSearch<IndexedPoem> {
  return new MiniSearch<IndexedPoem>({
    fields: FIELDS as string[],
    storeFields: ['id'],
    tokenize,
    processTerm: (term) => {
      const t = normalizeToken(term)
      return t.length ? t : null
    },
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
      boost: { title: 4, titleNative: 4, authorName: 2, tags: 2 },
    },
  })
}

export class SearchIndex {
  private mini = createIndex()

  /** Replace the entire index (called when the poem set changes wholesale). */
  rebuild(poems: Poem[]): void {
    this.mini = createIndex()
    this.mini.addAll(poems.map(toDoc))
  }

  /** Return matching poem IDs, best-ranked first. Empty query -> []. */
  search(query: string): string[] {
    const q = query.trim()
    if (!q) return []
    return this.mini.search(q).map((r) => r.id as string)
  }

  /** Autocomplete suggestions for the search box. */
  suggest(query: string): string[] {
    const q = query.trim()
    if (!q) return []
    return this.mini.autoSuggest(q, { fuzzy: 0.2 }).map((s) => s.suggestion).slice(0, 6)
  }
}
