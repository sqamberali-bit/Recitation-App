/**
 * Whole-library export/import and bulk text import.
 *
 *  - `exportLibrary()` packs every poem, author, collection, setting, and media
 *    blob (originals + thumbnails) into a single `.zip` for backup or transfer.
 *  - `importLibrary()` restores such a zip (merge or replace).
 *  - `importSimplePoems()` bulk-creates poems from a lightweight JSON array —
 *    the recommended path for migrating OneNote/other content (see docs).
 *
 * Uses fflate for fast, dependency-light (de)compression, all in the browser.
 */
import { zip, unzip, strToU8, strFromU8, type Unzipped } from 'fflate'
import { db } from '@/db/database'
import { newId } from './id'
import { asStringArray, contentHash, detectLanguage, excerpt } from './text'
import type {
  Author,
  Collection,
  Language,
  MediaAsset,
  Poem,
  PoemKind,
  AppSettings,
} from '@/types'

const ARCHIVE_VERSION = 1

type MediaMeta = Omit<MediaAsset, 'blob' | 'thumbnail'> & { hasThumbnail: boolean }

interface Archive {
  version: number
  exportedAt: number
  app: string
  poems: Poem[]
  authors: Author[]
  collections: Collection[]
  media: MediaMeta[]
  settings?: Partial<AppSettings>
}

function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)))
  })
}

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, out) => (err ? reject(err) : resolve(out)))
  })
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Copy a Uint8Array into a plain ArrayBuffer. fflate's views may be backed by
 * `ArrayBufferLike` (possibly SharedArrayBuffer), which `Blob` does not accept.
 */
function toBuffer(u8: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u8.byteLength)
  new Uint8Array(out).set(u8)
  return out
}

/** Build a backup zip of the entire library. */
export async function exportLibrary(): Promise<Blob> {
  const [poems, authors, collections, media, settingsRow] = await Promise.all([
    db.poems.toArray(),
    db.authors.toArray(),
    db.collections.toArray(),
    db.media.toArray(),
    db.settings.get('app'),
  ])

  const files: Record<string, Uint8Array> = {}
  const mediaMeta: MediaMeta[] = []

  for (const m of media) {
    files[`media/${m.id}`] = await blobBytes(m.blob)
    if (m.thumbnail) files[`media/${m.id}.thumb`] = await blobBytes(m.thumbnail)
    const { blob: _b, thumbnail: _t, ...rest } = m
    mediaMeta.push({ ...rest, hasThumbnail: !!m.thumbnail })
  }

  // Strip every credential and private endpoint. A backup is often shared with
  // family or restored on a borrowed device; it must not carry the user's API
  // key or the URL of their personal backup storage.
  let settings: Partial<AppSettings> | undefined
  if (settingsRow) {
    const {
      aiCorrectionKey: _k,
      syncEndpoint: _s,
      aiCorrectionEndpoint: _e,
      ...safe
    } = settingsRow
    settings = safe
  }

  const manifest: Archive = {
    version: ARCHIVE_VERSION,
    exportedAt: Date.now(),
    app: 'recitation-app',
    poems,
    authors,
    collections,
    media: mediaMeta,
    settings,
  }
  files['library.json'] = strToU8(JSON.stringify(manifest))

  const packed = await zipAsync(files)
  return new Blob([toBuffer(packed)], { type: 'application/zip' })
}

/** Force a restored poem row into a shape the rest of the app can rely on. */
function sanitizePoem(p: Poem): Poem {
  return {
    ...p,
    title: typeof p.title === 'string' ? p.title : '',
    text: typeof p.text === 'string' ? p.text : '',
    collectionIds: asStringArray(p.collectionIds),
    topics: asStringArray(p.topics),
    occasions: asStringArray(p.occasions),
    tags: asStringArray(p.tags),
    imageIds: asStringArray(p.imageIds),
    pdfIds: asStringArray(p.pdfIds),
    favourite: p.favourite === true,
    viewCount: Number.isFinite(p.viewCount) ? p.viewCount : 0,
    contentHash: typeof p.contentHash === 'string' && p.contentHash ? p.contentHash : contentHash(p.text ?? ''),
    createdAt: Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
    updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : Date.now(),
  }
}

