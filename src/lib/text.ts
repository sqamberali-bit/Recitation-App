/**
 * Text utilities for mixed Urdu / Arabic / English content:
 * script detection, normalisation, hashing, and excerpts.
 */
import type { Language } from '@/types'

// Arabic / Urdu script blocks: Arabic (0600–06FF), Supplement (0750–077F),
// Extended-A (08A0–08FF), Presentation Forms-A (FB50–FDFF) & B (FE70–FEFF).
const ARABIC_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/
const ARABIC_GLOBAL =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/g
const LATIN_GLOBAL = /[A-Za-z]/g

// Harakat (short vowels), superscript alef, and tatweel — removed for matching.
const DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g

// Zero-width joiners/non-joiners, bidi controls, and the BOM.
const ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

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
    // Teh marbuta / heh goal / heh-with-yeh variants -> heh
    .replace(/[ةہۀۂۃ]/g, 'ه')
    // Zero-width joiners/non-joiners, bidi marks, and BOM.
    .replace(ZERO_WIDTH_RE, '')
    // Punctuation (both scripts) -> space
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Deterministic 64-bit hash rendered as hex. Sync and dependency-free.
 *
 * Both lanes consume the FULL char code with different seeds and multipliers.
 * (An earlier version fed the low byte to one lane and the high byte to the
 * other; for single-script text the high byte is near-constant, so that lane
 * carried almost no entropy and the effective hash was only 32 bits — enough
 * for false duplicate matches in a library of a few thousand poems.)
 */
export function hashString(str: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0xc9dc5118
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x85ebca6b)
    // Cross-feed so the lanes don't evolve independently.
    h2 ^= h1 >>> 13
  }
  h1 ^= h2 >>> 16
  h2 ^= h1 >>> 16
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
    // Text pasted from OneNote/Word is riddled with zero-width joiners and bidi
    // marks. Left in, they make otherwise identical Urdu words unsearchable.
    .replace(ZERO_WIDTH_RE, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/[ىي]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةہۀۂۃ]/g, 'ه')
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

/**
 * Coerce untrusted input into a clean string array.
 *
 * Imported JSON and restored backups are user-supplied: a field typed as
 * `string[]` may arrive as a bare string, null, or nested junk. Persisting a
 * non-array into a multi-entry index is accepted by IndexedDB but breaks every
 * consumer that calls array methods on it, so everything entering the database
 * is normalised through here.
 */
export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
  }
  if (typeof value === 'string') return splitList(value)
  return []
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
