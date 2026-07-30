import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconStarFill, IconImage, IconClock } from './icons'
import { BlobImage } from './BlobImage'
import { directionOf, excerpt } from '@/lib/text'
import { getMedia, toggleFavourite } from '@/db/repository'
import type { Poem } from '@/types'

function useThumb(id: string | undefined, cardRef: React.RefObject<HTMLElement | null>): Blob | undefined {
  const [blob, setBlob] = useState<Blob>()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setVisible(true)
        io.disconnect()
      }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [cardRef])

  useEffect(() => {
    if (!id || !visible) {
      setBlob(undefined)
      return
    }
    let alive = true
    getMedia(id).then((m) => {
      if (alive) setBlob(m?.thumbnail ?? m?.blob)
    })
    return () => { alive = false }
  }, [id, visible])

  return blob
}

export function PoemCard({ poem }: { poem: Poem }) {
  const navigate = useNavigate()
  const cardRef = useRef<HTMLDivElement>(null)
  const thumb = useThumb(poem.imageIds[0], cardRef)
  const displayTitle = poem.titleNative || poem.title
  const titleRtl = directionOf(displayTitle) === 'rtl'
  const bodyRtl = directionOf(poem.text) === 'rtl'
  const preview = excerpt(poem.text, 100)

  return (
    <div ref={cardRef} className="card" onClick={() => navigate(`/poem/${poem.id}`)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/poem/${poem.id}`)}>
      {poem.favourite && <IconStarFill className="card__star" width={18} />}
      <div className="card__top">
        <span className="card__kind">{poem.kind}</span>
      </div>
      {thumb && <BlobImage className="card__thumb" blob={thumb} loading="lazy" />}
      <div className={`card__title ${titleRtl ? 'card__title--urdu' : ''}`} dir={titleRtl ? 'rtl' : 'ltr'}>
        {displayTitle}
      </div>
      <div className={`card__excerpt ${bodyRtl ? 'card__excerpt--urdu' : ''}`} dir={bodyRtl ? 'rtl' : 'ltr'}>
        {preview}
      </div>
      <div className="card__meta">
        {poem.authorName && <span>{poem.authorName}</span>}
        {poem.authorName && <span className="card__dot" />}
        {poem.imageIds.length > 0 && (
          <span className="row-flex" style={{ gap: 3 }}>
            <IconImage width={13} /> {poem.imageIds.length}
          </span>
        )}
        {poem.viewCount > 0 && (
          <span className="row-flex" style={{ gap: 3 }}>
            <IconClock width={13} /> {poem.viewCount}
          </span>
        )}
        <span className="spacer" />
        <button
          className="iconbtn"
          style={{ width: 30, height: 30 }}
          onClick={(e) => {
            e.stopPropagation()
            void toggleFavourite(poem.id)
          }}
          aria-label={poem.favourite ? 'Remove favourite' : 'Add favourite'}
        >
          <IconStarFill width={16} style={{ color: poem.favourite ? 'var(--star)' : 'var(--text-3)' }} />
        </button>
      </div>
    </div>
  )
}
