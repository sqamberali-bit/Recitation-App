import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  IconBack,
  IconEdit,
  IconStarFill,
  IconExpand,
  IconShrink,
  IconPlay,
  IconPause,
  IconPlus,
  IconMinus,
  IconTextSize,
  IconClose,
  IconFile,
} from '@/components/icons'
import { useObjectUrl } from '@/components/BlobImage'
import { getPoemWithMedia, recordView, setBookmark, toggleFavourite } from '@/db/repository'
import { useSettings } from '@/store/settings'
import { useToast } from '@/components/Toast'
import { useWakeLock } from '@/lib/wakeLock'
import { directionOf } from '@/lib/text'
import '@/styles/reader.css'

const MIN_FONT = 16
const MAX_FONT = 72

export function ReaderPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { settings, update } = useSettings()

  const data = useLiveQuery(() => getPoemWithMedia(id), [id])

  /**
   * Callback ref rather than useRef: this component renders a loading skeleton
   * first, so the scroll container does not exist during the initial effect
   * pass. A state-backed ref re-runs the effects the moment the real element
   * mounts, which is what makes scroll persistence and auto-scroll work.
   */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

  const [immersive, setImmersive] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [autoScroll, setAutoScroll] = useState(false)
  const [showSpeed, setShowSpeed] = useState(false)
  // Hold the Blob, not a borrowed URL: the URL created inside ReaderImage is
  // revoked whenever the live query hands back a new Blob instance, which would
  // blank the lightbox while it is still open.
  const [lightbox, setLightbox] = useState<Blob | null>(null)
  const [resumeAt, setResumeAt] = useState<number | null>(null)

  useWakeLock(settings.keepAwake)

  // Count a view once per mount.
  useEffect(() => {
    if (id) void recordView(id)
  }, [id])

  // Offer to resume from a saved bookmark — once per poem, on first load only.
  // Depending on `bookmark` would re-show the pill every time we save progress.
  const offeredForRef = useRef<string | null>(null)
  useEffect(() => {
    const poem = data?.poem
    if (!poem || offeredForRef.current === poem.id) return
    offeredForRef.current = poem.id
    if (poem.bookmark && poem.bookmark > 0.02) setResumeAt(poem.bookmark)
  }, [data?.poem])

  /* ---------------- auto-scroll ---------------- */
  useEffect(() => {
    if (!autoScroll) return
    const el = scrollEl
    if (!el) return
    let raf = 0
    let last = performance.now()
    // Speed setting (10..100) maps to ~5..85 px/second.
    const pxPerSec = 5 + (settings.autoScrollSpeed / 100) * 80

    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      el.scrollTop += pxPerSec * dt
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        setAutoScroll(false)
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [autoScroll, settings.autoScrollSpeed, scrollEl])

  /* ---------------- persist reading position ---------------- */
  // While the "resume" pill is offered the saved position must be preserved:
  // layout settling can emit a scroll event at offset 0, which would otherwise
  // erase the bookmark before the reader has had a chance to tap it.
  const resumePendingRef = useRef(false)
  resumePendingRef.current = resumeAt !== null

  const saveProgress = useCallback(() => {
    if (!scrollEl || !id || resumePendingRef.current) return
    const max = scrollEl.scrollHeight - scrollEl.clientHeight
    if (max <= 0) return
    const frac = Math.min(1, Math.max(0, scrollEl.scrollTop / max))
    void setBookmark(id, frac > 0.02 ? frac : undefined)
  }, [id, scrollEl])

  useEffect(() => {
    if (!scrollEl) return
    let timer = 0
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(saveProgress, 400)
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      window.clearTimeout(timer)
      saveProgress()
    }
  }, [scrollEl, saveProgress])

  // A full page close (tab close / app switch) never runs React cleanup, so
  // flush the position on pagehide as well.
  useEffect(() => {
    const onHide = () => saveProgress()
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [saveProgress])

  /* ---------------- fullscreen ---------------- */
  const toggleImmersive = async () => {
    const next = !immersive
    setImmersive(next)
    setShowControls(false)
    try {
      if (next && document.fullscreenEnabled && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch {
      // Fullscreen API unavailable (common on iOS) — immersive CSS still applies.
    }
  }

  // Keep state in sync if the user exits fullscreen via the browser/ESC, and
  // always leave fullscreen when the reader unmounts — otherwise the library
  // screen would stay full-screen with no way to tell why.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setImmersive(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])

  /* ---------------- keyboard shortcuts ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'f') void toggleImmersive()
      else if (e.key === ' ') {
        e.preventDefault()
        setAutoScroll((v) => !v)
      } else if (e.key === '+' || e.key === '=') changeFont(2)
      else if (e.key === '-') changeFont(-2)
      else if (e.key === 'Escape' && !immersive) navigate(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immersive, settings.readerFontSize])

  const changeFont = (delta: number) => {
    const next = Math.min(MAX_FONT, Math.max(MIN_FONT, settings.readerFontSize + delta))
    void update({ readerFontSize: next })
  }

  const poem = data?.poem
  const rtl = useMemo(() => (poem ? directionOf(poem.text) === 'rtl' : false), [poem])
  const titleText = poem?.titleNative || poem?.title || ''
  const titleRtl = directionOf(titleText) === 'rtl'

  if (data === undefined) {
    return <div className="shell"><div className="skeleton" style={{ height: 300 }} /></div>
  }
  if (!poem) {
    return (
      <div className="shell center" style={{ paddingTop: 60 }}>
        <h3>Poem not found</h3>
        <button className="btn btn--primary mt-4" onClick={() => navigate('/')}>Back to library</button>
      </div>
    )
  }

  const jumpToBookmark = () => {
    if (scrollEl && resumeAt) {
      scrollEl.scrollTo({
        top: resumeAt * (scrollEl.scrollHeight - scrollEl.clientHeight),
        behavior: 'smooth',
      })
    }
    setResumeAt(null)
  }

  return (
    <div className={`reader ${immersive ? 'reader--immersive' : ''} ${showControls ? 'reader--controls' : ''}`}>
      <div className="reader__bar">
        <button className="iconbtn" onClick={() => navigate(-1)} aria-label="Back"><IconBack /></button>
        <div className="spacer" />
        <button className="iconbtn" onClick={() => void toggleFavourite(poem.id)} aria-label="Favourite">
          <IconStarFill style={{ color: poem.favourite ? 'var(--star)' : 'var(--text-3)' }} />
        </button>
        <button className="iconbtn" onClick={() => navigate(`/editor/${poem.id}`)} aria-label="Edit"><IconEdit /></button>
        <button className="iconbtn" onClick={toggleImmersive} aria-label="Fullscreen">
          {immersive ? <IconShrink /> : <IconExpand />}
        </button>
      </div>

      {resumeAt !== null && (
        <button className="resume-pill" onClick={jumpToBookmark}>
          Resume where you left off
        </button>
      )}

      <div
        className="reader__scroll"
        ref={setScrollEl}
        onClick={() => immersive && setShowControls((v) => !v)}
      >
        <div className="reader__inner">
          <h1 className={`reader__title ${titleRtl ? 'reader__title--urdu' : ''}`} dir={titleRtl ? 'rtl' : 'ltr'}>
            {titleText}
          </h1>
          {poem.authorName && <div className="reader__author">{poem.authorName}</div>}

          <div
            className={`reader__body ${rtl ? 'reader__body--rtl' : 'reader__body--ltr'}`}
            dir={rtl ? 'rtl' : 'ltr'}
            style={{
              fontSize: `${settings.readerFontSize}px`,
              lineHeight: settings.readerLineHeight,
            }}
          >
            {poem.text}
          </div>

          {poem.transliteration && (
            <div className="reader__translation">
              <div className="reader__section-label">Transliteration</div>
              {poem.transliteration}
            </div>
          )}

          {poem.translation && (
            <div className="reader__translation">
              <div className="reader__section-label">Translation</div>
              {poem.translation}
            </div>
          )}

          {data.images.length > 0 && (
            <div className="reader__images">
              <div className="reader__section-label">Scans & photos</div>
              {data.images.map((img) => (
                <ReaderImage
                  key={img.id}
                  blob={img.blob}
                  width={img.width}
                  height={img.height}
                  onOpen={setLightbox}
                />
              ))}
            </div>
          )}

          {data.pdfs.length > 0 && (
            <div className="reader__images">
              <div className="reader__section-label">Attachments</div>
              {data.pdfs.map((pdf) => (
                <PdfLink key={pdf.id} name={pdf.name ?? 'Document.pdf'} blob={pdf.blob} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="reader__dock">
        <div className="group">
          <button className="iconbtn" onClick={() => changeFont(-2)} aria-label="Smaller text"><IconMinus /></button>
          <span className="fontval">{settings.readerFontSize}</span>
          <button className="iconbtn" onClick={() => changeFont(2)} aria-label="Larger text"><IconPlus /></button>
        </div>

        <div className="group">
          <button
            className="iconbtn"
            onClick={() => setAutoScroll((v) => !v)}
            aria-label={autoScroll ? 'Pause auto-scroll' : 'Start auto-scroll'}
            style={{ color: autoScroll ? 'var(--accent)' : undefined }}
          >
            {autoScroll ? <IconPause /> : <IconPlay />}
          </button>
          <button className="iconbtn" onClick={() => setShowSpeed((v) => !v)} aria-label="Auto-scroll speed">
            <IconTextSize />
          </button>
        </div>

        {showSpeed && (
          <div className="group speed-pop">
            <span className="text-sm muted">Speed</span>
            <input
              type="range"
              min={10}
              max={100}
              value={settings.autoScrollSpeed}
              onChange={(e) => void update({ autoScrollSpeed: Number(e.target.value) })}
            />
          </div>
        )}

        <div className="spacer" />
        <button
          className="btn btn--sm btn--ghost"
          onClick={() => {
            saveProgress()
            toast.show('Reading position saved')
          }}
        >
          Bookmark
        </button>
      </div>

      {lightbox && <Lightbox blob={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

/* --------------------------------------------------------------------- */

function ReaderImage({
  blob,
  width,
  height,
  onOpen,
}: {
  blob: Blob
  width?: number
  height?: number
  onOpen: (blob: Blob) => void
}) {
  const url = useObjectUrl(blob)
  // Publishing the intrinsic size lets the browser reserve the right space
  // before the image decodes. Without it the page grows as scans load, which
  // shifts the text under the reader's finger and skews the saved bookmark.
  const ratio = width && height ? { aspectRatio: `${width} / ${height}` } : undefined
  if (!url) return <div className="skeleton" style={{ height: 200, ...ratio }} />
  return (
    <img
      className="reader__image"
      src={url}
      alt="Poem scan"
      loading="lazy"
      width={width}
      height={height}
      style={ratio}
      onClick={() => onOpen(blob)}
    />
  )
}

/** Full-screen image viewer that owns its own object URL for its lifetime. */
function Lightbox({ blob, onClose }: { blob: Blob; onClose: () => void }) {
  const url = useObjectUrl(blob)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // Capture phase so the reader's own Escape handler doesn't navigate away
    // while the lightbox is open.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="iconbtn lightbox__close" aria-label="Close"><IconClose /></button>
      {url && <img src={url} alt="Poem scan" />}
    </div>
  )
}

function PdfLink({ name, blob }: { name: string; blob: Blob }) {
  const url = useObjectUrl(blob)
  return (
    <a className="row" href={url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
      <IconFile />
      <div className="row__body">
        <div className="row__title">{name}</div>
        <div className="row__sub">Open PDF</div>
      </div>
    </a>
  )
}
