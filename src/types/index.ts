/**
 * Domain model for the Recitation library.
 *
 * All records are stored locally in IndexedDB (via Dexie). IDs are opaque
 * strings (see `lib/id.ts`). Timestamps are epoch milliseconds so they sort
 * numerically and serialise cleanly for export.
 */

/** Language of a poem's primary text. `mixed` = both scripts present. */
export type Language = 'ur' | 'en' | 'ar' | 'mixed'

/** The kind of composition — drives default styling and filtering. */
export type PoemKind =
  | 'poem'
  | 'noha'
  | 'salam'
  | 'marsiya'
  | 'qaseeda'
  | 'manqabat'
  | 'nasheed'
  | 'dua'
  | 'other'

export const POEM_KINDS: PoemKind[] = [
  'noha',
  'salam',
  'marsiya',
  'qaseeda',
  'manqabat',
  'nasheed',
  'dua',
  'poem',
  'other',
]

export const LANGUAGES: { value: Language; label: string; rtl: boolean }[] = [
  { value: 'ur', label: 'Urdu', rtl: true },
  { value: 'ar', label: 'Arabic', rtl: true },
  { value: 'en', label: 'English', rtl: false },
  { value: 'mixed', label: 'Mixed', rtl: true },
]

/** A media asset (image or PDF) attached to a poem. Binary lives in `blob`. */
export interface MediaAsset {
  id: string
  poemId: string
  type: 'image' | 'pdf'
  mime: string
  name?: string
  blob: Blob
  /** Small JPEG/PNG preview for images, generated on upload. */
  thumbnail?: Blob
  width?: number
  height?: number
  /** Bytes — cached so the library size can be shown without reading blobs. */
  size: number
  /** Ordering within a poem's gallery. */
  order: number
  createdAt: number
}

export interface Author {
  id: string
  name: string
  nameUrdu?: string
  bio?: string
  createdAt: number
  updatedAt: number
}

export interface Collection {
  id: string
  name: string
  nameUrdu?: string
  description?: string
  createdAt: number
  updatedAt: number
}

export interface Poem {
  id: string
  title: string
  /** Optional Urdu/Arabic title shown in the native script. */
  titleNative?: string
  /** Primary body text (may be Urdu, Arabic, or English). */
  text: string
  /** Optional secondary text — e.g. English translation. */
  translation?: string
  /** Optional Roman transliteration. */
  transliteration?: string
  language: Language
  kind: PoemKind

  authorId?: string
  /** Denormalised author name for fast search & display without a join. */
  authorName?: string

  collectionIds: string[]
  category?: string
  topics: string[]
  occasions: string[]
  tags: string[]

  imageIds: string[]
  pdfIds: string[]

  notes?: string

  favourite: boolean
  favouritedAt?: number

  /** Normalised hash of the body used for duplicate detection. */
  contentHash: string

  /** Reading position bookmark (0..1 fraction of scroll height). */
  bookmark?: number

  viewCount: number
  lastViewedAt?: number

  /** OneNote page ID — links back to the source page in Graph API. */
  onenoteSourceId?: string
  /** OneNote page lastModifiedDateTime (epoch ms), for change detection. */
  onenoteLastModified?: number
  /** Where this poem came from: 'onenote', 'manual', 'import'. */
  sourceType?: string

  createdAt: number
  updatedAt: number
}

/** Persisted app settings (single row keyed `app`). */
export interface AppSettings {
  key: 'app'
  theme: 'light' | 'dark' | 'system'
  /** Reader font size in px. */
  readerFontSize: number
  /** Reader line height multiplier. */
  readerLineHeight: number
  /** Preferred Urdu font family key. */
  urduFont: 'nastaliq' | 'naskh' | 'system'
  autoScrollSpeed: number
  keepAwake: boolean
  /** Optional runtime overrides for integrations (see docs). */
  syncEndpoint?: string
  /** Credential for the sync endpoint only — never the AI key. */
  syncKey?: string
  aiCorrectionEndpoint?: string
  aiCorrectionKey?: string
  lastBackupAt?: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  key: 'app',
  theme: 'system',
  readerFontSize: 30,
  readerLineHeight: 2.1,
  urduFont: 'nastaliq',
  autoScrollSpeed: 40,
  keepAwake: true,
}

/** A poem plus its resolved media — used by detail/reader/editor views. */
export interface PoemWithMedia {
  poem: Poem
  images: MediaAsset[]
  pdfs: MediaAsset[]
}

/** Shape of the data used to create/update a poem from the editor. */
export type PoemDraft = Omit<
  Poem,
  'id' | 'contentHash' | 'viewCount' | 'createdAt' | 'updatedAt' | 'favouritedAt' | 'lastViewedAt' | 'bookmark'
> & {
  id?: string
}

/** Query parameters for browsing/searching the library. */
export interface LibraryQuery {
  text?: string
  language?: Language | null
  kind?: PoemKind | null
  authorId?: string | null
  collectionId?: string | null
  category?: string | null
  tag?: string | null
  favouritesOnly?: boolean
  /** `relevance` only applies while a search term is present. */
  sort?: 'relevance' | 'recent' | 'title' | 'created' | 'views'
}