export interface ImportSummary {
  poems: number
  authors: number
  collections: number
  media: number
}

/** Restore a backup zip. `replace` wipes existing data first. */
export async function importLibrary(
  file: Blob,
  opts: { replace?: boolean } = {},
): Promise<ImportSummary> {
  const bytes = await blobBytes(file)
  const out = await unzipAsync(bytes)
  const manifestBytes = out['library.json']
  if (!manifestBytes) throw new Error('Not a valid Recitation backup (missing library.json)')
  const manifest = JSON.parse(strFromU8(manifestBytes)) as Archive

  // Refuse archives written by a newer release rather than silently importing
  // records this version does not understand.
  if (typeof manifest.version === 'number' && manifest.version > ARCHIVE_VERSION) {
    throw new Error(
      `This backup was created by a newer version of the app (format ${manifest.version}). Please update before restoring.`,
    )
  }

  // An archive is user-supplied data: repair any malformed array fields before
  // they reach the database, where they would break search and list rendering.
  manifest.poems = (manifest.poems ?? []).filter((p) => p && typeof p.id === 'string').map(sanitizePoem)
  manifest.authors = (manifest.authors ?? []).filter((a) => a && typeof a.id === 'string')
  manifest.collections = (manifest.collections ?? []).filter((c) => c && typeof c.id === 'string')
  manifest.media = (manifest.media ?? []).filter((m) => m && typeof m.id === 'string')

  // Skip entries whose bytes are missing from the archive: storing a 0-byte
  // blob would render as a permanently broken image with no way to tell why.
  const missing: string[] = []
  const media: MediaAsset[] = manifest.media.flatMap((meta) => {
    const raw = out[`media/${meta.id}`]
    if (!raw || raw.length === 0) {
      missing.push(meta.id)
      return []
    }
    const thumb = meta.hasThumbnail ? out[`media/${meta.id}.thumb`] : undefined
    const { hasThumbnail: _h, ...rest } = meta
    return [
      {
        ...rest,
        blob: new Blob([toBuffer(raw)], { type: meta.mime }),
        thumbnail: thumb?.length ? new Blob([toBuffer(thumb)], { type: 'image/jpeg' }) : undefined,
      },
    ]
  })

  if (missing.length) {
    console.warn(`Backup is missing ${missing.length} media file(s); their references were dropped.`)
    const dropped = new Set(missing)
    manifest.poems = manifest.poems.map((p) => ({
      ...p,
      imageIds: p.imageIds.filter((x) => !dropped.has(x)),
      pdfIds: p.pdfIds.filter((x) => !dropped.has(x)),
    }))
  }

  await db.transaction('rw', db.poems, db.authors, db.collections, db.media, db.settings, async () => {
    if (opts.replace) {
      await Promise.all([db.poems.clear(), db.authors.clear(), db.collections.clear(), db.media.clear()])
    } else {
      // Merge mode: an incoming poem replaces the local one with the same id,
      // so its old media rows must go too. Otherwise they linger with a
      // matching poemId and reappear in the gallery as duplicate images.
      for (const p of manifest.poems) {
        await db.media.where('poemId').equals(p.id).delete()
      }
    }
    await db.authors.bulkPut(manifest.authors)
    await db.collections.bulkPut(manifest.collections)
    await db.poems.bulkPut(manifest.poems)
    await db.media.bulkPut(media)
    if (manifest.settings) {
      const current = (await db.settings.get('app')) ?? undefined
      await db.settings.put({ ...(current ?? {}), ...manifest.settings, key: 'app' } as AppSettings)
    }
  })

  return {
    poems: manifest.poems.length,
    authors: manifest.authors.length,
    collections: manifest.collections.length,
    media: media.length,
  }
}

/** Lenient shape accepted by bulk import. */
export interface SimplePoemInput {
  title?: string
  titleNative?: string
  text: string
  translation?: string
  transliteration?: string
  language?: Language
  kind?: PoemKind
  author?: string
  authorName?: string
  category?: string
  collections?: string[]
  topics?: string[]
  occasions?: string[]
  tags?: string[]
  notes?: string
}

