# Backup and cross-device sync

The app stores everything locally and needs no server. These options exist for **off-device
backup** and for **moving your library between devices**.

## What's built in

### 1. Manual export / import (always available, no setup)

**Settings → Export library** downloads a single `.zip` containing every poem, author,
collection, image, PDF, and your settings. **Settings → Import poems → Restore backup** reads it
back on any device.

The archive layout is deliberately simple and future-proof:

```
recitation-backup-YYYY-MM-DD.zip
├─ library.json          all records + media metadata
└─ media/
   ├─ <mediaId>          original image/PDF bytes
   └─ <mediaId>.thumb    JPEG thumbnail (images only)
```

`library.json` carries a `version` field so future releases can migrate old archives. Your Claude
API key is stripped from exports.

This is the recommended backup habit: export to your cloud drive of choice every so often.

### 2. Snapshot cloud backup (optional endpoint)

Set **Settings → Cloud backup → Sync endpoint** to any URL that supports:

- `PUT` with a `application/zip` body → store the snapshot
- `GET` → return the stored snapshot

Then **Back up now** uploads, and **Restore** pulls it down and replaces the local library.

If your endpoint needs authentication, set a **Sync access token** (it appears once an endpoint
is configured). It is sent as `Authorization: Bearer <token>` **to that endpoint only**. This is
deliberately separate from the Claude API key — an AI credential must never be sent to your
storage provider.

Exported backups never contain your sync endpoint, AI endpoint, or any key, so a backup shared
with family cannot leak them.

**Important:** this is *snapshot* sync, not merge sync. Restoring replaces the device's library
with the cloud copy. Use it as backup + device transfer, and avoid editing on two devices
between backups.

## Endpoint options

### S3 (or any S3-compatible store) pre-signed URLs

Generate a long-lived pre-signed URL that permits `GET` and `PUT` on one object key. Simple, no
server to run. Rotate the URL when it expires.

### Cloudflare R2 + Worker

```js
export default {
  async fetch(request, env) {
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${env.SHARED_SECRET}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const key = 'library.zip'

    if (request.method === 'PUT') {
      await env.BUCKET.put(key, request.body)
      return new Response('ok')
    }

    if (request.method === 'GET') {
      const obj = await env.BUCKET.get(key)
      if (!obj) return new Response('Not found', { status: 404 })
      return new Response(obj.body, {
        headers: { 'Content-Type': 'application/zip' },
      })
    }

    return new Response('Method not allowed', { status: 405 })
  },
}
```

Remember to allow your app's origin in CORS, including the `Authorization` header and the `PUT`
method on preflight.

### WebDAV (Nextcloud, ownCloud)

Point the endpoint at a file URL in your WebDAV space. Most servers accept `PUT`/`GET` directly;
you may need to configure CORS.

## Roadmap: true multi-device sync

Record-level sync with conflict resolution is the natural next step. The design the codebase is
prepared for:

1. Add `updatedAt` (already present) plus a `deletedAt` tombstone to each record.
2. Give each device a stable `deviceId`; track a `lastSyncedAt` watermark.
3. Push records changed since the watermark; pull the server's changes since it.
4. Resolve conflicts last-writer-wins per field, with media treated as immutable
   (content-addressed by ID, so blobs never conflict — only their references do).

`src/lib/backup.ts` deliberately exposes a narrow `push`/`pull` interface so this can be
implemented behind it without touching any UI code.

## Privacy

Nothing leaves your device unless you configure an endpoint. There is no telemetry, no analytics,
and no third-party requests at runtime — fonts and icons are bundled into the app, and the only
optional outbound calls are the ones you explicitly configure (OCR language data on first OCR
run, your correction endpoint, and your backup endpoint).
