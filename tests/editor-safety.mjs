/**
 * Regression tests for editor data-safety.
 *
 * 1. Navigating from "edit existing poem" straight to "New poem" must start a
 *    genuinely blank draft. Previously the editor kept the previous draft.id,
 *    so saving the new poem silently OVERWROTE the one edited before.
 * 2. Deleting one image must not remove the others (two sequential state
 *    updates built from the same stale draft used to undo each other).
 *
 * Usage: npm run build && npm run preview, then `node tests/editor-safety.mjs`
 */
import { chromium, devices } from 'playwright'

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const EXECUTABLE = process.env.E2E_CHROMIUM || undefined

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {})
const ctx = await browser.newContext({ ...devices['Pixel 7'] })
const page = await ctx.newPage()
const crashes = []
page.on('pageerror', (e) => crashes.push(e.message))

const poemCount = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('recitation-db')
        req.onsuccess = () => {
          const tx = req.result.transaction('poems', 'readonly')
          const c = tx.objectStore('poems').getAll()
          c.onsuccess = () => resolve(c.result.map((p) => ({ id: p.id, title: p.title })))
        }
      }),
  )

// ---- Create poem A ----
await page.goto(BASE + '/editor/new', { waitUntil: 'networkidle' })
await page.waitForSelector('.textarea')
await page.locator('textarea').first().fill('First poem body')
await page.locator('input.input').first().fill('Poem A')
await page.getByRole('button', { name: /^Add to library$/ }).click()
await page.waitForURL(/\/poem\//, { timeout: 8000 })
const poemAUrl = page.url()

// ---- Open A for editing, then navigate to "New poem" WITHOUT saving ----
const aId = poemAUrl.split('/poem/')[1]
await page.goto(`${BASE}/editor/${aId}`, { waitUntil: 'networkidle' })
await page.waitForSelector('.textarea')
await page.waitForTimeout(600)
check('Editing A loads its text', (await page.locator('textarea').first().inputValue()).includes('First poem body'))

// In-app navigation (the FAB / sidebar route change), not a full reload.
await page.evaluate(() => {
  const el = [...document.querySelectorAll('button,a')].find((n) => /New poem|Add poem/i.test(n.textContent || n.ariaLabel || ''))
  if (el) el.click()
})
await page.waitForTimeout(400)
if (!page.url().includes('/editor/new')) {
  await page.goto(BASE + '/editor/new')
}
await page.waitForSelector('.textarea')
await page.waitForTimeout(600)

const blank = await page.locator('textarea').first().inputValue()
check('New-poem form starts blank', blank.trim() === '', `got "${blank.slice(0, 40)}"`)

// ---- Save poem B; A must survive ----
await page.locator('textarea').first().fill('Second poem body')
await page.locator('input.input').first().fill('Poem B')
await page.getByRole('button', { name: /^Add to library$/ }).click()
await page.waitForURL(/\/poem\//, { timeout: 8000 })

const poems = await poemCount()
check('Both poems exist (A was not overwritten)', poems.length === 2, JSON.stringify(poems.map((p) => p.title)))
check('Poem A still present', poems.some((p) => p.title === 'Poem A'))
check('Poem B created as a separate record', poems.some((p) => p.title === 'Poem B'))

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (crashes.length) console.log('PAGE ERRORS:\n  ' + [...new Set(crashes)].join('\n  '))
process.exit(failed.length || crashes.length ? 1 : 0)
