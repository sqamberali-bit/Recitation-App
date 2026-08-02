import { processImageFile } from './media'
import { detectLanguage } from './text'
import { savePoem, saveCollection } from '@/db/repository'
import { db } from '@/db/database'
import type { MediaAsset } from '@/types'

export interface MhtPage {
  title: string
  text: string
  section: string
  images: Blob[]
}

export interface MhtImportProgress {
  phase: 'parsing' | 'importing' | 'done'
  total: number
  current: number
  title?: string
}

export async function parseMhtFile(file: File): Promise<MhtPage[]> {
  const raw = await file.text()
  const { html, imageMap } = parseMime(raw)
  if (!html) throw new Error('No HTML content found in MHT file')
  return extractPages(html, imageMap)
}

function parseMime(raw: string): {
  html: string
  imageMap: Map<string, Blob>
} {
  const imageMap = new Map<string, Blob>()

  const bm = raw.match(/boundary="?([^\s";\r\n]+)"?/i)
  if (!bm) return { html: raw, imageMap }

  const boundary = bm[1]
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = raw.split(new RegExp('--' + escaped))
  let html = ''

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed || trimmed === '--') continue

    const sep = trimmed.search(/\r?\n\r?\n/)
    if (sep < 0) continue

    const hdr = trimmed.substring(0, sep)
    const body = trimmed.substring(sep).replace(/^\r?\n\r?\n/, '')

    const ct = hdrVal(hdr, 'Content-Type') || ''
    const cte = (hdrVal(hdr, 'Content-Transfer-Encoding') || '').trim().toLowerCase()
    const cl = hdrVal(hdr, 'Content-Location') || ''

    if (ct.toLowerCase().includes('text/html')) {
      if (cte === 'quoted-printable') html = decodeQP(body)
      else if (cte === 'base64') html = new TextDecoder().decode(b64Bytes(body))
      else html = body
    } else if (ct.toLowerCase().startsWith('image/')) {
      try {
        const mime = ct.toLowerCase().split(';')[0].trim()
        const bytes = b64Bytes(body)
        const buf = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(buf).set(bytes)
        const blob = new Blob([buf], { type: mime })
        if (cl) {
          imageMap.set(cl, blob)
          const short = cl.split('/').pop() || ''
          if (short && short !== cl) imageMap.set(short, blob)
          imageMap.set(decodeURIComponent(cl), blob)
        }
      } catch { /* skip */ }
    }
  }

  return { html, imageMap }
}

function hdrVal(block: string, name: string): string | undefined {
  const re = new RegExp('^' + name + ':\\s*(.+)', 'im')
  const m = block.match(re)
  return m ? m[1].trim() : undefined
}

function decodeQP(text: string): string {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function b64Bytes(text: string): Uint8Array {
  const clean = text.replace(/[\r\n\s]/g, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function extractPages(
  html: string,
  imageMap: Map<string, Blob>,
): MhtPage[] {
  const chunks = html.split(/<br[^>]*(?:page-break-before|page-break-after)\s*:\s*always[^>]*>/i)

  if (chunks.length <= 1) {
    const altChunks = html.split(/<div[^>]*(?:page-break-before|page-break-after)\s*:\s*always[^>]*>/i)
    if (altChunks.length > 1) return processChunks(altChunks, imageMap)

    const hrChunks = html.split(/<hr[^>]*>/i)
    if (hrChunks.length > 1) return processChunks(hrChunks, imageMap)
  }

  return processChunks(chunks, imageMap)
}

function processChunks(
  chunks: string[],
  imageMap: Map<string, Blob>,
): MhtPage[] {
  const pages: MhtPage[] = []
  let lastSection = ''

  for (const chunk of chunks) {
    if (!chunk.trim()) continue
    const doc = new DOMParser().parseFromString(
      `<html><body>${chunk}</body></html>`,
      'text/html',
    )
    const body = doc.body
    if (!body) continue

    const images: Blob[] = []
    for (const img of body.querySelectorAll('img')) {
      const src = img.getAttribute('data-fullres-src')
        || img.getAttribute('src')
        || ''
      const blob = resolveImage(src, imageMap)
      if (blob) images.push(blob)
    }

    const lines: string[] = []
    walkText(body, lines)
    const fullText = lines
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (!fullText && !images.length) continue

    const textLines = fullText.split('\n').filter((l) => l.trim())
    const title = (textLines[0] || 'Untitled').substring(0, 120)
    const text = textLines.length > 1 ? textLines.slice(1).join('\n').trim() : fullText

    const heading = body.querySelector('h1, h2, h3')
    if (heading?.textContent?.trim()) {
      const ht = heading.textContent.trim()
      if (ht.length < 60 && ht !== title) lastSection = ht
    }

    pages.push({ title, text, section: lastSection, images })
  }

  return pages
}

function resolveImage(src: string, imageMap: Map<string, Blob>): Blob | undefined {
  if (!src) return undefined
  return imageMap.get(src)
    || imageMap.get(decodeURIComponent(src))
    || imageMap.get(src.split('/').pop() || '')
    || imageMap.get(decodeURIComponent(src.split('/').pop() || ''))
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'tr', 'table', 'blockquote', 'pre', 'hr',
])

function walkText(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node.textContent ?? '')
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const tag = (node as Element).tagName.toLowerCase()
  if (tag === 'img' || tag === 'script' || tag === 'style') return
  if (tag === 'br') { out.push('\n'); return }
  for (const child of node.childNodes) walkText(child, out)
  if (BLOCK_TAGS.has(tag)) out.push('\n')
}

export async function importMhtPages(
  pages: MhtPage[],
  onProgress?: (p: MhtImportProgress) => void,
): Promise<{ poems: number; images: number }> {
  let poemCount = 0
  let imageCount = 0
  const collectionCache = new Map<string, string>()

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    onProgress?.({ phase: 'importing', total: pages.length, current: i + 1, title: page.title })

    const media: MediaAsset[] = []
    for (let j = 0; j < page.images.length; j++) {
      try {
        const asset = await processImageFile(page.images[j], 'pending', j)
        media.push(asset)
        imageCount++
      } catch { /* skip bad image */ }
    }

    let colId: string | undefined
    if (page.section) {
      const key = page.section.toLowerCase()
      colId = collectionCache.get(key)
      if (!colId) {
        const existing = await db.collections.filter((c) => c.name.toLowerCase() === key).first()
        if (existing) {
          colId = existing.id
        } else {
          colId = await saveCollection({ name: page.section })
        }
        collectionCache.set(key, colId)
      }
    }

    await savePoem({
      draft: {
        title: page.title,
        text: page.text,
        language: detectLanguage(page.text || ''),
        kind: 'noha',
        collectionIds: colId ? [colId] : [],
        category: page.section || undefined,
        topics: [],
        occasions: [],
        tags: ['mht-import'],
        imageIds: media.filter((m) => m.type === 'image').map((m) => m.id),
        pdfIds: [],
        favourite: false,
      },
      newMedia: media,
    })
    poemCount++
  }

  onProgress?.({ phase: 'done', total: pages.length, current: pages.length })
  return { poems: poemCount, images: imageCount }
}
