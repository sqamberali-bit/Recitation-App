/**
 * Repository layer — the single, typed API for all data access. UI code never
 * touches Dexie directly; it calls these functions (or the reactive hooks in
 * `store/`), which keeps persistence concerns in one place and makes future
 * changes (e.g. adding cloud sync) localised.
 */
import { db } from './database'
import { newId } from '@/lib/id'
import { contentHash } from '@/lib/text'
import type {
  AppSettings,
  Author,
  Collection,
  MediaAsset,
  Poem,
  PoemDraft,
  PoemWithMedia,
} from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

/* ----------------------------------------------------------------------- */
/* Poems                                                                    */
/* ----------------------------------------------------------------------- */

export interface SavePoemInput {
  draft: PoemDraft
  /** Freshly processed media not yet persisted. */
  newMedia?: MediaAsset[]
  /** IDs of previously-attached media the user removed. */
  removedMediaIds?: string[]
}

/**
 * Create or update a poem and reconcile its media in a single transaction, so
 * the poem row and its blobs never drift out of sync.
 */
export async function savePoem(input: SavePoemInput): Promise<string> {
  const { draft, newMedia = [], removedMediaIds = [] } = input
  const id = draft.id ?? newId('poem')
  const now = Date.now()

  return db.transaction('rw', db.poems, db.media, db.authors, async () => {
    const existing = draft.id ? await db.poems.get(draft.id) : undefined

    if (removedMediaIds.length) await db.media.bulkDelete(removedMediaIds)

    for (const m of newMedia) m.poemId = id
    if (newMedia.length) await db.media.bulkPut(newMedia)

    // Keep the id lists in the order the editor supplied, but drop any that no
    // longer exist (removed) — belt-and-braces against a stale draft.
    const removed = new Set(removedMediaIds)
    const imageIds = draft.imageIds.filter((x) => !removed.has(x))
    const pdfIds = draft.pdfIds.filter((x) => !removed.has(x))

    // Renumber `order` to match the saved sequence. Reads sort by it, so
    // without this the gallery drifts out of order after adds and removals.
    const ordered = [...imageIds, ...pdfIds]
    const rows = await db.media.where('poemId').equals(id).toArray()
    const updates = rows
      .map((m) => ({ row: m, next: ordered.indexOf(m.id) }))
      .filter(({ row, next }) => next >= 0 && row.order !== next)
    for (const { row, next } of updates) {
      await db.media.update(row.id, { order: next })
    }

    const authorId = await ensureAuthorId(draft.authorName)

    const poem: Poem = {
      ...draft,
      id,
      imageIds,
      pdfIds,
      authorId,
      contentHash: contentHash(draft.text),
      favourite: draft.favourite ?? false,
      favouritedAt: existing?.favouritedAt ?? (draft.favourite ? now : undefined),
      viewCount: existing?.viewCount ?? 0,
      lastViewedAt: existing?.lastViewedAt,
      bookmark: existing?.bookmark,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.poems.put(poem)
    return id
  })
}

export async function getPoemWithMedia(id: string): Promise<PoemWithMedia | undefined> {
  const poem = await db.poems.get(id)
  if (!poem) return undefined
  const media = await db.media.where('poemId').equals(id).toArray()
  const byId = new Map(media.map((m) => [m.id, m]))
  const order = (a: MediaAsset, b: MediaAsset) => a.order - b.order
  const images = poem.imageIds
    .map((mid) => byId.get(mid))
    .filter((m): m is MediaAsset => !!m && m.type === 'image')
  const pdfs = poem.pdfIds
    .map((mid) => byId.get(mid))
    .filter((m): m is MediaAsset => !!m && m.type === 'pdf')
  // Include any orphans not referenced in the ordered lists (defensive).
  const referenced = new Set([...poem.imageIds, ...poem.pdfIds])
  for (const m of media) {
    if (referenced.has(m.id)) continue
    ;(m.type === 'image' ? images : pdfs).push(m)
  }
  return { poem, images: images.sort(order), pdfs: pdfs.sort(order) }
}

/** Delete a poem and all of its media blobs atomically. Records a tombstone for sync. */
export async function deletePoem(id: string): Promise<void> {
  await db.transaction('rw', db.poems, db.media, db.tombstones, async () => {
    await db.media.where('poemId').equals(id).delete()
    await db.poems.delete(id)
    await db.tombstones.put({ id, table: 'poems', deletedAt: Date.now() })
  })
}

export async function toggleFavourite(id: string): Promise<void> {
  await db.transaction('rw', db.poems, async () => {
    const p = await db.poems.get(id)
    if (!p) return
    const favourite = !p.favourite
    await db.poems.update(id, {
      favourite,
      favouritedAt: favourite ? Date.now() : undefined,
    })
  })
}

/** Record a view: bump the counter and timestamp (drives Recently Viewed). */
export async function recordView(id: string): Promise<void> {
  await db.transaction('rw', db.poems, async () => {
    const p = await db.poems.get(id)
    if (!p) return
    await db.poems.update(id, { viewCount: p.viewCount + 1, lastViewedAt: Date.now() })
  })
}

export async function setBookmark(id: string, bookmark: number | undefined): Promise<void> {
  await db.poems.update(id, { bookmark })
}

/* ----------------------------------------------------------------------- */
/* Authors & collections                                                    */
/* ----------------------------------------------------------------------- */

async function ensureAuthorId(name?: string): Promise<string | undefined> {
  const trimmed = name?.trim()
  if (!trimmed) return undefined
  const existing = await db.authors
    .filter((a) => a.name.toLowerCase() === trimmed.toLowerCase())
    .first()
  if (existing) return existing.id
  const now = Date.now()
  const author: Author = { id: newId('auth'), name: trimmed, createdAt: now, updatedAt: now }
  await db.authors.put(author)
  return author.id
}

export async function saveCollection(
  input: Partial<Collection> & { name: string },
): Promise<string> {
  const now = Date.now()
  const id = input.id ?? newId('col')
  const existing = input.id ? await db.collections.get(input.id) : undefined
  await db.collections.put({
    id,
    name: input.name.trim(),
    nameUrdu: input.nameUrdu,
    description: input.description,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })
  return id
}

export async function deleteCollection(id: string): Promise<void> {
  await db.transaction('rw', db.poems, db.collections, db.tombstones, async () => {
    await db.collections.delete(id)
    const affected = await db.poems.where('collectionIds').equals(id).toArray()
    for (const p of affected) {
      await db.poems.update(p.id, {
        collectionIds: p.collectionIds.filter((c) => c !== id),
      })
    }
    await db.tombstones.put({ id, table: 'collections', deletedAt: Date.now() })
  })
}

/* ----------------------------------------------------------------------- */
/* Media                                                                    */
/* ----------------------------------------------------------------------- */

export function getMedia(id: string): Promise<MediaAsset | undefined> {
  return db.media.get(id)
}

/* ----------------------------------------------------------------------- */
/* Settings                                                                 */
/* ----------------------------------------------------------------------- */

export async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.get('app')
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) }
}

