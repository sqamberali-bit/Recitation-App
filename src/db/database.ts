/**
 * IndexedDB schema (via Dexie). Chosen over LocalStorage because the library
 * must hold thousands of poems plus image/PDF blobs, support indexed queries,
 * and work fully offline.
 *
 * Indexing notes:
 *  - `*collectionIds`, `*tags`, `*topics`, `*occasions` are multi-entry indexes
 *    so a poem can be found by ANY of its tags/collections in O(log n).
 *  - `contentHash` indexes duplicate detection.
 *  - Media blobs live in their own table so poem rows stay small and fast to
 *    scan for search-index building.
 */
import Dexie, { type Table } from 'dexie'
import type { Author, Collection, MediaAsset, Poem, AppSettings } from '@/types'

export interface Tombstone {
  id: string
  table: 'poems' | 'authors' | 'collections'
  deletedAt: number
}

export class RecitationDB extends Dexie {
  poems!: Table<Poem, string>
  media!: Table<MediaAsset, string>
  authors!: Table<Author, string>
  collections!: Table<Collection, string>
  settings!: Table<AppSettings, string>
  tombstones!: Table<Tombstone, string>

  constructor() {
    super('recitation-db')

    this.version(1).stores({
      poems:
        'id, title, language, kind, authorId, authorName, category, favouritedAt, createdAt, updatedAt, lastViewedAt, viewCount, contentHash, *collectionIds, *tags, *topics, *occasions',
      media: 'id, poemId, type, createdAt',
      authors: 'id, name',
      collections: 'id, name',
      settings: 'key',
    })

    this.version(2).stores({
      poems:
        'id, title, language, kind, authorId, authorName, category, favouritedAt, createdAt, updatedAt, lastViewedAt, viewCount, contentHash, onenoteSourceId, *collectionIds, *tags, *topics, *occasions',
    })

    this.version(3).stores({
      tombstones: 'id, table, deletedAt',
    })
  }
}

export const db = new RecitationDB()

/** Delete the whole database (used by "reset library" in settings). */
export async function resetDatabase(): Promise<void> {
  await db.delete()
  await db.open()
}
