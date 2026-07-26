import { useMemo } from 'react'
import { PoemCard } from '@/components/PoemCard'
import { EmptyState } from '@/components/EmptyState'
import { useLibrary } from '@/store/library'

export function FavouritesPage() {
  const { poems } = useLibrary()
  const favs = useMemo(
    () =>
      poems
        .filter((p) => p.favourite)
        .sort((a, b) => (b.favouritedAt ?? b.updatedAt) - (a.favouritedAt ?? a.updatedAt)),
    [poems],
  )

  return (
    <>
      <header className="appbar"><div className="appbar__title">Favourites</div></header>
      <div className="shell">
        {favs.length === 0 ? (
          <EmptyState
            icon="⭐"
            title="No favourites yet"
            message="Tap the star on any poem to keep it here for quick access during Majalis."
          />
        ) : (
          <div className="grid">
            {favs.map((p) => <PoemCard key={p.id} poem={p} />)}
          </div>
        )}
      </div>
    </>
  )
}
