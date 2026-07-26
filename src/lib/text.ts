/**
 * Text utilities for mixed Urdu / Arabic / English content:
 * script detection, normalisation, hashing, and excerpts.
 */
import type { Language } from '@/types'

// Arabic / Urdu script blocks: Arabic (0600–06FF), Supplement (0750–077F),
// Extended-A (08A0–08FF), Presentation Forms-A (FB50–FDFF) & B (FE70–FEFF).
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const ARABIC_GLOBAL = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g
const LATIN_GLOBAL = /[A-Za-z]/g

// Harakat (short vowels), superscript alef, and tatweel — removed for matching.
const DIACRITICS_RE = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g

/** True if the text contains any Arabic-script characters. */
export function hasArabicScript(text: string): boolean {
  return ARABIC_RE.test(text)
}

/** Choose text direction for a string. */
export function directionOf(text: string): 'rtl' | 'ltr' {
  return hasArabicScript(text) ? 'rtl' : 'ltr'
}

/** Heuristic language detection from a body of text. */
export function detectLanguage(text: string): Language {
  const arabic = (text.match(ARABIC_GLOBAL) || []).length
  const latin = (text.match(LATIN_GLOBAL) || []).length
  if (arabic === 0 && latin === 0) return 'ur'
  if (arabic === 0) return 'en'
  if (latin === 0) return 'ur'
  const ratio = arabic / (arabic + latin)
  if (ratio > 0.85) return 'ur'
  if (ratio < 0.15) return 'en'
  return 'mixed'
}

/**
 * Normalise Arabic/Urdu text so visually/semantically equal strings compare
 * equal: unify alef/yeh/kaf/heh variants, strip diacritics & tatweel, collapse
 * whitespace, and lowercase Latin. Used for duplicate detection and hashing.
 */
export function normalizeForHash(text: string): string {
  return text
    .normalize('NFC')
    .replace(DIACRITICS_RE, '')
    // Alef variants -> bare alef
    .replace(/[آأإٱ]/g, 'ا')
    // Arabic yeh / alef-maksura -> Urdu yeh
    .replace(/[ىي]/g, 'ی')
    // Arabic kaf -> Urdu keheh
    .replace(/ك/g, 'ک')
    // Teh marbuta / heh goal variants -> heh
    .replace(/[ةہۃ]/g, 'ه')
    // Remove zero-width joiners/marks
    // Zero-width joiners/non-joiners, bidi marks, and BOM.
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    // Punctuation (both scripts) -> space
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Deterministic 64-bit FNV-1a hash rendered as hex. Sync and dependency-free. */
export function hashString(str: string): string {
  // Two 32-bit lanes to approximate 64-bit without BigInt overhead.
  let h1 = 0x811c9dc5
  let h2 = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 ^= c & 0xff
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= (c >> 8) & 0xff
    h2 = Math.imul(h2, 0x01000193)
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return hex(h1) + hex(h2)
}

/** Content hash of a poem's body used for duplicate detection. */
export function contentHash(text: string): string {
  return hashString(normalizeForHash(text))
}

/**
 * Normalise a single search token so queries match regardless of short vowels
 * or alef/yeh/kaf/heh variants (mirrors `normalizeForHash` per-token).
 */
export function normalizeToken(term: string): string {
  return term
    .normalize('NFC')
    .replace(DIACRITICS_RE, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/[ىي]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةہۃ]/g, 'ه')
    .toLowerCase()
}

/** Split text into search tokens across scripts (whitespace + punctuation). */
export function tokenize(text: string): string[] {
  return text.split(/[\s\p{P}\p{S}]+/u).filter(Boolean)
}

/** First `n` characters of the first non-empty line, for list previews. */
export function excerpt(text: string, n = 120): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  const base = (firstLine || text).trim()
  return base.length > n ? base.slice(0, n).trimEnd() + '…' : base
}

/** Word count that works for both space-separated scripts. */
export function countWords(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

/** Tokenise free-form tag/topic input ("a, b؛ c" -> ["a","b","c"]). */
export function splitList(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,،؛\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let val = bytes / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`
}
