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

export function getPoem(id: string): Promise<Poem | undefined> {
  return db.poems.get(id)
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

/** Delete a poem and all of its media blobs atomically. */
export async function deletePoem(id: string): Promise<void> {
  await db.transaction('rw', db.poems, db.media, async () => {
    await db.media.where('poemId').equals(id).delete()
    await db.poems.delete(id)
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

/** All poems, minimal use — prefer the reactive hooks for lists. */
export function allPoems(): Promise<Poem[]> {
  return db.poems.toArray()
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

export function listAuthors(): Promise<Author[]> {
  return db.authors.orderBy('name').toArray()
}

export async function saveAuthor(author: Partial<Author> & { name: string }): Promise<string> {
  const now = Date.now()
  const id = author.id ?? newId('auth')
  const existing = author.id ? await db.authors.get(author.id) : undefined
  await db.authors.put({
    id,
    name: author.name.trim(),
    nameUrdu: author.nameUrdu,
    bio: author.bio,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })
  return id
}

export function listCollections(): Promise<Collection[]> {
  return db.collections.orderBy('name').toArray()
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
  await db.transaction('rw', db.poems, db.collections, async () => {
    await db.collections.delete(id)
    const affected = await db.poems.where('collectionIds').equals(id).toArray()
    for (const p of affected) {
      await db.poems.update(p.id, {
        collectionIds: p.collectionIds.filter((c) => c !== id),
      })
    }
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

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, key: 'app' })
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
    if (!p.contentHash) continue
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
