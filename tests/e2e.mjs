/**
 * End-to-end smoke test for the Recitation PWA.
 *
 * Exercises the real user journeys in a real browser: import, search (Urdu +
 * English), favourites, the reader (scrolling, font size, auto-scroll,
 * bookmarks), the editor, duplicate detection, theming, export, browse, the
 * service worker / OFFLINE mode, and the responsive desktop layout.
 *
 * Usage:
 *   npm run build && npm run preview   # in one terminal
 *   npm run test:e2e                   # in another
 */
import { chromium, devices } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const OUT = join(here, '..', 'test-results')
// Set E2E_CHROMIUM to override (e.g. when using a system Chrome).
const EXECUTABLE = process.env.E2E_CHROMIUM || undefined
const SAMPLE = join(here, '..', 'scripts', 'sample-poems.json')

await mkdir(OUT, { recursive: true })
const errors = []
const results = []

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {})
const ctx = await browser.newContext({ ...devices['Pixel 7'] })
const page = await ctx.newPage()

page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

// ---------- 1. Load ----------
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.appbar', { timeout: 10000 })
check('App loads and renders shell', await page.locator('.appbar__title').first().isVisible())
check('Empty state shown', (await page.locator('.empty').count()) > 0)

// ---------- 2. Seed data via the app's own import path ----------
const sample = JSON.parse(await readFile(SAMPLE, 'utf8'))
await page.goto(BASE + '/import', { waitUntil: 'networkidle' })
await page.locator('textarea').first().fill(JSON.stringify(sample))
await page.getByRole('button', { name: /Preview import/i }).click()
await page.waitForSelector('.rows .row', { timeout: 5000 })
check('Import preview parses JSON', (await page.locator('.rows .row').count()) > 0,
  `${await page.locator('.rows .row').count()} rows`)
await page.getByRole('button', { name: /Import \d+ poems/i }).click()
await page.waitForURL(BASE + '/', { timeout: 10000 })
await page.waitForSelector('.card', { timeout: 10000 })
const cardCount = await page.locator('.card').count()
check('Poems imported and listed', cardCount === sample.length, `${cardCount} cards (expected ${sample.length})`)

// ---------- 3. Urdu rendering + RTL ----------
const urduCard = page.locator('.card__title--urdu').first()
check('Urdu title renders RTL', await urduCard.count() > 0 && (await urduCard.getAttribute('dir')) === 'rtl')

// ---------- 4. Search (Urdu) ----------
await page.locator('input[type="search"]').fill('حسین')
await page.waitForTimeout(600)
const urduHits = await page.locator('.card').count()
check('Urdu search returns results', urduHits > 0 && urduHits < sample.length, `${urduHits} hits`)

// ---------- 5. Search (English) ----------
await page.locator('input[type="search"]').fill('standard')
await page.waitForTimeout(600)
const enHits = await page.locator('.card').count()
check('English search returns results', enHits > 0, `${enHits} hits`)

// ---------- 6. Search across full poem text (not just title) ----------
await page.locator('input[type="search"]').fill('Abbas')
await page.waitForTimeout(600)
check('Full-text search matches body', (await page.locator('.card').count()) > 0)

await page.locator('input[type="search"]').fill('')
await page.waitForTimeout(400)

// ---------- 7. Favourite toggle ----------
await page.locator('.card').first().locator('button[aria-label*="favourite" i]').click()
await page.waitForTimeout(500)
await page.goto(BASE + '/favourites', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
check('Favourite persists to Favourites page', (await page.locator('.card').count()) === 1)

// ---------- 8. Reader ----------
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('.card')
// Target a known Urdu poem so font/RTL assertions are deterministic.
await page.locator('input[type="search"]').fill('حسین')
await page.waitForTimeout(600)
await page.locator('.card').first().click()
await page.waitForSelector('.reader__body', { timeout: 8000 })
check('Reader opens', await page.locator('.reader__body').isVisible())

// Verify the reader scroll container is actually scrollable (CSS height bug check)
const scrollInfo = await page.evaluate(() => {
  const el = document.querySelector('.reader__scroll')
  if (!el) return null
  return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, canScroll: el.scrollHeight > el.clientHeight + 5 }
})
check('Reader scroll container is scrollable', !!scrollInfo && scrollInfo.canScroll,
  scrollInfo ? `scrollH=${scrollInfo.scrollHeight} clientH=${scrollInfo.clientHeight}` : 'no element')

// Font size control
const before = await page.locator('.fontval').textContent()
await page.locator('button[aria-label="Larger text"]').click()
await page.waitForTimeout(300)
const after = await page.locator('.fontval').textContent()
check('Font size increases', Number(after) > Number(before), `${before} -> ${after}`)

// Font size actually applied to body
const fontPx = await page.locator('.reader__body').evaluate((el) => getComputedStyle(el).fontSize)
check('Font size applied to verse text', parseFloat(fontPx) === Number(after), `computed ${fontPx}`)

// Urdu font family actually applied
const fam = await page.locator('.reader__body').evaluate((el) => getComputedStyle(el).fontFamily)
check('Urdu font family applied in reader', /Nastaliq|Naskh/i.test(fam), fam.slice(0, 60))

// Auto-scroll moves the container
const startTop = await page.locator('.reader__scroll').evaluate((el) => el.scrollTop)
await page.locator('button[aria-label*="auto-scroll" i]').first().click()
await page.waitForTimeout(1800)
const midTop = await page.locator('.reader__scroll').evaluate((el) => el.scrollTop)
check('Auto-scroll advances the page', midTop > startTop, `${startTop} -> ${midTop}`)
await page.locator('button[aria-label*="auto-scroll" i]').first().click()

