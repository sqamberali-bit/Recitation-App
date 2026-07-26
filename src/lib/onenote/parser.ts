export interface ParsedPage {
  text: string
  translation?: string
  imageUrls: string[]
}

export function parseOneNotePage(html: string): ParsedPage {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body
  if (!body) return { text: '', imageUrls: [] }

  const imageUrls: string[] = []
  for (const img of body.querySelectorAll('img')) {
    const src = img.getAttribute('data-fullres-src') || img.getAttribute('src')
    if (src?.startsWith('https://')) imageUrls.push(src)
  }

  const outlines = Array.from(
    body.querySelectorAll<HTMLElement>('[style*="position:absolute"]'),
  )

  const roots =
    outlines.length > 0
      ? outlines.sort(
          (a, b) => (parseInt(a.style.top) || 0) - (parseInt(b.style.top) || 0),
        )
      : [body]

  const segments: string[] = []
  let hrIndex = -1

  for (let i = 0; i < roots.length; i++) {
    if (roots[i].querySelector('hr') && hrIndex < 0) hrIndex = segments.length
    const t = extractBlock(roots[i])
    if (t) segments.push(t)
  }

  if (!segments.length) return { text: '', imageUrls }

  if (hrIndex >= 0 && hrIndex < segments.length - 1) {
    const main = clean(segments.slice(0, hrIndex + 1).join('\n\n'))
    const rest = clean(segments.slice(hrIndex + 1).join('\n\n'))
    if (main && rest && scriptsDiffer(main, rest)) {
      return { text: main, translation: rest, imageUrls }
    }
  }

  return { text: clean(segments.join('\n\n')), imageUrls }
}

function extractBlock(root: Element): string {
  const parts: string[] = []
  walk(root, parts)
  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'tr', 'table', 'blockquote', 'pre', 'hr',
])

function walk(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node.textContent ?? '')
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const tag = (node as Element).tagName.toLowerCase()

  if (tag === 'img' || tag === 'script' || tag === 'style') return

  const isBlock = BLOCK_TAGS.has(tag)
  if (tag === 'br') {
    out.push('\n')
    return
  }

  for (const child of node.childNodes) walk(child, out)
  if (isBlock) out.push('\n')
}

function clean(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/

function scriptsDiffer(a: string, b: string): boolean {
  return ARABIC_RE.test(a) !== ARABIC_RE.test(b)
}
