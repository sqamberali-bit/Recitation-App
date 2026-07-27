# Cloudflare Sync Worker Setup

One-time setup to enable cross-device sync for your Recitation library.

## Prerequisites

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Node.js 18+

## Steps

### 1. Install dependencies

```bash
cd sync-worker
npm install
```

### 2. Create the D1 database

```bash
npx wrangler d1 create recitation-sync
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
database_id = "your-actual-database-id"
```

### 3. Create the R2 bucket (for future media sync)

```bash
npx wrangler r2 bucket create recitation-media
```

### 4. Initialize the database schema

```bash
npx wrangler d1 execute recitation-sync --file=schema.sql
```

### 5. Set your secret sync token

Pick any strong password/passphrase:

```bash
npx wrangler secret put SYNC_TOKEN
```

Type your chosen token when prompted. **Remember it** — you'll enter it in the app's Settings.

### 6. Deploy

```bash
npx wrangler deploy
```

Note the Worker URL (e.g. `https://recitation-sync.your-account.workers.dev`).

### 7. Configure the app

In the Recitation app, go to **Settings → Cloud sync**:

- **Sync endpoint**: paste the Worker URL
- **Sync token**: enter the same token from step 5

Click **Sync now** to push your library to the cloud.

### 8. Set up your second device

On your phone/other browser, open the app and go to **Settings → Cloud sync**.
Enter the same endpoint and token, then click **Sync now** to pull the library.

## How it works

- **Last-write-wins**: when the same poem is edited on two devices, the most recent edit wins.
- **Offline-first**: the app works fully offline. Sync happens on app launch, when you go online, and every 5 minutes.
- **Tombstones**: deleted poems are tracked so the deletion propagates to other devices.
- **Bearer token auth**: only requests with your secret token can read/write.

## Costs

Everything fits in Cloudflare's **free tier**:
- Workers: 100k requests/day
- D1: 5 GB storage, 5M reads/day
- R2: 10 GB storage, 10M reads/month
