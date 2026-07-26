/**
 * Regression test: importing JSON whose array fields are malformed (a bare
 * string instead of an array) must not corrupt the library or crash the app.
 *
 * Before the input was sanitised, this wrote `tags: "karbala"` into IndexedDB;
 * the search-index rebuild then threw `p.tags.join is not a function` on every
 * load, leaving the app permanently stuck on the error screen.
 *
 * Usage: npm run build && npm run preview, then `node tests/malformed-import.mjs`
 */
import { chromium, devices } from 'playwright'

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const EXECUTABLE = process.env.E2E_CHROMIUM || undefined

const MALFORMED = [
  { title: 'Bad tags', text: 'یا حسین', tags: 'karbala' },
  { title: 'Bad topics', text: 'second poem', topics: 'sabr', occasions: null },
  { title: 'Bad everything', text: 'third poem', tags: null, topics: 42, occasions: { a: 1 } },
]

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

await page.goto(BASE + '/import', { waitUntil: 'networkidle' })
await page.locator('textarea').first().fill(JSON.stringify(MALFORMED))
await page.getByRole('button', { name: /Preview import/i }).click()
await page.waitForSelector('.rows .row', { timeout: 5000 })
await page.getByRole('button', { name: /Import \d+ poems/i }).click()
await page.waitForURL(BASE + '/', { timeout: 10000 })
await page.waitForTimeout(1500)

check('Library renders after malformed import', (await page.locator('.card').count()) === MALFORMED.length,
  `${await page.locator('.card').count()} cards`)
check('No crash screen', (await page.getByText(/Something went wrong/i).count()) === 0)

// Reload — this is where the original bug became unrecoverable.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
check('Library still renders after reload', (await page.locator('.card').count()) === MALFORMED.length)

// Search must work (it consumes the tag fields).
await page.locator('input[type="search"]').fill('karbala')
await page.waitForTimeout(700)
check('Search works over repaired tags', (await page.locator('.card').count()) > 0,
  `${await page.locator('.card').count()} hits`)

// Browse reads the same fields to build facets.
await page.goto(BASE + '/browse', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Tags$/ }).click()
await page.waitForTimeout(600)
check('Browse facets render', (await page.getByText(/Something went wrong/i).count()) === 0)

// Verify the stored value was actually coerced to an array.
const stored = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open('recitation-db')
      req.onsuccess = () => {
        const tx = req.result.transaction('poems', 'readonly')
        const all = tx.objectStore('poems').getAll()
        all.onsuccess = () =>
          resolve(all.result.map((p) => ({ tags: p.tags, topics: p.topics, occasions: p.occasions })))
      }
    }),
)
const allArrays = stored.every(
  (p) => Array.isArray(p.tags) && Array.isArray(p.topics) && Array.isArray(p.occasions),
)
check('All list fields stored as arrays', allArrays, JSON.stringify(stored))

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (crashes.length) console.log('PAGE ERRORS:\n  ' + [...new Set(crashes)].join('\n  '))
process.exit(failed.length || crashes.length ? 1 : 0)