/**
 * Merge a patch into the settings row inside a transaction. Read-modify-write
 * outside one would let two quick changes (e.g. font size then theme) race,
 * with the slower write silently reverting the faster one.
 */
export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
    await db.settings.put({ ...DEFAULT_SETTINGS, ...current, ...patch, key: 'app' })
  })
}

/* ----------------------------------------------------------------------- */
/* Duplicates & stats                                                       */
/* ----------------------------------------------------------------------- */

export interface DuplicateGroup {
  hash: string
  poems: Poem[]
}

/** Group poems that share a normalised content hash (likely duplicates). */
export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const poems = await db.poems.toArray()
  const byHash = new Map<string, Poem[]>()
  for (const p of poems) {
    // Poems with no text yet (image-only scans awaiting OCR) all normalise to
    // the same empty hash. Grouping them would tell the user to delete entirely
    // unrelated poems, so they are never treated as duplicates.
    if (!p.contentHash || !p.text?.trim()) continue
    const list = byHash.get(p.contentHash) ?? []
    list.push(p)
    byHash.set(p.contentHash, list)
  }
  return [...byHash.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([hash, list]) => ({ hash, poems: list.sort((a, b) => a.createdAt - b.createdAt) }))
}

export interface LibraryStats {
  poems: number
  authors: number
  collections: number
  media: number
  favourites: number
  bytes: number
}

export async function getLibraryStats(): Promise<LibraryStats> {
  const [poems, authors, collections, media, favourites] = await Promise.all([
    db.poems.count(),
    db.authors.count(),
    db.collections.count(),
    db.media.count(),
    // Boolean can't be indexed, so filter in a cursor scan.
    db.poems.filter((p) => p.favourite === true).count(),
  ])
  let bytes = 0
  await db.media.each((m) => {
    bytes += m.size || 0
  })
  return { poems, authors, collections, media, favourites, bytes }
}