/** Parse bulk-import source text: JSON array, or "==="-separated blocks. */
/** Longest first line still treated as a title rather than an opening verse. */
const MAX_TITLE_LINE = 60

export function parseSimpleImport(source: string): SimplePoemInput[] {
  const trimmed = source.trim()
  if (!trimmed) return []

  // JSON mode. Only *accept* the parse if it yields usable records — a poem
  // that merely happens to start with a bracket must fall through to text mode
  // rather than failing the whole import with a raw SyntaxError.
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      const usable = arr.filter((x) => x && typeof x.text === 'string' && x.text.trim())
      if (usable.length) return usable
    } catch {
      /* not JSON after all — treat it as plain text */
    }
  }

  // Plain-text mode: poems separated by their own line of 3+ '-' or '='.
  return trimmed
    .split(/\r?\n[ \t]*(?:-{3,}|={3,})[ \t]*(?:\r?\n|$)/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/)
      const first = lines[0]?.trim() ?? ''
      const rest = lines.slice(1).join('\n').trim()

      // Only lift the first line out as a title when it actually reads like
      // one. Doing it unconditionally would delete the opening verse of every
      // untitled poem, which is silent data loss on the main import path.
      if (first && rest && first.length <= MAX_TITLE_LINE) {
        return { title: first, text: rest }
      }
      return { title: excerpt(first || block, MAX_TITLE_LINE), text: block }
    })
}

/** Create poems from parsed bulk input. Returns the number created. */
export async function importSimplePoems(items: SimplePoemInput[]): Promise<number> {
  const now = Date.now()
  const poems: Poem[] = []
  const authorCache = new Map<string, string>()
  const newAuthors: Author[] = []
  const collectionCache = new Map<string, string>()
  const newCollections: Collection[] = []

  /** Resolve a collection name to an id, creating it if it's new. */
  const collectionIdFor = async (name: string): Promise<string> => {
    const key = name.toLowerCase()
    const cached = collectionCache.get(key)
    if (cached) return cached
    const existing = await db.collections.filter((c) => c.name.toLowerCase() === key).first()
    const id = existing?.id ?? newId('col')
    collectionCache.set(key, id)
    if (!existing) newCollections.push({ id, name, createdAt: now, updatedAt: now })
    return id
  }

  for (const [index, item] of items.entries()) {
    if (!item.text?.trim()) continue
    const authorName = (item.author || item.authorName)?.trim()
    let authorId: string | undefined
    if (authorName) {
      const key = authorName.toLowerCase()
      authorId = authorCache.get(key)
      if (!authorId) {
        const existing = await db.authors.filter((a) => a.name.toLowerCase() === key).first()
        authorId = existing?.id ?? newId('auth')
        authorCache.set(key, authorId)
        if (!existing) newAuthors.push({ id: authorId, name: authorName, createdAt: now, updatedAt: now })
      }
    }

    const collectionIds: string[] = []
    for (const name of asStringArray(item.collections)) {
      collectionIds.push(await collectionIdFor(name))
    }

    poems.push({
      id: newId('poem'),
      title: item.title?.trim() || item.text.trim().split('\n')[0].slice(0, 60),
      titleNative: item.titleNative,
      text: item.text.trim(),
      translation: item.translation,
      transliteration: item.transliteration,
      language: item.language ?? detectLanguage(item.text),
      kind: item.kind ?? 'noha',
      authorId,
      authorName,
      collectionIds,
      category: item.category,
      // Never trust the shape of imported fields — see `asStringArray`.
      topics: asStringArray(item.topics),
      occasions: asStringArray(item.occasions),
      tags: asStringArray(item.tags),
      imageIds: [],
      pdfIds: [],
      notes: item.notes,
      favourite: false,
      contentHash: contentHash(item.text),
      viewCount: 0,
      // Stagger by source order: identical timestamps would make "recently
      // added" ordering arbitrary for a bulk import.
      createdAt: now + index,
      updatedAt: now + index,
    })
  }

  await db.transaction('rw', db.poems, db.authors, db.collections, async () => {
    if (newAuthors.length) await db.authors.bulkPut(newAuthors)
    if (newCollections.length) await db.collections.bulkPut(newCollections)
    if (poems.length) await db.poems.bulkPut(poems)
  })
  return poems.length
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
