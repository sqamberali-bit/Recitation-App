import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  IconBack,
  IconCamera,
  IconImage,
  IconClose,
  IconTrash,
  IconSparkles,
  IconWand,
  IconFile,
  IconGlobe,
} from '@/components/icons'
import { TagInput } from '@/components/TagInput'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useLibrary } from '@/store/library'
import { useSettings } from '@/store/settings'
import { deletePoem, getPoemWithMedia, savePoem } from '@/db/repository'
import { makePdfAsset, processImageFile } from '@/lib/media'
import { contentHash, detectLanguage } from '@/lib/text'
import { transliterate } from '@/lib/transliteration'
import { aiCorrect, isAiConfigured } from '@/lib/ai'
import { LANGUAGES, POEM_KINDS, type Language, type MediaAsset, type PoemDraft, type PoemKind } from '@/types'

const EMPTY: PoemDraft = {
  title: '',
  titleNative: '',
  text: '',
  translation: '',
  transliteration: '',
  language: 'ur',
  kind: 'noha',
  authorName: '',
  collectionIds: [],
  category: '',
  topics: [],
  occasions: [],
  tags: [],
  imageIds: [],
  pdfIds: [],
  notes: '',
  favourite: false,
}

export function EditorPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { facets, collections, authors, poems } = useLibrary()
  const { settings } = useSettings()

  const [draft, setDraft] = useState<PoemDraft>(EMPTY)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Media staged in the editor (persisted only on save).
  const [existingMedia, setExistingMedia] = useState<MediaAsset[]>([])
  const [newMedia, setNewMedia] = useState<MediaAsset[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])

  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  /* ---------------- load existing ---------------- */
  useEffect(() => {
    if (isNew) return
    let alive = true
    getPoemWithMedia(id!).then((data) => {
      if (!alive) return
      if (!data) {
        toast.error('Poem not found')
        navigate('/')
        return
      }
      const { poem, images, pdfs } = data
      setDraft({ ...poem })
      setExistingMedia([...images, ...pdfs])
      setLoading(false)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew])

  const set = useCallback(<K extends keyof PoemDraft>(key: K, value: PoemDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty(true)
  }, [])

  // Warn before losing unsaved work (tab close / refresh).
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  /* ---------------- duplicate detection ---------------- */
  const duplicate = useMemo(() => {
    if (!draft.text.trim()) return null
    const hash = contentHash(draft.text)
    return poems.find((p) => p.contentHash === hash && p.id !== draft.id) ?? null
  }, [draft.text, draft.id, poems])

  /* ---------------- media handling ---------------- */
  const addImages = async (files: FileList | null) => {
    if (!files?.length) return
    const startOrder = existingMedia.length + newMedia.length
    const processed: MediaAsset[] = []
    for (let i = 0; i < files.length; i++) {
      try {
        processed.push(await processImageFile(files[i], draft.id ?? 'pending', startOrder + i))
      } catch {
        toast.error(`Could not read ${files[i].name}`)
      }
    }
    if (!processed.length) return
    setNewMedia((m) => [...m, ...processed])
    set('imageIds', [...draft.imageIds, ...processed.map((p) => p.id)])
    toast.show(`${processed.length} image${processed.length > 1 ? 's' : ''} added`)
  }

  const addPdf = (files: FileList | null) => {
    if (!files?.length) return
    const startOrder = existingMedia.length + newMedia.length
    const assets = Array.from(files).map((f, i) => makePdfAsset(f, draft.id ?? 'pending', startOrder + i))
    setNewMedia((m) => [...m, ...assets])
    set('pdfIds', [...draft.pdfIds, ...assets.map((a) => a.id)])
  }

  const removeMedia = (asset: MediaAsset) => {
    if (existingMedia.some((m) => m.id === asset.id)) {
      setRemovedIds((r) => [...r, asset.id])
      setExistingMedia((m) => m.filter((x) => x.id !== asset.id))
    } else {
      setNewMedia((m) => m.filter((x) => x.id !== asset.id))
    }
    set('imageIds', draft.imageIds.filter((x) => x !== asset.id))
    set('pdfIds', draft.pdfIds.filter((x) => x !== asset.id))
    setDirty(true)
  }

  const allImages = [...existingMedia, ...newMedia].filter((m) => m.type === 'image')
  const allPdfs = [...existingMedia, ...newMedia].filter((m) => m.type === 'pdf')

  /* ---------------- OCR ---------------- */
  const runOcr = async (asset: MediaAsset) => {
    setOcrBusy(true)
    setOcrStatus('Loading OCR engine…')
    try {
      const { recognize } = await import('@/lib/ocr')
      const langs = draft.language === 'en' ? 'eng' : draft.language === 'ar' ? 'ara+eng' : 'urd+eng'
      const result = await recognize(asset.blob, langs, (p) => {
        setOcrStatus(`${p.status} ${Math.round(p.progress * 100)}%`)
      })
      if (!result.text) {
        toast.error('No text detected in this image')
        return
      }
      set('text', draft.text ? `${draft.text}\n\n${result.text}` : result.text)
      toast.show(`Text extracted (${Math.round(result.confidence)}% confidence)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'OCR failed')
    } finally {
      setOcrBusy(false)
      setOcrStatus('')
    }
  }

  /* ---------------- AI correction ---------------- */
  const aiOpts = {
    endpoint: settings.aiCorrectionEndpoint || import.meta.env.VITE_AI_CORRECTION_ENDPOINT || undefined,
    apiKey: settings.aiCorrectionKey || undefined,
    language: draft.language,
  }

  const runAiCorrect = async () => {
    if (!draft.text.trim()) return
    setAiBusy(true)
    try {
      const corrected = await aiCorrect(draft.text, aiOpts)
      set('text', corrected)
      toast.show('Text corrected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI correction failed')
    } finally {
      setAiBusy(false)
    }
  }

  /* ---------------- save / delete ---------------- */
  const onSave = async () => {
    if (!draft.text.trim()) {
      toast.error('Please add the poem text')
      return
    }
    setSaving(true)
    try {
      const title = draft.title.trim() || draft.text.trim().split('\n')[0].slice(0, 60)
      const newId = await savePoem({
        draft: { ...draft, title, language: draft.language ?? detectLanguage(draft.text) },
        newMedia,
        removedMediaIds: removedIds,
      })
      setDirty(false)
      toast.show(isNew ? 'Poem added' : 'Changes saved')
      navigate(`/poem/${newId}`, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!draft.id) return
    const ok = await confirm({
      title: 'Delete this poem?',
      message: 'The poem and all of its images will be permanently removed from this device.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await deletePoem(draft.id)
    setDirty(false)
    toast.show('Poem deleted')
    navigate('/')
  }

  const onBack = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'Your unsaved edits will be lost.',
        confirmLabel: 'Discard',
        danger: true,
      })
      if (!ok) return
    }
    navigate(-1)
  }

  if (loading) {
    return <div className="shell"><div className="skeleton" style={{ height: 400 }} /></div>
  }

  return (
    <>
      <header className="appbar">
        <button className="iconbtn" onClick={onBack} aria-label="Back"><IconBack /></button>
        <div className="appbar__title">{isNew ? 'New poem' : 'Edit poem'}</div>
        <div className="appbar__spacer" />
        {!isNew && (
          <button className="iconbtn" onClick={onDelete} aria-label="Delete" style={{ color: 'var(--danger)' }}>
            <IconTrash />
          </button>
        )}
        <button className="btn btn--primary btn--sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <div className="shell">
        {duplicate && (
          <div className="card" style={{ borderColor: 'var(--gold)', background: 'var(--surface-2)', cursor: 'default', marginBottom: 16 }}>
            <strong>Possible duplicate</strong>
            <p className="text-sm muted">
              “{duplicate.title}” already has the same text.
            </p>
            <button className="btn btn--sm btn--ghost" onClick={() => navigate(`/poem/${duplicate.id}`)}>
              View existing
            </button>
          </div>
        )}

        {/* ---------- Media ---------- */}
        <div className="field">
          <label>Images & scans</label>
          <div className="row-flex wrap gap-2" style={{ marginBottom: 10 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => cameraRef.current?.click()}>
              <IconCamera /> Camera
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => galleryRef.current?.click()}>
              <IconImage /> Gallery
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => pdfRef.current?.click()}>
              <IconFile /> PDF
            </button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { void addImages(e.target.files); e.target.value = '' }} />
          <input ref={galleryRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { void addImages(e.target.files); e.target.value = '' }} />
          <input ref={pdfRef} type="file" accept="application/pdf" multiple hidden
            onChange={(e) => { addPdf(e.target.files); e.target.value = '' }} />

          {allImages.length > 0 && (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {allImages.map((m) => (
                <MediaTile
                  key={m.id}
                  asset={m}
                  busy={ocrBusy}
                  onRemove={() => removeMedia(m)}
                  onOcr={() => void runOcr(m)}
                />
              ))}
            </div>
          )}
          {allPdfs.length > 0 && (
            <div className="rows mt-4">
              {allPdfs.map((m) => (
                <div key={m.id} className="row" style={{ cursor: 'default' }}>
                  <IconFile />
                  <div className="row__body">
                    <div className="row__title">{m.name ?? 'Document.pdf'}</div>
                  </div>
                  <button className="iconbtn" onClick={() => removeMedia(m)} aria-label="Remove"><IconClose /></button>
                </div>
              ))}
            </div>
          )}
          {ocrBusy && <p className="hint mt-4">⏳ {ocrStatus || 'Reading text…'}</p>}
        </div>

        {/* ---------- Text ---------- */}
        <div className="field">
          <div className="row-flex" style={{ justifyContent: 'space-between' }}>
            <label style={{ marginBottom: 0 }}>Poem text *</label>
            <div className="row-flex gap-2">
              {isAiConfigured(aiOpts) && (
                <button className="btn btn--sm btn--ghost" onClick={runAiCorrect} disabled={aiBusy || !draft.text}>
                  <IconSparkles /> {aiBusy ? 'Correcting…' : 'AI fix'}
                </button>
              )}
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => set('transliteration', transliterate(draft.text))}
                disabled={!draft.text}
                title="Generate Roman transliteration"
              >
                <IconGlobe /> Roman
              </button>
            </div>
          </div>
          <textarea
            className={`textarea ${draft.language !== 'en' ? 'textarea--urdu' : ''}`}
            value={draft.text}
            onChange={(e) => set('text', e.target.value)}
            onPaste={(e) => {
              // Auto-detect language from pasted content on an empty field.
              if (!draft.text) {
                const pasted = e.clipboardData.getData('text')
                if (pasted) set('language', detectLanguage(pasted))
              }
            }}
            placeholder="Paste or type the poem here…"
            dir="auto"
          />
        </div>

        {/* ---------- Titles ---------- */}
        <div className="field">
          <label>Title</label>
          <input className="input" value={draft.title} onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Ya Hussain" dir="auto" />
        </div>
        <div className="field">
          <label>Title in Urdu / Arabic</label>
          <input className="input" style={{ fontFamily: 'var(--font-urdu)', fontSize: 20, direction: 'rtl' }}
            value={draft.titleNative ?? ''} onChange={(e) => set('titleNative', e.target.value)} dir="rtl" />
        </div>

        {/* ---------- Classification ---------- */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div className="field">
            <label>Type</label>
            <select className="select" value={draft.kind} onChange={(e) => set('kind', e.target.value as PoemKind)}>
              {POEM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Language</label>
            <select className="select" value={draft.language} onChange={(e) => set('language', e.target.value as Language)}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Author / Poet</label>
          <input className="input" list="author-list" value={draft.authorName ?? ''}
            onChange={(e) => set('authorName', e.target.value)} placeholder="Poet's name" dir="auto" />
          <datalist id="author-list">
            {authors.map((a) => <option key={a.id} value={a.name} />)}
          </datalist>
        </div>

        <div className="field">
          <label>Category</label>
          <input className="input" list="category-list" value={draft.category ?? ''}
            onChange={(e) => set('category', e.target.value)} placeholder="e.g. Muharram" dir="auto" />
          <datalist id="category-list">
            {facets.categories.map((c) => <option key={c.value} value={c.value} />)}
          </datalist>
        </div>

        {collections.length > 0 && (
          <div className="field">
            <label>Collections</label>
            <div className="chips">
              {collections.map((c) => {
                const on = draft.collectionIds.includes(c.id)
                return (
                  <button key={c.id} type="button" className={`chip ${on ? 'chip--active' : ''}`}
                    onClick={() => set('collectionIds', on ? draft.collectionIds.filter((x) => x !== c.id) : [...draft.collectionIds, c.id])}>
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="field">
          <label>Tags</label>
          <TagInput value={draft.tags} onChange={(v) => set('tags', v)}
            suggestions={facets.tags.map((t) => t.value)} placeholder="Add a tag and press Enter" />
        </div>
        <div className="field">
          <label>Topics</label>
          <TagInput value={draft.topics} onChange={(v) => set('topics', v)}
            suggestions={facets.topics.map((t) => t.value)} placeholder="e.g. Karbala, Sabr" />
        </div>
        <div className="field">
          <label>Occasions</label>
          <TagInput value={draft.occasions} onChange={(v) => set('occasions', v)}
            suggestions={facets.occasions.map((t) => t.value)} placeholder="e.g. Ashura, Arbaeen" />
        </div>

        {/* ---------- Secondary text ---------- */}
        <div className="field">
          <label>Transliteration (Roman)</label>
          <textarea className="textarea" style={{ minHeight: 90 }} value={draft.transliteration ?? ''}
            onChange={(e) => set('transliteration', e.target.value)} placeholder="Optional Roman script" />
        </div>
        <div className="field">
          <label>Translation</label>
          <textarea className="textarea" style={{ minHeight: 90 }} value={draft.translation ?? ''}
            onChange={(e) => set('translation', e.target.value)} placeholder="Optional English translation" dir="auto" />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea className="textarea" style={{ minHeight: 70 }} value={draft.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)} placeholder="Private notes (tune, reciter, etc.)" dir="auto" />
        </div>

        <button className="btn btn--primary btn--block mt-4" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : isNew ? 'Add to library' : 'Save changes'}
        </button>
      </div>
    </>
  )
}

/* --------------------------------------------------------------------- */

function MediaTile({
  asset,
  busy,
  onRemove,
  onOcr,
}: {
  asset: MediaAsset
  busy: boolean
  onRemove: () => void
  onOcr: () => void
}) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const blob = asset.thumbnail ?? asset.blob
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [asset])

  return (
    <div style={{ position: 'relative' }}>
      {url ? (
        <img src={url} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
      ) : (
        <div className="skeleton" style={{ height: 120 }} />
      )}
      <button className="iconbtn" onClick={onRemove} aria-label="Remove image"
        style={{ position: 'absolute', top: 4, insetInlineEnd: 4, width: 28, height: 28, background: 'rgba(0,0,0,0.55)', color: '#fff' }}>
        <IconClose width={16} />
      </button>
      <button className="btn btn--sm" onClick={onOcr} disabled={busy}
        style={{ position: 'absolute', bottom: 6, insetInlineStart: 6, padding: '4px 8px', fontSize: 11 }}>
        <IconWand width={14} /> OCR
      </button>
    </div>
  )
}
