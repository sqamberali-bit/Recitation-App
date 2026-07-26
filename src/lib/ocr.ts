/**
 * OCR via Tesseract.js — extracts text from uploaded/captured poem images.
 *
 * Language data (traineddata) and the wasm core are fetched from a CDN on the
 * first run and then cached by the service worker (see vite.config workbox
 * runtimeCaching), so subsequent OCR works offline. Urdu OCR quality is
 * limited; pair it with AI correction (see lib/ai.ts) for best results.
 */
import type { ImageLike, Worker } from 'tesseract.js'

export type OcrLang = 'urd' | 'ara' | 'eng' | 'urd+eng' | 'ara+eng'

export interface OcrProgress {
  status: string
  progress: number
}

let workerPromise: Promise<Worker> | null = null
let currentLangs = ''

async function getWorker(langs: OcrLang, onProgress?: (p: OcrProgress) => void): Promise<Worker> {
  const { createWorker } = await import('tesseract.js')
  // Re-create the worker when the requested language changes.
  if (workerPromise && currentLangs === langs) return workerPromise
  if (workerPromise) {
    const old = await workerPromise
    await old.terminate().catch(() => {})
  }
  currentLangs = langs
  workerPromise = createWorker(langs, 1, {
    logger: onProgress
      ? (m: { status: string; progress: number }) =>
          onProgress({ status: m.status, progress: m.progress })
      : undefined,
  })
  return workerPromise
}

export interface OcrResult {
  text: string
  confidence: number
}

/** Recognise text in an image. `image` may be a Blob, File, or data URL. */
export async function recognize(
  image: ImageLike,
  langs: OcrLang = 'urd+eng',
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  const worker = await getWorker(langs, onProgress)
  const { data } = await worker.recognize(image)
  return { text: data.text.trim(), confidence: data.confidence }
}

/** Free the OCR worker (call when leaving OCR-heavy screens to reclaim memory). */
export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return
  const w = await workerPromise
  await w.terminate().catch(() => {})
  workerPromise = null
  currentLangs = ''
}
