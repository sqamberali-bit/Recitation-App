import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconBack, IconCloud, IconClose } from '@/components/icons'
import { useToast } from '@/components/Toast'
import { isConfigured, signIn, signOut, getAccount, handleRedirect } from '@/lib/onenote/auth'
import { listNotebooks, type OneNoteNotebook } from '@/lib/onenote/client'
import { runImport, type ImportProgress, type ImportSummary } from '@/lib/onenote/importer'
import { db } from '@/db/database'

type Step = 'setup' | 'connect' | 'select' | 'importing' | 'summary'

export function OneNoteImportPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [step, setStep] = useState<Step>(isConfigured() ? 'connect' : 'setup')
  const [busy, setBusy] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [notebooks, setNotebooks] = useState<OneNoteNotebook[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [previousCount, setPreviousCount] = useState(0)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    db.poems
      .filter((p) => !!p.onenoteSourceId)
      .count()
      .then(setPreviousCount)

    if (isConfigured()) {
      handleRedirect().then(async (didReturn) => {
        if (didReturn) {
          const acct = await getAccount()
          setAccountName(acct?.username ?? acct?.name ?? '')
          const nbs = await listNotebooks()
          setNotebooks(nbs)
          setSelected(new Set(nbs.map((n) => n.id)))
          setStep('select')
        }
      }).catch((err) => {
        setError(err instanceof Error ? err.message : 'Sign-in failed')
      })
    }
  }, [])

  const doConnect = async () => {
    setBusy(true)
    setError('')
    try {
      await signIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setBusy(false)
    }
  }

  const doDisconnect = async () => {
    await signOut()
    setAccountName('')
    setNotebooks([])
    setStep('connect')
  }

  const toggleNotebook = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startImport = async () => {
    const ids = [...selected]
    if (!ids.length) {
      toast.error('Select at least one notebook')
      return
    }
    setStep('importing')
    setError('')
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const result = await runImport({
        notebookIds: ids,
        onProgress: setProgress,
        signal: ctrl.signal,
      })
      setSummary(result)
      setStep('summary')
    } catch (err) {
      if (ctrl.signal.aborted) {
        toast.show('Import cancelled')
        setStep('select')
      } else {
        setError(err instanceof Error ? err.message : 'Import failed')
        setStep('select')
      }
    } finally {
      abortRef.current = null
    }
  }

  const cancelImport = () => {
    abortRef.current?.abort()
  }

  return (
    <>
      <header className="appbar">
        <button
          className="iconbtn"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <IconBack />
        </button>
        <div className="appbar__title">Import from OneNote</div>
      </header>

      <div className="shell">
        {error && (
          <div
            className="card"
            style={{
              borderColor: 'var(--danger)',
              background: 'var(--surface-2)',
              marginBottom: 16,
            }}
          >
            <strong>Error</strong>
            <p className="text-sm" style={{ marginTop: 4 }}>
              {error}
            </p>
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => setError('')}
            >
              Dismiss
            </button>
          </div>
        )}

        {step === 'setup' && <SetupGuide />}
        {step === 'connect' && (
          <ConnectStep
            busy={busy}
            previousCount={previousCount}
            onConnect={doConnect}
          />
        )}
        {step === 'select' && (
          <SelectStep
            accountName={accountName}
            notebooks={notebooks}
            selected={selected}
            onToggle={toggleNotebook}
            onStart={startImport}
            onDisconnect={doDisconnect}
          />
        )}
        {step === 'importing' && progress && (
          <ImportingStep progress={progress} onCancel={cancelImport} />
        )}
        {step === 'summary' && summary && (
          <SummaryStep
            summary={summary}
            onDone={() => navigate('/')}
            onAgain={() => setStep('select')}
          />
        )}
      </div>
    </>
  )
}

function SetupGuide() {
  return (
    <div>
      <div className="section-head">
        <h2>Setup required</h2>
      </div>
      <p className="page-sub">
        To import from OneNote, you need a free Azure app registration. This is
        a one-time setup that takes about two minutes.
      </p>
      <ol style={{ paddingInlineStart: 20, lineHeight: 1.8 }}>
        <li>
          Go to{' '}
          <strong>
            portal.azure.com &rarr; App registrations &rarr; New registration
          </strong>
        </li>
        <li>
          Name: <code>Recitation App</code>, Supported account types:{' '}
          <strong>Personal Microsoft accounts</strong> (or All)
        </li>
        <li>
          Redirect URI: <strong>Single-page application (SPA)</strong>, value:{' '}
          <code>{window.location.origin}</code>
        </li>
        <li>
          Copy the <strong>Application (client) ID</strong> from the Overview
          page
        </li>
        <li>
          Add it to your <code>.env</code> file:
          <pre
            className="card"
            style={{
              cursor: 'default',
              marginTop: 8,
              padding: 12,
              fontSize: 13,
              fontFamily: 'monospace',
              overflow: 'auto',
            }}
          >
            VITE_ONENOTE_CLIENT_ID=paste-your-client-id-here
          </pre>
        </li>
        <li>Rebuild and reload the app</li>
      </ol>
      <p className="hint mt-4">
        No API keys or secrets are needed. The app uses browser-based PKCE
        authentication which is designed for public clients. Your Microsoft
        credentials are never sent to this app.
      </p>
    </div>
  )
}