// Bookmark round-trip (same poem, reopened by URL)
const readerUrl = page.url()
await page.locator('.reader__scroll').evaluate((el) => {
  el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.5
})
await page.waitForTimeout(1200)
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.goto(readerUrl, { waitUntil: 'networkidle' })
await page.waitForSelector('.reader__body')
await page.waitForTimeout(1000)
check('Resume-from-bookmark offered', (await page.locator('.resume-pill').count()) > 0)
if (await page.locator('.resume-pill').count()) {
  await page.locator('.resume-pill').click()
  await page.waitForTimeout(600)
  const resumed = await page.locator('.reader__scroll').evaluate((el) => el.scrollTop)
  check('Resume jumps to saved position', resumed > 20, `scrollTop=${resumed}`)
}
await page.screenshot({ path: `${OUT}/shot-reader.png` })

// ---------- 9. Editor: create a poem ----------
await page.goto(BASE + '/editor/new', { waitUntil: 'networkidle' })
await page.waitForSelector('.textarea')
await page.locator('textarea').first().fill('میرا نیا نوحہ\nدوسری سطر یہاں ہے')
await page.locator('input.input').first().fill('Test Noha')
await page.getByRole('button', { name: /^Add to library$/ }).click()
await page.waitForURL(/\/poem\//, { timeout: 8000 })
check('New poem saves and opens in reader', page.url().includes('/poem/'))

// ---------- 10. Duplicate detection ----------
await page.goto(BASE + '/editor/new', { waitUntil: 'networkidle' })
await page.locator('textarea').first().fill('میرا نیا نوحہ\nدوسری سطر یہاں ہے')
await page.waitForTimeout(800)
check('Duplicate warning appears', (await page.getByText(/Possible duplicate/i).count()) > 0)

// ---------- 11. Tag input ----------
await page.goto(BASE + '/editor/new', { waitUntil: 'networkidle' })
const tagInputs = page.locator('.field input.input')
const tagField = tagInputs.nth(await tagInputs.count() - 3)
await tagField.fill('testtag')
await tagField.press('Enter')
await page.waitForTimeout(300)
check('Tag chip is added', (await page.getByText('testtag').count()) > 0)

// ---------- 12. Dark mode ----------
await page.goto(BASE + '/settings', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^dark$/i }).click()
await page.waitForTimeout(500)
const themeAttr = await page.evaluate(() => document.documentElement.dataset.theme)
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
check('Dark mode applies', themeAttr === 'dark' && bg !== 'rgb(244, 245, 247)', `theme=${themeAttr} bg=${bg}`)
await page.screenshot({ path: `${OUT}/shot-settings-dark.png` })

// Theme persists across reload
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
check('Theme persists after reload', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark')

// ---------- 13. Export ----------
const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
await page.getByText(/Export library/i).click()
const download = await dl
check('Export produces a backup file', !!download, download ? await download.suggestedFilename() : 'no download')

// ---------- 14. Browse ----------
await page.goto(BASE + '/browse', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Authors$/ }).click()
await page.waitForTimeout(500)
check('Authors listed in Browse', (await page.locator('.row').count()) > 0)
await page.locator('.row').first().click()
await page.waitForURL(/browse\/results/, { timeout: 5000 })
await page.waitForTimeout(500)
check('Author drill-down shows poems', (await page.locator('.card').count()) > 0)

// ---------- 15. Offline (service worker) ----------
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500) // let SW install & precache
const swReady = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration()
  return !!reg && !!navigator.serviceWorker.controller
})
check('Service worker registered & controlling', swReady)

await ctx.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
const offlineOk = await page.locator('.card').count()
check('App works OFFLINE with data intact', offlineOk > 0, `${offlineOk} cards offline`)
await page.screenshot({ path: `${OUT}/shot-offline.png` })
await ctx.setOffline(false)

// ---------- 16. Desktop layout ----------
const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const dpage = await dctx.newPage()
dpage.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message))
await dpage.goto(BASE + '/', { waitUntil: 'networkidle' })
await dpage.waitForTimeout(1200)
const sidebarVisible = await dpage.locator('.sidebar').isVisible()
const bottomNavVisible = await dpage.locator('.bottomnav').isVisible()
check('Desktop shows sidebar, hides bottom nav', sidebarVisible && !bottomNavVisible,
  `sidebar=${sidebarVisible} bottomnav=${bottomNavVisible}`)
await dpage.screenshot({ path: `${OUT}/shot-desktop.png` })

// ---------- 17. Manifest ----------
const manifest = await (await fetch(BASE + '/manifest.webmanifest')).json()
check('Manifest is installable', !!manifest.name && manifest.icons?.length >= 2 && manifest.display === 'standalone')

await browser.close()

console.log('\n===== SUMMARY =====')
const failed = results.filter((r) => !r.ok)
console.log(`${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log('\nFAILED:')
  failed.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`))
}
const realErrors = errors.filter((e) => !/favicon|404|Failed to load resource/i.test(e))
if (realErrors.length) {
  console.log('\nCONSOLE ERRORS:')
  ;[...new Set(realErrors)].slice(0, 15).forEach((e) => console.log('  ! ' + e.slice(0, 220)))
}
process.exit(failed.length ? 1 : 0)
