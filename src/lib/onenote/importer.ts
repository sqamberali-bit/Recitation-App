import { db } from '@/db/database'
import { savePoem, saveCollection } from '@/db/repository'
import { processImageFile } from '@/lib/media'
import { detectLanguage } from '@/lib/text'
import {
  listNotebooks,
  listSections,
  listSectionGroups,
  listSectionsInGroup,
  listPages,
  getPageContent,
  getResource,
  type OneNotePage,
} from './client'
import { parseOneNotePage } from './parser'
import type { MediaAsset } from '@/types'

export interface ImportOptions {
  notebookIds: string[]
  onProgress?: (p: ImportProgress) => void
  signal?: AbortSignal
}

export interface ImportProgress {
  phase: 'scanning' | 'importing' | 'done'
  notebook?: string
  section?: string
  page?: string
  totalPages: number
  processed: number
  imported: number
  updated: number
  skipped: number
  errors: number
  images: number
}

export interface ImportSummary {
  imported: number
  updated: number
  skipped: number
  errors: number
  images: number
  imageOnly: number
}

interface SectionInfo {
  sectionId: string
  sectionName: string
  notebookName: string
  groupPath: string
}

export async function runImport(opts: ImportOptions): Promise<ImportSummary> {
  const { notebookIds, onProgress, signal } = opts

  const p: ImportProgress = {
    phase: 'scanning',
    totalPages: 0,
    processed: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    images: 0,
  }
  const emit = () => onProgress?.({ ...p })

  const notebooks = await listNotebooks()
  const chosen = notebooks.filter((n) => notebookIds.includes(n.id))

  const work: { info: SectionInfo; pages: OneNotePage[] }[] = []

  for (const nb of chosen) {
    if (signal?.aborted) break
    p.notebook = nb.displayName
    emit()

    const [sections, groups] = await Promise.all([
      listSections(nb.id),
      listSectionGroups(nb.id),
    ])

    for (const s of sections) {
      if (signal?.aborted) break
      const pages = await listPages(s.id)
      work.push({
        info: { sectionId: s.id, sectionName: s.displayName, notebookName: nb.displayName, groupPath: '' },
        pages,
      })
      p.totalPages += pages.length
      emit()
    }

    for (const g of groups) {
      if (signal?.aborted) break
      const gSections = await listSectionsInGroup(g.id)
      for (const s of gSections) {
        if (signal?.aborted) break
        const pages = await listPages(s.id)
        work.push({
          info: { sectionId: s.id, sectionName: s.displayName, notebookName: nb.displayName, groupPath: g.displayName },
          pages,
        })
        p.totalPages += pages.length
        emit()
      }
    }
  }

  p.phase = 'importing'
  emit()

  const summary: ImportSummary = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    images: 0,
    imageOnly: 0,
  }

  const collectionCache = new Map<string, string>()

  for (const { info, pages } of work) {
    p.notebook = info.notebookName
    p.section = info.sectionName
    emit()

    for (const page of pages) {
      if (signal?.aborted) break
      p.page = page.title
      emit()

      try {
        const result = await importPage(page, info, collectionCache)
        if (result.action === 'imported') {
          summary.imported++
          p.imported++
        } else if (result.action === 'updated') {
          summary.updated++
          p.updated++
        } else {
          summary.skipped++
          p.skipped++
        }
        summary.images += result.images
        p.images += result.images
        if (result.imageOnly) summary.imageOnly++
      } catch (err) {
        console.error(`Import failed: "${page.title}"`, err)
        summary.errors++
        p.errors++
      }

      p.processed++
      emit()
    }
  }

  p.phase = 'done'
  emit()
  return summary
}

interface PageResult {
  action: 'imported' | 'updated' | 'skipped'
  images: number
  imageOnly: boolean
}

async function importPage(
  page: OneNotePage,
  info: SectionInfo,
  collectionCache: Map<string, string>,
): Promise<PageResult> {
  const lastMod = new Date(page.lastModifiedDateTime).getTime()

  const existing = await db.poems
    .where('onenoteSourceId')
    .equals(page.id)
    .first()

  if (existing) {
    if (existing.onenoteLastModified && existing.onenoteLastModified >= lastMod) {
      return { action: 'skipped', images: 0, imageOnly: false }
    }
    // User edited locally — don't overwrite.
    if (existing.updatedAt > existing.createdAt + 1000) {
      return { action: 'skipped', images: 0, imageOnly: false }
    }
  }

  const html = await getPageContent(page.id)
  const parsed = parseOneNotePage(html)

  const media: MediaAsset[] = []
  for (let i = 0; i < parsed.imageUrls.length; i++) {
    try {
      const blob = await getResource(parsed.imageUrls[i])
      const asset = await processImageFile(blob, existing?.id ?? 'pending', i)
      media.push(asset)
    } catch (err) {
      console.warn(`Image download failed on "${page.title}" image ${i}:`, err)
    }
  }

  const category = info.groupPath
    ? `${info.groupPath} / ${info.sectionName}`
    : info.sectionName

  const colId = await ensureCol(info.notebookName, collectionCache)

  const removedMediaIds =
    existing ? [...(existing.imageIds ?? []), ...(existing.pdfIds ?? [])] : []

  await savePoem({
    draft: {
      id: existing?.id,
      title: page.title || '',
      titleNative: undefined,
      text: parsed.text,
      translation: parsed.translation,
      transliteration: undefined,
      language: detectLanguage(parsed.text || ''),
      kind: 'noha',
      authorName: undefined,
      collectionIds: colId ? [colId] : [],
      category,
      topics: [],
      occasions: [],
      tags: ['onenote-import'],
      imageIds: media.filter((m) => m.type === 'image').map((m) => m.id),
      pdfIds: [],
      notes: undefined,
      favourite: existing?.favourite ?? false,
      onenoteSourceId: page.id,
      onenoteLastModified: lastMod,
      sourceType: 'onenote',
    },
    newMedia: media,
    removedMediaIds,
  })

  const imageOnly = !parsed.text.trim() && media.length > 0
  return {
    action: existing ? 'updated' : 'imported',
    images: media.length,
    imageOnly,
  }
}

async function ensureCol(
  name: string,
  cache: Map<string, string>,
): Promise<string | undefined> {
  if (!name) return undefined
  const key = name.toLowerCase()
  const cached = cache.get(key)
  if (cached) return cached

  const existing = await db.collections
    .filter((c) => c.name.toLowerCase() === key)
    .first()
  if (existing) {
    cache.set(key, existing.id)
    return existing.id
  }

  const id = await saveCollection({ name })
  cache.set(key, id)
  return id
}
