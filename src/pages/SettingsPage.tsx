import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconSun,
  IconMoon,
  IconDownload,
  IconUpload,
  IconCloud,
  IconTrash,
  IconChevron,
  IconCopy,
} from '@/components/icons'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useSettings } from '@/store/settings'
import { useLibrary } from '@/store/library'
import { downloadBlob, exportLibrary } from '@/lib/exportImport'
import { pullBackup, pushBackup } from '@/lib/backup'
import { findDuplicateGroups, getLibraryStats, type LibraryStats } from '@/db/repository'
import { resetDatabase } from '@/db/database'
import { formatBytes } from '@/lib/text'

export function SettingsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { settings, update } = useSettings()
  const { poems } = useLibrary()

  const [stats, setStats] = useState<LibraryStats | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    void getLibraryStats().then(setStats)
  }, [poems.length])

  const doExport = async () => {
    setBusy('export')
    try {
      const blob = await exportLibrary()
      const date = new Date().toISOString().slice(0, 10)
      downloadBlob(blob, `recitation-backup-${date}.zip`)
      toast.show(`Exported ${formatBytes(blob.size)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy('')
    }
  }

  const doPush = async () => {
    setBusy('push')
    try {
      const { bytes } = await pushBackup()
      toast.show(`Backed up ${formatBytes(bytes)} to cloud`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed')
    } finally {
      setBusy('')
    }
  }

  const doPull = async () => {
    const ok = await confirm({
      title: 'Restore from cloud?',
      message: 'This replaces the library on this device with the cloud copy.',
      confirmLabel: 'Restore',
      danger: true,
    })
    if (!ok) return
    setBusy('pull')
    try {
      await pullBackup(true)
      toast.show('Library restored from cloud')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setBusy('')
    }
  }

  const checkDuplicates = async () => {
    const groups = await findDuplicateGroups()
    if (!groups.length) {
      toast.show('No duplicates found')
      return
    }
    const total = groups.reduce((n, g) => n + g.poems.length - 1, 0)
    toast.show(`${groups.length} duplicate groups (${total} extra copies)`)
    navigate('/duplicates')
  }

  const wipe = async () => {
    const ok = await confirm({
      title: 'Erase the whole library?',
      message: 'Every poem, image, and setting on this device will be deleted. Export a backup first if you want to keep a copy.',
      confirmLabel: 'Erase everything',
      danger: true,
    })
    if (!ok) return
    await resetDatabase()
    toast.show('Library erased')
    navigate('/')
  }

  return (
    <>
      <header className="appbar"><div className="appbar__title">Settings</div></header>
      <div className="shell">
        {/* ---------- Appearance ---------- */}
        <div className="section-head"><h2>Appearance</h2></div>
        <div className="switch-row">
          <span>Theme</span>
          <div className="chips">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button key={t} className={`chip ${settings.theme === t ? 'chip--active' : ''}`}
                onClick={() => void update({ theme: t })}>
                {t === 'light' ? <IconSun width={14} /> : t === 'dark' ? <IconMoon width={14} /> : null} {t}
              </button>
            ))}
          </div>
        </div>
        <div className="switch-row">
          <span>Urdu font</span>
          <div className="chips">
            {([['nastaliq', 'Nastaliq'], ['naskh', 'Naskh'], ['system', 'Device']] as const).map(([v, label]) => (
              <button key={v} className={`chip ${settings.urduFont === v ? 'chip--active' : ''}`}
                onClick={() => void update({ urduFont: v })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div className="row-flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span>Reader text size</span>
            <span className="badge">{settings.readerFontSize}px</span>
          </div>
          <input type="range" min={16} max={72} value={settings.readerFontSize}
            onChange={(e) => void update({ readerFontSize: Number(e.target.value) })} />
          <div className="urdu" style={{ fontSize: settings.readerFontSize, lineHeight: settings.readerLineHeight, marginTop: 10 }}>
            یا حسینؑ
          </div>
        </div>
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div className="row-flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span>Line spacing</span>
            <span className="badge">{settings.readerLineHeight.toFixed(1)}</span>
          </div>
          <input type="range" min={1.4} max={3} step={0.1} value={settings.readerLineHeight}
            onChange={(e) => void update({ readerLineHeight: Number(e.target.value) })} />
        </div>

        {/* ---------- Reading ---------- */}
        <div className="section-head"><h2>Reading</h2></div>
        <div className="switch-row">
          <div>
            <div>Keep screen awake</div>
            <div className="hint">Prevents the screen dimming while reciting.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={settings.keepAwake} onChange={(e) => void update({ keepAwake: e.target.checked })} />
            <span />
          </label>
        </div>
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div className="row-flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span>Auto-scroll speed</span>
            <span className="badge">{settings.autoScrollSpeed}</span>
          </div>
          <input type="range" min={10} max={100} value={settings.autoScrollSpeed}
            onChange={(e) => void update({ autoScrollSpeed: Number(e.target.value) })} />
        </div>

        {/* ---------- Library ---------- */}
        <div className="section-head"><h2>Library</h2></div>
        {stats && (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 16 }}>
            <Stat label="Poems" value={stats.poems} />
            <Stat label="Favourites" value={stats.favourites} />
            <Stat label="Images & PDFs" value={stats.media} />
            <Stat label="Storage" value={formatBytes(stats.bytes)} />
          </div>
        )}
        <div className="rows">
          <ActionRow
            icon={<IconUpload />}
            title="Import poems"
            sub="Paste text, bulk photos, or restore a backup"
            onClick={() => navigate('/import')}
            chevron
          />
          <ActionRow
            icon={<IconDownload />}
            title={busy === 'export' ? 'Exporting…' : 'Export library'}
            sub="Download a full .zip backup"
            onClick={doExport}
            disabled={busy === 'export'}
          />
          <ActionRow
            icon={<IconCopy />}
            title="Find duplicates"
            sub="Detect poems with identical text"
            onClick={checkDuplicates}
            chevron
          />
        </div>

        {/* ---------- Cloud ---------- */}
        <div className="section-head"><h2>Cloud backup</h2></div>
        <div className="field">
          <label>Sync endpoint (optional)</label>
          <input className="input" value={settings.syncEndpoint ?? ''} placeholder="https://…"
            onChange={(e) => void update({ syncEndpoint: e.target.value })} />
          <p className="hint">
            A URL that accepts <code>PUT</code> (upload) and <code>GET</code> (download) of a single
            file — e.g. a pre-signed S3 URL or your own small server. Leave blank to stay fully offline.
          </p>
        </div>
        {settings.syncEndpoint && (
          <div className="row-flex gap-3" style={{ marginBottom: 8 }}>
            <button className="btn btn--ghost btn--block" onClick={doPush} disabled={!!busy}>
              <IconCloud /> {busy === 'push' ? 'Backing up…' : 'Back up now'}
            </button>
            <button className="btn btn--ghost btn--block" onClick={doPull} disabled={!!busy}>
              {busy === 'pull' ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        )}
        {settings.lastBackupAt && (
          <p className="hint">Last backup: {new Date(settings.lastBackupAt).toLocaleString()}</p>
        )}

        {/* ---------- AI ---------- */}
        <div className="section-head"><h2>AI OCR correction</h2></div>
        <div className="field">
          <label>Correction endpoint (recommended)</label>
          <input className="input" value={settings.aiCorrectionEndpoint ?? ''} placeholder="https://your-proxy/correct"
            onChange={(e) => void update({ aiCorrectionEndpoint: e.target.value })} />
          <p className="hint">A small server you control that forwards to the Claude API. Keeps your API key off this device.</p>
        </div>
        <div className="field">
          <label>Claude API key (advanced)</label>
          <input className="input" type="password" value={settings.aiCorrectionKey ?? ''} placeholder="sk-ant-…"
            onChange={(e) => void update({ aiCorrectionKey: e.target.value })} autoComplete="off" />
          <p className="hint text-danger">
            Stored only in this browser. Anyone with access to this device could read it — prefer the endpoint above on shared devices.
          </p>
        </div>

        {/* ---------- Danger ---------- */}
        <div className="section-head"><h2>Danger zone</h2></div>
        <button className="btn btn--danger btn--block" onClick={wipe}>
          <IconTrash /> Erase entire library
        </button>

        <p className="hint center mt-5">
          Recitation · works offline · your data stays on your device
        </p>
      </div>
    </>
  )
}

/**
 * A tappable settings row. Deliberately a <div role="button"> rather than a
 * <button>: a native button establishes its own layout context in which the
 * flexible `.row__body` column collapses to zero width, hiding the label.
 */
function ActionRow({
  icon,
  title,
  sub,
  onClick,
  disabled,
  chevron,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  onClick: () => void | Promise<void>
  disabled?: boolean
  chevron?: boolean
}) {
  const activate = () => {
    if (!disabled) void onClick()
  }
  return (
    <div
      className="row"
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      style={disabled ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          activate()
        }
      }}
    >
      {icon}
      <div className="row__body">
        <div className="row__title">{title}</div>
        <div className="row__sub">{sub}</div>
      </div>
      {chevron && <IconChevron width={18} className="muted" />}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card" style={{ cursor: 'default', gap: 2, padding: 14 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div className="muted text-sm">{label}</div>
    </div>
  )
}
