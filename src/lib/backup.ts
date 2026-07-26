/**
 * Cloud backup & cross-device transfer.
 *
 * v1 (implemented here) is "snapshot sync": the whole library is exported to a
 * zip and PUT to a user-configured endpoint (any storage that accepts an
 * authenticated PUT/GET of a single object — a personal WebDAV, an S3 pre-signed
 * URL, a tiny serverless function, etc.). `pull` fetches and restores it.
 *
 * This keeps the app backend-free by default while giving real off-device
 * backup for those who want it. True record-level, conflict-resolving multi-
 * device sync is a documented future step (see docs/SYNC.md) and would slot in
 * behind this same interface.
 */
import { exportLibrary, importLibrary } from './exportImport'
import { getSettings, saveSettings } from '@/db/repository'

export interface SyncTarget {
  endpoint: string
  apiKey?: string
}

async function resolveTarget(): Promise<SyncTarget | null> {
  const s = await getSettings()
  const endpoint = s.syncEndpoint?.trim()
  if (!endpoint) return null
  // Deliberately NOT the Claude key: sending an AI credential to the user's
  // storage endpoint would leak it to an unrelated third party.
  return { endpoint, apiKey: s.syncKey?.trim() || undefined }
}

/** Upload a full snapshot to the configured endpoint. */
export async function pushBackup(): Promise<{ bytes: number }> {
  const target = await resolveTarget()
  if (!target) throw new Error('No sync endpoint configured (set one in Settings).')
  const blob = await exportLibrary()
  const res = await fetch(target.endpoint, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/zip',
      ...(target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}),
    },
    body: blob,
  })
  if (!res.ok) throw new Error(`Backup upload failed (${res.status})`)
  await saveSettings({ lastBackupAt: Date.now() })
  return { bytes: blob.size }
}

/** Download the snapshot from the endpoint and restore it (replace mode). */
export async function pullBackup(replace = true): Promise<void> {
  const target = await resolveTarget()
  if (!target) throw new Error('No sync endpoint configured (set one in Settings).')
  const res = await fetch(target.endpoint, {
    method: 'GET',
    headers: { ...(target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}) },
  })
  if (!res.ok) throw new Error(`Backup download failed (${res.status})`)
  const blob = await res.blob()
  await importLibrary(blob, { replace })
}
