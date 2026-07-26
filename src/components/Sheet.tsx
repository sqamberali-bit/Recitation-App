import { useEffect, type ReactNode } from 'react'
import { IconClose } from './icons'

interface SheetProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}

/** A modal that slides up from the bottom on mobile and centres on desktop. */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="row-flex" style={{ marginBottom: 16 }}>
            <div className="sheet__title" style={{ margin: 0, flex: 1 }}>{title}</div>
            <button className="iconbtn" onClick={onClose} aria-label="Close"><IconClose /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