function ConnectStep({
  busy,
  previousCount,
  onConnect,
}: {
  busy: boolean
  previousCount: number
  onConnect: () => void
}) {
  return (
    <div>
      <p className="page-sub">
        Sign in with your Microsoft account to import poems from your OneNote
        notebooks. The app requests <strong>read-only</strong> access to your
        notes — it cannot modify anything in OneNote.
      </p>

      {previousCount > 0 && (
        <div
          className="card"
          style={{
            cursor: 'default',
            marginBottom: 16,
            background: 'var(--surface-2)',
          }}
        >
          <p className="text-sm">
            <strong>{previousCount}</strong> poems were previously imported from
            OneNote. Re-importing will check for new and updated pages.
          </p>
        </div>
      )}

      <button
        className="btn btn--primary btn--block"
        onClick={onConnect}
        disabled={busy}
      >
        <IconCloud /> {busy ? 'Connecting…' : 'Sign in with Microsoft'}
      </button>

      <p className="hint mt-4 center">
        A Microsoft popup will open for sign-in. Allow popups if blocked.
      </p>
    </div>
  )
}

function SelectStep({
  accountName,
  notebooks,
  selected,
  onToggle,
  onStart,
  onDisconnect,
}: {
  accountName: string
  notebooks: OneNoteNotebook[]
  selected: Set<string>
  onToggle: (id: string) => void
  onStart: () => void
  onDisconnect: () => void
}) {
  return (
    <div>
      <div
        className="row-flex"
        style={{
          justifyContent: 'space-between',
          marginBottom: 16,
          fontSize: 14,
        }}
      >
        <span className="muted">
          Signed in as <strong>{accountName}</strong>
        </span>
        <button className="btn btn--sm btn--ghost" onClick={onDisconnect}>
          Sign out
        </button>
      </div>

      <div className="section-head">
        <h2>Select notebooks to import</h2>
      </div>

      {notebooks.length === 0 ? (
        <p className="muted">No notebooks found in this account.</p>
      ) : (
        <div className="rows" style={{ marginBottom: 20 }}>
          {notebooks.map((nb) => (
            <label
              key={nb.id}
              className="row"
              style={{ cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={selected.has(nb.id)}
                onChange={() => onToggle(nb.id)}
                style={{ marginInlineEnd: 12, accentColor: 'var(--accent)' }}
              />
              <div className="row__body">
                <div className="row__title">{nb.displayName}</div>
                <div className="row__sub">
                  Updated{' '}
                  {new Date(nb.lastModifiedDateTime).toLocaleDateString()}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}

      <button
        className="btn btn--primary btn--block"
        onClick={onStart}
        disabled={selected.size === 0}
      >
        Import {selected.size} notebook{selected.size !== 1 ? 's' : ''}
      </button>

      <p className="hint mt-4">
        Each notebook becomes a collection. Sections become categories on each
        poem. Images are downloaded and stored locally. Duplicates are
        automatically skipped.
      </p>
    </div>
  )
}

function ImportingStep({
  progress: p,
  onCancel,
}: {
  progress: ImportProgress
  onCancel: () => void
}) {
  const pct =
    p.totalPages > 0 ? Math.round((p.processed / p.totalPages) * 100) : 0

  return (
    <div>
      <div className="section-head">
        <h2>
          {p.phase === 'scanning' ? 'Scanning notebooks…' : 'Importing…'}
        </h2>
      </div>

      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: 'var(--surface-2)',
          marginBottom: 16,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--accent)',
            borderRadius: 4,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <StatBox label="Imported" value={p.imported + p.updated} />
        <StatBox label="Skipped" value={p.skipped} />
        <StatBox label="Images" value={p.images} />
        <StatBox label="Errors" value={p.errors} />
      </div>

      <div className="text-sm muted" style={{ marginBottom: 4 }}>
        {p.processed} / {p.totalPages} pages
      </div>
      {p.notebook && (
        <div className="text-sm muted" style={{ marginBottom: 2 }}>
          {p.notebook}
          {p.section ? ` › ${p.section}` : ''}
        </div>
      )}
      {p.page && (
        <div
          className="text-sm muted"
          dir="auto"
          style={{
            marginBottom: 16,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {p.page}
        </div>
      )}

      <button className="btn btn--ghost btn--block" onClick={onCancel}>
        <IconClose /> Cancel import
      </button>

      <p className="hint mt-4">
        Already-imported pages are saved. You can resume by re-importing — only
        new and changed pages will be processed.
      </p>
    </div>
  )
}

function SummaryStep({
  summary: s,
  onDone,
  onAgain,
}: {
  summary: ImportSummary
  onDone: () => void
  onAgain: () => void
}) {
  return (
    <div>
      <div className="section-head">
        <h2>Import complete</h2>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <StatBox label="New poems" value={s.imported} />
        <StatBox label="Updated" value={s.updated} />
        <StatBox label="Unchanged" value={s.skipped} />
        <StatBox label="Images" value={s.images} />
        {s.errors > 0 && <StatBox label="Errors" value={s.errors} />}
      </div>

      {s.imageOnly > 0 && (
        <div
          className="card"
          style={{
            cursor: 'default',
            background: 'var(--surface-2)',
            marginBottom: 16,
          }}
        >
          <p className="text-sm">
            <strong>{s.imageOnly}</strong> page
            {s.imageOnly !== 1 ? 's contain' : ' contains'} only images with no
            text. Open them and use the OCR button to extract the text.
          </p>
        </div>
      )}

      <div className="row-flex gap-3">
        <button className="btn btn--ghost btn--block" onClick={onAgain}>
          Import more
        </button>
        <button className="btn btn--primary btn--block" onClick={onDone}>
          Go to library
        </button>
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="card"
      style={{ cursor: 'default', gap: 2, padding: 14, textAlign: 'center' }}
    >
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div className="muted text-sm">{label}</div>
    </div>
  )
}
