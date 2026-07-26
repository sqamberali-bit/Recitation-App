import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { LibraryPage } from '@/pages/LibraryPage'
import { FavouritesPage } from '@/pages/FavouritesPage'
import { RecentPage } from '@/pages/RecentPage'
import { BrowsePage } from '@/pages/BrowsePage'
import { BrowseResultsPage } from '@/pages/BrowseResultsPage'
import { SettingsPage } from '@/pages/SettingsPage'

// Heavier, less-frequently used screens are code-split so the first paint on
// mobile stays fast.
const ReaderPage = lazy(() => import('@/pages/ReaderPage').then((m) => ({ default: m.ReaderPage })))
const EditorPage = lazy(() => import('@/pages/EditorPage').then((m) => ({ default: m.EditorPage })))
const ImportPage = lazy(() => import('@/pages/ImportPage').then((m) => ({ default: m.ImportPage })))
const DuplicatesPage = lazy(() =>
  import('@/pages/DuplicatesPage').then((m) => ({ default: m.DuplicatesPage })),
)

function Loading() {
  return (
    <div className="shell">
      <div className="skeleton" style={{ height: 220 }} />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
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
          <Route path="/duplicates" element={<DuplicatesPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
