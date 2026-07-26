/**
 * Client-side image processing: generates thumbnails and (optionally)
 * downscales very large phone photos before they're stored, so the offline
 * library stays compact. Runs entirely in the browser — no upload.
 */
import { newId } from './id'
import type { MediaAsset } from '@/types'

const MAX_STORE_DIMENSION = 2400 // cap the longest edge of stored originals
const THUMB_DIMENSION = 480
const THUMB_QUALITY = 0.72
const STORE_QUALITY = 0.85

interface DecodedImage {
  bitmap: ImageBitmap
  width: number
  height: number
}

async function decode(file: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file)
  return { bitmap, width: bitmap.width, height: bitmap.height }
}

function makeCanvas(w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable')
    return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  return { canvas, ctx }
}

async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality })
  }
  return new Promise((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      type,
      quality,
    )
  })
}

function fit(width: number, height: number, max: number): { w: number; h: number } {
  if (width <= max && height <= max) return { w: width, h: height }
  const scale = max / Math.max(width, height)
  return { w: Math.round(width * scale), h: Math.round(height * scale) }
}

/**
 * Turn a picked/captured image file into a stored MediaAsset (original +
 * thumbnail + dimensions). Non-raster files (or decode failures) fall back to
 * storing the raw blob with no thumbnail so nothing is ever lost.
 */
export async function processImageFile(
  file: File | Blob,
  poemId: string,
  order: number,
): Promise<MediaAsset> {
  const name = 'name' in file ? file.name : undefined
  const base: Omit<MediaAsset, 'blob' | 'thumbnail' | 'width' | 'height' | 'size'> = {
    id: newId('img'),
    poemId,
    type: 'image',
    mime: file.type || 'image/jpeg',
    name,
    order,
    createdAt: Date.now(),
  }

  try {
    const { bitmap, width, height } = await decode(file)

    // Downscale the stored original if it's enormous (typical phone photo).
    let storeBlob: Blob = file
    let outW = width
    let outH = height
    if (Math.max(width, height) > MAX_STORE_DIMENSION) {
      const { w, h } = fit(width, height, MAX_STORE_DIMENSION)
      const { canvas, ctx } = makeCanvas(w, h)
      ctx.drawImage(bitmap, 0, 0, w, h)
      storeBlob = await canvasToBlob(canvas, 'image/jpeg', STORE_QUALITY)
      outW = w
      outH = h
    }

    // Thumbnail.
    const { w: tw, h: th } = fit(width, height, THUMB_DIMENSION)
    const { canvas: tCanvas, ctx: tCtx } = makeCanvas(tw, th)
    tCtx.drawImage(bitmap, 0, 0, tw, th)
    const thumbnail = await canvasToBlob(tCanvas, 'image/jpeg', THUMB_QUALITY)
    bitmap.close?.()

    return {
      ...base,
      mime: storeBlob.type || base.mime,
      blob: storeBlob,
      thumbnail,
      width: outW,
      height: outH,
      size: storeBlob.size,
    }
  } catch {
    // Could not decode (e.g. HEIC on an unsupported browser) — keep the raw file.
    return { ...base, blob: file, size: file.size }
  }
}

/** Wrap a picked PDF file as a MediaAsset. */
export function makePdfAsset(file: File, poemId: string, order: number): MediaAsset {
  return {
    id: newId('pdf'),
    poemId,
    type: 'pdf',
    mime: file.type || 'application/pdf',
    name: file.name,
    blob: file,
    size: file.size,
    order,
    createdAt: Date.now(),
  }
}

/**
 * Create and track an object URL, returning a disposer. Callers must revoke to
 * avoid leaks (the reader/gallery do this in effect cleanups).
 */
export function objectUrl(blob: Blob): { url: string; revoke: () => void } {
  const url = URL.createObjectURL(blob)
  return { url, revoke: () => URL.revokeObjectURL(url) }
}
