# Recitation — Poetry & Noha Library

An offline-first Progressive Web App for storing, organising, and reciting Urdu, Arabic, and
English poems and nohas. Built for real use during Majalis: open it, find the poem in a second,
and recite from a large, readable Nastaliq page that will not dim, lose your place, or need a
network connection.

<p align="center">
  <em>Install it on Android and iPhone from the browser — no app store, one codebase.</em>
</p>

---

## Why a PWA (and not a native app)

A PWA delivers essentially everything this library needs, from a single codebase:

| Requirement | PWA | Native (iOS + Android) |
|---|---|---|
| Install to home screen, full-screen, own icon | ✅ | ✅ |
| Works completely offline | ✅ service worker + IndexedDB | ✅ |
| Camera & gallery upload | ✅ `<input capture>` | ✅ |
| Thousands of poems + images stored locally | ✅ IndexedDB (GB-scale) | ✅ |
| Keep screen awake while reciting | ✅ Wake Lock API | ✅ |
| Instant updates, no store review | ✅ | ❌ days per release |
| One codebase for phone, tablet, desktop | ✅ | ❌ two codebases + a web app |
| Cost to build and maintain | Low | 3× |

The only meaningful native-only gaps (background sync, deep OS integration) are not needed here.
If you later want store presence, this exact codebase wraps into an Android APK or an iOS app via
[Capacitor](https://capacitorjs.com/) without a rewrite — that path is deliberately preserved.

---

## Features

**Library & organisation**
- Thousands of poems, fully offline, with Urdu/Arabic/English Unicode throughout
- Categories, collections, authors, languages, topics, occasions, and free-form tags
- Fast full-text search across titles *and* complete poem bodies, Urdu-aware
- Filter by author, language, type, category, collection, or tag; sort four ways
- Favourites and a recently-viewed list
- Duplicate detection across the whole library

**Reading & recitation**
- Large Nastaliq or Naskh Urdu fonts, bundled locally (no network needed)
- Adjustable font size and line spacing, remembered between sessions
- Full-screen immersive mode that hides all chrome (tap to reveal)
- Screen stays awake while reciting
- Optional auto-scroll with adjustable speed
- Automatic reading-position bookmark with a "resume where you left off" prompt

**Content management**
- Add, edit, and delete from phone, tablet, or desktop
- Capture straight from the phone camera, or pick from the gallery
- Multiple images per poem, plus optional PDF attachments
- Paste Urdu or English text with automatic language detection
- Bulk import: paste many poems at once, or import a folder of photos as poems
- OCR (Tesseract) to pull text out of scans, with optional AI correction
- Roman transliteration helper

**Data & sync**
- Everything is stored on your device; nothing is uploaded by default
- Full library export/import as a single `.zip` (poems, images, PDFs, metadata)
- Optional cloud backup to an endpoint you control
- Light, dark, and system themes; responsive from small phones to desktop

---

## Technology stack

| Layer | Choice | Why |
|---|---|---|
| UI | **React 18 + TypeScript** | Ubiquitous, typed, easy to hire for and maintain |
| Build | **Vite 5** | Fast builds, tiny output, first-class PWA plugin |
| PWA | **vite-plugin-pwa** (Workbox) | Generates the service worker, precache, and manifest |
| Storage | **IndexedDB via Dexie 4** | Handles GB-scale blobs + indexed queries; the only browser store that fits |
| Reactivity | **dexie-react-hooks** | Live queries — the UI updates itself when data changes |
| Search | **MiniSearch** | In-memory full-text index, fuzzy + prefix, works offline |
| OCR | **Tesseract.js** | Urdu/Arabic/English OCR entirely in the browser |
| Archive | **fflate** | Fast, tiny zip for export/import |
| Routing | **React Router 6** | Standard SPA routing |
| Styling | **Plain CSS with design tokens** | No framework weight; full control over RTL & theming |

No backend is required. The app is a set of static files plus a service worker.

**Bundle size:** ~75 KB gzipped for the app shell; heavy features (OCR, editor, import) are
code-split and loaded only when used.

---

## Getting started

```bash
npm install          # install dependencies
npm run dev          # start the dev server → http://localhost:5173
```

Production:

```bash
npm run build        # type-check + build into dist/
npm run preview      # serve the built app locally
```

Other scripts:

```bash
npm run typecheck    # TypeScript only
npm run lint         # ESLint
npm run gen:icons    # regenerate PWA icons from public/icons/icon.svg
npm run fetch:fonts  # re-vendor the Urdu/Arabic fonts into public/fonts/
npm run test:e2e     # end-to-end browser tests (needs `npm run preview` running)
```

### Deploying

`dist/` is a static bundle — host it anywhere (Netlify, Vercel, Cloudflare Pages, GitHub Pages,
or your own server). Two requirements:

1. **Serve over HTTPS.** Service workers, the camera, and Wake Lock all require a secure context
   (`localhost` is exempt for development).
2. **SPA fallback.** Rewrite unknown paths to `index.html` so deep links like `/poem/abc` work.

Then open the site on your phone and choose **Add to Home Screen** (Android: Chrome's install
prompt; iOS: Share → Add to Home Screen).

---

## Project structure

```
Recitation-App/
├─ index.html                 App shell + boot splash
├─ vite.config.ts             Build, code-splitting, PWA manifest & Workbox config
├─ public/
│  ├─ icons/                  PWA icons (generated from icon.svg)
│  └─ fonts/                  Vendored Noto Nastaliq Urdu + Noto Naskh Arabic (offline)
├─ scripts/
│  ├─ gen-icons.mjs           Icon generation
│  ├─ fetch-fonts.mjs         Font vendoring
│  └─ sample-poems.json       Sample library for demos/tests
├─ tests/
│  └─ e2e.mjs                 End-to-end browser smoke tests
└─ src/
   ├─ main.tsx                Entry point + provider composition
   ├─ App.tsx                 Routes (heavy pages lazy-loaded)
   ├─ types/index.ts          Domain model — the shared contract
   ├─ db/
   │  ├─ database.ts          Dexie schema and indexes
   │  └─ repository.ts        The ONLY data-access API used by the UI
   ├─ lib/
   │  ├─ text.ts              Script detection, Urdu normalisation, hashing
   │  ├─ search.ts            MiniSearch index
   │  ├─ media.ts             Image decode, downscale, thumbnails
   │  ├─ ocr.ts               Tesseract worker management
   │  ├─ ai.ts                Optional AI OCR correction
   │  ├─ transliteration.ts   Urdu → Roman
   │  ├─ exportImport.ts      Zip export/import + bulk import
   │  ├─ backup.ts            Optional cloud snapshot sync
   │  └─ wakeLock.ts          Keep-screen-awake hook
   ├─ store/
   │  ├─ library.tsx          Live poems, search index, facets
   │  └─ settings.tsx         Settings + theme application
   ├─ components/             Reusable UI (cards, sheets, toasts, icons, …)
   ├─ pages/                  One file per screen
   └─ styles/                 Design tokens, layout, reader styles
```

**Architecture in one line:** the UI talks only to `store/` and `db/repository.ts`; persistence
details never leak into components, so adding a feature (or swapping the storage layer) touches
one place.

---

## Data model

```
Poem ─┬─ authorId ──────────→ Author
      ├─ collectionIds[] ───→ Collection   (many-to-many, multi-entry indexed)
      ├─ imageIds[] ────────→ MediaAsset   (type: 'image')
      ├─ pdfIds[]   ────────→ MediaAsset   (type: 'pdf')
      └─ tags[] / topics[] / occasions[]   (multi-entry indexed)
```

Poems carry their text, optional translation and transliteration, classification, a
`contentHash` for duplicate detection, a reading `bookmark`, and view statistics. Media blobs
live in a separate table so poem rows stay small and fast to scan — the whole library's text can
be indexed for search without ever touching image data.

Indexes are chosen so every list view is a direct index lookup rather than a scan:
`language`, `kind`, `authorId`, `category`, `createdAt`, `updatedAt`, `lastViewedAt`,
`contentHash`, plus multi-entry indexes on `collectionIds`, `tags`, `topics`, and `occasions`.

> Note: `favourite` is deliberately **not** indexed — IndexedDB cannot use booleans as keys.
> Favourites are filtered in memory, which is instant at this scale.

Schema changes are handled by Dexie versioning in `src/db/database.ts`; add a new
`.version(n).stores({...})` block with an optional `.upgrade()` and existing libraries migrate
automatically.

---

## Importing your OneNote library

OneNote has no clean bulk export, so the app supports three practical paths (**Settings →
Import poems**):

1. **Paste text** — copy pages from OneNote and paste them all at once, separating poems with a
   line of `---`. The first line of each block becomes the title. A JSON array is also accepted
   for scripted migrations.
2. **Photos & scans** — export or screenshot your OneNote pages, then select them all at once.
   Each image becomes a poem with the picture attached and the filename as the title. You can
   then run OCR on each to extract the text.
3. **Restore backup** — import a `.zip` previously exported from this app (used for moving
   between devices).

A practical migration: bulk-import the images first so nothing is lost, then work through them
with OCR + AI correction at your own pace. The library is usable immediately either way, because
poems with images but no text still display and search by title and tags.

---

## Optional integrations

Both are **off by default** — the app is fully functional with no network at all.

### AI OCR correction
Urdu OCR is imperfect. Configure either in **Settings → AI OCR correction**:
- **A correction endpoint** (recommended): a small server you control that forwards to the Claude
  API. Your API key never touches the device. See [`docs/AI.md`](docs/AI.md).
- **A Claude API key** directly: convenient on a personal device, but the key is stored in this
  browser. Avoid on shared devices.

### Cloud backup
Set a **sync endpoint** in Settings — any URL that accepts `PUT` and `GET` of a single file (an
S3 pre-signed URL, a personal WebDAV, a small serverless function). "Back up now" uploads a full
snapshot; "Restore" pulls it onto another device. See [`docs/SYNC.md`](docs/SYNC.md).

---

## Testing

```bash
npm run build
npm run preview          # terminal 1
npm run test:e2e         # terminal 2
```

The suite drives a real Chromium browser through 29 checks covering import, Urdu and English
search, favourites, reader scrolling/auto-scroll/bookmarks/fonts, the editor, duplicate
detection, theming and persistence, export, browse drill-down, service-worker registration,
**true offline operation**, the responsive desktop layout, and manifest installability.

---

## Browser support

Chrome/Edge 90+, Safari 15.4+ (iOS 15.4+), Firefox 90+.

Graceful degradation where APIs are missing: Wake Lock is best-effort (unsupported on older iOS
Safari), the Fullscreen API falls back to a CSS immersive mode on iOS, and images that cannot be
decoded (e.g. HEIC on some browsers) are stored as-is rather than rejected.

---

## Roadmap

Deliberately easy to add on top of the current architecture:

- Record-level sync with conflict resolution (the `backup.ts` interface is the seam)
- Playlists / running order for a specific Majlis
- Audio recordings attached to poems
- Reciter-facing tempo marks and verse highlighting
- Share a poem as an image or PDF
- Capacitor wrapper for app-store distribution

## License

Private project. All poem content belongs to its respective authors.
