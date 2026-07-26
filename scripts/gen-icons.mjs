// Generates all PWA raster icons from public/icons/icon.svg using sharp.
// Run with: npm run gen:icons
import sharp from 'sharp'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(here, '..', 'public', 'icons')

const teal = { r: 15, g: 118, b: 110, alpha: 1 }

async function main() {
  await mkdir(iconsDir, { recursive: true })
  const svg = await readFile(join(iconsDir, 'icon.svg'))

  // Standard "any" icons — transparent background, full-bleed art.
  for (const size of [192, 512]) {
    await sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(iconsDir, `icon-${size}.png`))
  }

  // Maskable icons — art inset to ~80% inside a solid safe-zone background so
  // launchers can crop to circle/squircle without clipping the artwork.
  for (const size of [192, 512]) {
    const inner = Math.round(size * 0.72)
    const pad = Math.round((size - inner) / 2)
    const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()
    await sharp({ create: { width: size, height: size, channels: 4, background: teal } })
      .composite([{ input: art, top: pad, left: pad }])
      .png()
      .toFile(join(iconsDir, `maskable-${size}.png`))
  }

  // Apple touch icon (no transparency — iOS ignores alpha and adds its own mask).
  await sharp({ create: { width: 180, height: 180, channels: 4, background: teal } })
    .composite([{ input: await sharp(svg, { density: 384 }).resize(150, 150).png().toBuffer(), top: 15, left: 15 }])
    .png()
    .toFile(join(iconsDir, 'apple-touch-icon.png'))

  // Favicon (48px PNG stored with .ico name — browsers accept PNG bytes here).
  const favicon = await sharp(svg, { density: 256 }).resize(48, 48).png().toBuffer()
  await writeFile(join(iconsDir, 'favicon.ico'), favicon)

  console.log('✓ Generated PWA icons in public/icons/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
