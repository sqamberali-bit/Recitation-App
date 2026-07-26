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
import { contentHash, detectLanguage } from './text'
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

  // Never export the raw API key.
  const settings = settingsRow ? { ...settingsRow } : undefined
  if (settings) delete (settings as Partial<AppSettings>).aiCorrectionKey

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

  const media: MediaAsset[] = manifest.media.map((meta) => {
    const raw = out[`media/${meta.id}`]
    const thumb = meta.hasThumbnail ? out[`media/${meta.id}.thumb`] : undefined
    const { hasThumbnail: _h, ...rest } = meta
    return {
      ...rest,
      blob: new Blob([toBuffer(raw ?? new Uint8Array())], { type: meta.mime }),
      thumbnail: thumb ? new Blob([toBuffer(thumb)], { type: 'image/jpeg' }) : undefined,
    }
  })

  await db.transaction('rw', db.poems, db.authors, db.collections, db.media, db.settings, async () => {
    if (opts.replace) {
      await Promise.all([db.poems.clear(), db.authors.clear(), db.collections.clear(), db.media.clear()])
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
export function parseSimpleImport(source: string): SimplePoemInput[] {
  const trimmed = source.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr.filter((x) => x && typeof x.text === 'string')
  }
  // Plain-text mode: poems separated by a line of 3+ '=' or '-'. First line is
  // treated as the title.
  return trimmed
    .split(/\n\s*[=-]{3,}\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n')
      const title = lines[0]?.trim()
      const body = lines.slice(1).join('\n').trim() || block
      return { title, text: body }
    })
}

/** Create poems from parsed bulk input. Returns the number created. */
export async function importSimplePoems(items: SimplePoemInput[]): Promise<number> {
  const now = Date.now()
  const poems: Poem[] = []
  const authorCache = new Map<string, string>()
  const newAuthors: Author[] = []

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
      collectionIds: [],
      category: item.category,
      topics: item.topics ?? [],
      occasions: item.occasions ?? [],
      tags: item.tags ?? [],
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

  await db.transaction('rw', db.poems, db.authors, async () => {
    if (newAuthors.length) await db.authors.bulkPut(newAuthors)
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
