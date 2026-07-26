# Deploying to Cloudflare Pages

The app is a static bundle, so hosting it is free and takes a few minutes. Once it's live you
open the URL on your phone once, add it to the home screen, and it works offline from then on.

Everything Cloudflare needs is already in the repo:

| File | Purpose |
|---|---|
| `public/_redirects` | SPA fallback so deep links like `/poem/<id>` load instead of 404ing |
| `public/_headers` | Caches hashed assets forever, keeps the service worker uncached so updates land |
| `.node-version` | Pins the build to Node 22 |

## One-time setup

1. Go to **[dash.cloudflare.com](https://dash.cloudflare.com)** → **Workers & Pages** → **Create**
   → **Pages** → **Connect to Git**. Create a free account if you don't have one.
2. Authorise GitHub and pick the **Recitation-App** repository.
3. Set the build configuration:

   | Setting | Value |
   |---|---|
   | Production branch | `claude/urdu-poetry-library-app-am3y68` (or `main` once merged) |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

4. Click **Save and Deploy**. The first build takes 2–3 minutes.

You'll get a URL like `https://recitation-app.pages.dev`. Every push to that branch rebuilds and
redeploys automatically — no further action needed.

> Prefer a private site? Cloudflare Pages has **Access** policies (Workers & Pages → your project
> → Settings → Access policy) that put an email login in front of the site, free for up to 50
> users. The app itself contains no personal data, but this is there if you want it.

## Installing on your phone

**Android (Chrome):** open the URL → a install prompt appears, or use ⋮ → **Add to Home screen**.

**iPhone (Safari — must be Safari, not Chrome):** open the URL → tap the Share button → scroll
down → **Add to Home Screen**.

The icon then launches full-screen with no browser chrome, and works with no internet.

## Verifying it worked

1. Open the site, add a poem, then turn on aeroplane mode and reopen it — the poem should still
   be there and the app should still load.
2. Open a poem directly by URL (e.g. paste a `/poem/<id>` link) — it should load the poem, not a
   404. If it 404s, the build output directory is wrong or `_redirects` didn't ship.

## A note on your library and devices

Poems are stored **on each device**, in that browser's storage — not on Cloudflare. Deploying
publishes the app, not your poems, so a public URL never exposes your library.

The flip side: your phone and your laptop each keep their own copy. To share a library between
them use **Settings → Export library** and import the `.zip` on the other device, or configure a
sync endpoint (see [SYNC.md](SYNC.md)).

Two things worth doing early:

- **Export a backup** once you've imported your OneNote content, and keep it in your cloud drive.
  Browser storage is durable but not indestructible — clearing site data erases the library.
- On iOS, open the app from the home-screen icon every so often. Safari can evict storage for
  web apps that go unused for many weeks; regular use and having it installed both protect it.

## Updating

Push to the production branch and Cloudflare rebuilds. Open tabs pick up the new version on next
launch; the app handles a mid-session deploy by reloading rather than erroring.
