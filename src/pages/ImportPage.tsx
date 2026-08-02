import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconBack, IconUpload, IconImage, IconFile } from '@/components/icons'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import {
  importLibrary,
  importSimplePoems,
  parseSimpleImport,
  type SimplePoemInput,
} from '@/lib/exportImport'
import { processImageFile } from '@/lib/media'
import { savePoem } from '@/db/repository'
import { detectLanguage } from '@/lib/text'
import { parseMhtFile, importMhtPages, type MhtPage } from '@/lib/mht'
import type { MediaAsset } from '@/types'

type Mode = 'text' | 'images' | 'backup' | 'mht'

export function ImportPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [mode, setMode] = useState<Mode>('text')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [preview, setPreview] = useState<SimplePoemInput[] | null>(null)

  const [mhtPages, setMhtPages] = useState<MhtPage[] | null>(null)

  const imagesRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const mhtRef = useRef<HTMLInputElement>(null)

  /* ---------------- text / JSON import ---------------- */
  const doPreview = () => {
    try {
      const parsed = parseSimpleImport(source)
      if (!parsed.length) {
        toast.error('Nothing to import — check the format')
        return
      }
      setPreview(parsed)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not parse input')
    }
  }

  const doImport = async () => {
    if (!preview) return
    setBusy(true)
    try {
      const n = await importSimplePoems(preview)
      toast.show(`Imported ${n} poems`)
      setSource('')
      setPreview(null)
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  /* ---------------- bulk image import ---------------- */
  const importImages = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      let done = 0
      for (const file of Array.from(files)) {
        setProgress(`Processing ${done + 1} of ${files.length}…`)
        const asset: MediaAsset = await processImageFile(file, 'pending', 0)
        const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
        await savePoem({
          draft: {
            title: title || 'Untitled scan',
            text: '',
            language: 'ur',
            kind: 'noha',
            collectionIds: [],
            topics: [],
            occasions: [],
            tags: ['imported'],
            imageIds: [asset.id],
            pdfIds: [],
            favourite: false,
          },
          newMedia: [asset],
        })
        done++
      }
      toast.show(`Imported ${done} image${done > 1 ? 's' : ''} as poems`)
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image import failed')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  /* ---------------- MHT import ---------------- */
  const parseMht = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    setProgress('Parsing MHT file…')
    try {
      const pages = await parseMhtFile(file)
      if (!pages.length) {
        toast.error('No pages found in the MHT file')
        return
      }
      setMhtPages(pages)
      const totalImages = pages.reduce((n, p) => n + p.images.length, 0)
      toast.show(`Found ${pages.length} pages with ${totalImages} images`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not parse MHT file')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const doMhtImport = async () => {
    if (!mhtPages) return
    setBusy(true)
    try {
      const result = await importMhtPages(mhtPages, (p) => {
        setProgress(`Importing ${p.current} of ${p.total}… ${p.title || ''}`)
      })
      toast.show(`Imported ${result.poems} poems with ${result.images} images`)
      setMhtPages(null)
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'MHT import failed')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  /* ---------------- backup restore ---------------- */
  const restoreBackup = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const ok = await confirm({
      title: 'Restore backup?',
      message: 'This merges the backup into your current library. Existing poems with the same ID are overwritten.',
      confirmLabel: 'Restore',
    })
    if (!ok) return
    setBusy(true)
    try {
      const summary = await importLibrary(file, { replace: false })
      toast.show(`Restored ${summary.poems} poems and ${summary.media} files`)
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="appbar">
        <button className="iconbtn" onClick={() => navigate(-1)} aria-label="Back"><IconBack /></button>
        <div className="appbar__title">Import</div>
      </header>

      <div className="shell">
        <div className="scroller" style={{ marginBottom: 18 }}>
          {(['text', 'images', 'mht', 'backup'] as Mode[]).map((m) => (
            <button key={m} className={`chip ${mode === m ? 'chip--active' : ''}`} onClick={() => setMode(m)}>
              {m === 'text' ? 'Paste text' : m === 'images' ? 'Photos & scans' : m === 'mht' ? 'OneNote MHT' : 'Restore backup'}
            </button>
          ))}
        </div>

        {mode === 'text' && (
          <>
            <p className="page-sub">
              Paste poems copied from OneNote (or anywhere). Separate each poem with a line of
              three dashes <code>---</code>. The first line of each block becomes the title.
              JSON arrays are also accepted.
            </p>
            <div className="field">
              <textarea
                className="textarea"
                style={{ minHeight: 260, fontFamily: 'var(--font-urdu)', fontSize: 18, lineHeight: 2 }}
                value={source}
                onChange={(e) => { setSource(e.target.value); setPreview(null) }}
                dir="auto"
                placeholder={'Title of first poem\nfirst verse…\nsecond verse…\n\n---\n\nTitle of second poem\nfirst verse…'}
              />
            </div>

            {preview ? (
              <>
                <div className="section-head"><h2>Preview — {preview.length} poems</h2></div>
                <div className="rows" style={{ marginBottom: 16 }}>
                  {preview.slice(0, 8).map((p, i) => (
                    <div key={i} className="row" style={{ cursor: 'default' }}>
                      <div className="row__body">
                        <div className="row__title" dir="auto">{p.title || '(untitled)'}</div>
                        <div className="row__sub" dir="auto">
                          {p.text.slice(0, 80)}… · {detectLanguage(p.text)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {preview.length > 8 && <p className="muted text-sm">…and {preview.length - 8} more</p>}
                </div>
                <div className="row-flex gap-3">
                  <button className="btn btn--ghost btn--block" onClick={() => setPreview(null)}>Back</button>
                  <button className="btn btn--primary btn--block" onClick={doImport} disabled={busy}>
                    {busy ? 'Importing…' : `Import ${preview.length} poems`}
                  </button>
                </div>
              </>
            ) : (
              <button className="btn btn--primary btn--block" onClick={doPreview} disabled={!source.trim()}>
                Preview import
              </button>
            )}
          </>
        )}

        {mode === 'images' && (
          <>
            <p className="page-sub">
              Select many photos or scans at once — each becomes a new poem with the image
              attached and the filename as its title. You can then run OCR on each one and
              tidy up the text.
            </p>
            <button className="btn btn--primary btn--block" onClick={() => imagesRef.current?.click()} disabled={busy}>
              <IconImage /> {busy ? progress || 'Working…' : 'Choose images'}
            </button>
            <input ref={imagesRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => { void importImages(e.target.files); e.target.value = '' }} />
            <p className="hint mt-4">
              Tip: in OneNote, right-click a page → “Save as” or export images, then select them all here.
            </p>
          </>
        )}

        {mode === 'mht' && (
          <>
            <p className="page-sub">
              Export your OneNote notebook as <strong>Single File Web Page (.mht)</strong> and
              select it here. All pages and images are imported with text and pictures intact.
            </p>
            {mhtPages ? (
              <>
                <div className="section-head"><h2>Preview — {mhtPages.length} pages</h2></div>
                <div className="rows" style={{ marginBottom: 16 }}>
                  {mhtPages.slice(0, 12).map((p, i) => (
                    <div key={i} className="row" style={{ cursor: 'default' }}>
                      <div className="row__body">
                        <div className="row__title" dir="auto">{p.title || '(untitled)'}</div>
                        <div className="row__sub" dir="auto">
                          {p.section ? `${p.section} · ` : ''}{p.images.length} image{p.images.length !== 1 ? 's' : ''}
                          {p.text ? ` · ${p.text.slice(0, 60)}…` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  {mhtPages.length > 12 && <p className="muted text-sm">…and {mhtPages.length - 12} more</p>}
                </div>
                <div className="row-flex gap-3">
                  <button className="btn btn--ghost btn--block" onClick={() => setMhtPages(null)}>Cancel</button>
                  <button className="btn btn--primary btn--block" onClick={doMhtImport} disabled={busy}>
                    {busy ? progress || 'Importing…' : `Import ${mhtPages.length} pages`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <button className="btn btn--primary btn--block" onClick={() => mhtRef.current?.click()} disabled={busy}>
                  <IconUpload /> {busy ? progress || 'Parsing…' : 'Choose .mht file'}
                </button>
                <input ref={mhtRef} type="file" accept=".mht,.mhtml" hidden
                  onChange={(e) => { void parseMht(e.target.files); e.target.value = '' }} />
              </>
            )}
          </>
        )}

        {mode === 'backup' && (
          <>
            <p className="page-sub">
              Restore a <code>.zip</code> backup exported from this app on another device.
              Poems, images, PDFs, authors, and collections are all restored.
            </p>
            <button className="btn btn--primary btn--block" onClick={() => backupRef.current?.click()} disabled={busy}>
              <IconUpload /> {busy ? 'Restoring…' : 'Choose backup file'}
            </button>
            <input ref={backupRef} type="file" accept=".zip,application/zip" hidden
              onChange={(e) => { void restoreBackup(e.target.files); e.target.value = '' }} />
          </>
        )}

        <div className="divider" />
        <div
          className="card"
          style={{ cursor: 'pointer', marginBottom: 16 }}
          onClick={() => navigate('/import/onenote')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate('/import/onenote') }}
        >
          <div className="row-flex" style={{ gap: 12 }}>
            <IconUpload />
            <div>
              <div style={{ fontWeight: 600 }}>Import from OneNote</div>
              <div className="text-sm muted">
                Connect to your Microsoft account and import notebooks, sections,
                images, and text automatically.
              </div>
            </div>
          </div>
        </div>
        <div className="row-flex gap-2 muted text-sm">
          <IconFile width={16} />
          <span>Everything is imported locally on this device — nothing is uploaded.</span>
        </div>
      </div>
    </>
  )
}
