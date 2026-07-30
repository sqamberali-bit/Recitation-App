import { db } from '@/db/database'
import { getSettings, saveSettings } from '@/db/repository'
import type { Poem, Author, Collection, MediaAsset } from '@/types'

interface SyncRecord {
  id: string
  data: string
  updatedAt: number
  deletedAt?: number
}

interface SyncResponse {
  poems: SyncRecord[]
  authors: SyncRecord[]
  collections: SyncRecord[]
  serverTime: number
}

export interface SyncResult {
  pushed: { poems: number; authors: number; collections: number }
  pulled: { poems: number; authors: number; collections: number }
  deleted: number
}

const ENV_ENDPOINT = import.meta.env.VITE_SYNC_ENDPOINT as string | undefined
const ENV_TOKEN = import.meta.env.VITE_SYNC_TOKEN as string | undefined

async function getConfig(): Promise<{ endpoint: string; token: string } | null> {
  const s = await getSettings()
  const endpoint = (s.syncEndpoint ?? ENV_ENDPOINT ?? '').trim()
  const token = (s.syncKey ?? ENV_TOKEN ?? '').trim()
  if (!endpoint || !token) return null
  return { endpoint: endpoint.replace(/\/$/, ''), token }
}

export async function syncNow(): Promise<SyncResult> {
  const config = await getConfig()
  if (!config) throw new Error('Sync not configured. Set endpoint and token in Settings.')

  const settings = await getSettings()
  const since = settings.lastSyncAt ?? 0

  const [localPoems, localAuthors, localCollections, tombstones] = await Promise.all([
    db.poems.where('updatedAt').above(since).toArray(),
    db.authors.where('updatedAt').above(since).toArray(),
    db.collections.where('updatedAt').above(since).toArray(),
    db.tombstones.toArray(),
  ])

  const poemRecords: SyncRecord[] = localPoems.map(poemToRecord)
  const authorRecords: SyncRecord[] = localAuthors.map(authorToRecord)
  const collectionRecords: SyncRecord[] = localCollections.map(collectionToRecord)

  for (const t of tombstones) {
    const rec: SyncRecord = { id: t.id, data: '{}', updatedAt: t.deletedAt, deletedAt: t.deletedAt }
    if (t.table === 'poems') poemRecords.push(rec)
    else if (t.table === 'authors') authorRecords.push(rec)
    else if (t.table === 'collections') collectionRecords.push(rec)
  }

  const res = await fetch(`${config.endpoint}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      since,
      poems: poemRecords,
      authors: authorRecords,
      collections: collectionRecords,
    }),
  })

  if (!res.ok) {
    if (res.status === 401) throw new Error('Sync authentication failed. Check your token in Settings.')
    throw new Error(`Sync failed (${res.status})`)
  }

  const body = (await res.json()) as SyncResponse
  let deleted = 0

  await db.transaction('rw', db.poems, db.authors, db.collections, db.media, db.tombstones, async () => {
    for (const r of body.poems) {
      if (r.deletedAt) {
        await db.media.where('poemId').equals(r.id).delete()
        await db.poems.delete(r.id)
        deleted++
      } else {
        const remote = JSON.parse(r.data) as Poem
        const local = await db.poems.get(r.id)
        if (!local || remote.updatedAt > local.updatedAt) {
          await db.poems.put(remote)
        }
      }
    }

    for (const r of body.authors) {
      if (r.deletedAt) {
        await db.authors.delete(r.id)
        deleted++
      } else {
        const remote = JSON.parse(r.data) as Author
        const local = await db.authors.get(r.id)
        if (!local || remote.updatedAt > local.updatedAt) {
          await db.authors.put(remote)
        }
      }
    }

    for (const r of body.collections) {
      if (r.deletedAt) {
        await db.collections.delete(r.id)
        deleted++
      } else {
        const remote = JSON.parse(r.data) as Collection
        const local = await db.collections.get(r.id)
        if (!local || remote.updatedAt > local.updatedAt) {
          await db.collections.put(remote)
        }
      }
    }

    await db.tombstones.clear()
  })

  await saveSettings({ lastSyncAt: body.serverTime } as any)

  try {
    await syncMedia(config, settings)
  } catch {
    // media sync is best-effort
  }

  return {
    pushed: {
      poems: localPoems.length,
      authors: localAuthors.length,
      collections: localCollections.length,
    },
    pulled: {
      poems: body.poems.filter((r) => !r.deletedAt).length,
      authors: body.authors.filter((r) => !r.deletedAt).length,
      collections: body.collections.filter((r) => !r.deletedAt).length,
    },
    deleted,
  }
}

async function syncMedia(
  config: { endpoint: string; token: string },
  settings: any,
) {
  const mediaSince: number = (settings as any).lastMediaSyncAt ?? 0

  const newMedia = await db.media.where('createdAt').above(mediaSince).toArray()
  let allUploaded = true
  for (const m of newMedia) {
    try {
      const r = await fetch(`${config.endpoint}/api/media/${encodeURIComponent(m.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': m.mime || 'application/octet-stream',
          Authorization: `Bearer ${config.token}`,
        },
        body: m.blob,
      })
      if (!r.ok) allUploaded = false
    } catch {
      allUploaded = false
    }
  }

  const localMediaIds = new Set(await db.media.toCollection().primaryKeys())
  const poems = await db.poems.toArray()
  for (const p of poems) {
    const imgIds: string[] = p.imageIds || []
    const pdfIdsList: string[] = p.pdfIds || []
    for (const mid of [...imgIds, ...pdfIdsList]) {
      if (localMediaIds.has(mid)) continue
      try {
        const r = await fetch(`${config.endpoint}/api/media/${encodeURIComponent(mid)}`, {
          headers: { Authorization: `Bearer ${config.token}` },
        })
        if (!r.ok) continue
        const blob = await r.blob()
        const asset: MediaAsset = {
          id: mid,
          poemId: p.id,
          type: imgIds.includes(mid) ? 'image' : 'pdf',
          mime: r.headers.get('Content-Type') || 'application/octet-stream',
          name: mid,
          blob,
          size: blob.size,
          order: imgIds.includes(mid) ? imgIds.indexOf(mid) : pdfIdsList.indexOf(mid),
          createdAt: Date.now(),
        }
        await db.media.put(asset)
        localMediaIds.add(mid)
      } catch { /* skip */ }
    }
  }

  if (allUploaded || !newMedia.length) {
    await saveSettings({ lastMediaSyncAt: Date.now() } as any)
  }
}

function poemToRecord(p: Poem): SyncRecord {
  return { id: p.id, data: JSON.stringify(p), updatedAt: p.updatedAt }
}

function authorToRecord(a: Author): SyncRecord {
  return { id: a.id, data: JSON.stringify(a), updatedAt: a.updatedAt }
}

function collectionToRecord(c: Collection): SyncRecord {
  return { id: c.id, data: JSON.stringify(c), updatedAt: c.updatedAt }
}

export async function isSyncConfigured(): Promise<boolean> {
  const config = await getConfig()
  return config !== null
}

let autoSyncTimer: ReturnType<typeof setTimeout> | null = null

export function startAutoSync(intervalMs = 5 * 60 * 1000): void {
  stopAutoSync()
  const run = async () => {
    try {
      if (await isSyncConfigured()) await syncNow()
    } catch {
      // auto-sync failures are silent
    }
  }
  setTimeout(run, 3000)
  autoSyncTimer = setInterval(run, intervalMs)

  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void run()
  })
}

export function stopAutoSync(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }
}
