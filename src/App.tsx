import { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { LibraryPage } from '@/pages/LibraryPage'
import { FavouritesPage } from '@/pages/FavouritesPage'
import { RecentPage } from '@/pages/RecentPage'
import { BrowsePage } from '@/pages/BrowsePage'
import { BrowseResultsPage } from '@/pages/BrowseResultsPage'
import { SettingsPage } from '@/pages/SettingsPage'

/**
 * Lazy-load a route, surviving a deploy that happened while this tab was open.
 *
 * The service worker updates in the background, so chunk filenames the running
 * page knows can 404 afterwards. Rather than showing a crash on the first
 * navigation after a release, reload once to pick up the new build.
 */
function lazyRoute<T extends Record<string, React.ComponentType<unknown>>>(
  load: () => Promise<T>,
  name: keyof T,
) {
  return lazy(async () => {
    try {
      const mod = await load()
      return { default: mod[name] }
    } catch (err) {
      const KEY = 'recitation:chunk-reloaded'
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1')
        window.location.reload()
        // Never resolves; the reload takes over.
        return new Promise<never>(() => {})
      }
      throw err
    }
  })
}

// Heavier, less-frequently used screens are code-split so the first paint on
// mobile stays fast.
const ReaderPage = lazyRoute(() => import('@/pages/ReaderPage'), 'ReaderPage')
const EditorPage = lazyRoute(() => import('@/pages/EditorPage'), 'EditorPage')
const ImportPage = lazyRoute(() => import('@/pages/ImportPage'), 'ImportPage')
const DuplicatesPage = lazyRoute(() => import('@/pages/DuplicatesPage'), 'DuplicatesPage')
const OneNoteImportPage = lazyRoute(() => import('@/pages/OneNoteImportPage'), 'OneNoteImportPage')

function Loading() {
  return (
    <div className="shell">
      <div className="skeleton" style={{ height: 220 }} />
    </div>
  )
}

function MsalRedirectHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    const pending = sessionStorage.getItem('onenote-auth-pending')
    if (pending && location.hash.includes('code=')) {
      import('@/lib/onenote/auth').then(({ handleRedirect, clearAuthPending }) => {
        handleRedirect().then((ok) => {
          clearAuthPending()
          if (ok) navigate('/import/onenote', { replace: true })
        })
      })
    }
  }, [location.hash, navigate])
  return null
}

function AutoSync() {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    import('@/lib/sync').then(({ startAutoSync }) => startAutoSync())
  }, [])
  return null
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <AutoSync />
      <MsalRedirectHandler />
      <Routes>
        {/* Reader is full-bleed — outside the shell chrome. */}
        <Route path="/poem/:id" element={<ReaderPage />} />

        <Route element={<AppShell />}>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/favourites" element={<FavouritesPage />} />
          <Route path="/recent" element={<RecentPage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/browse/results" element={<BrowseResultsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/editor/:id" element={<EditorPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/import/onenote" element={<OneNoteImportPage />} />
          <Route path="/duplicates" element={<DuplicatesPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
