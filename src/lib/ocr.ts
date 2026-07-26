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
/** Serialises worker creation so overlapping OCR runs can't spawn duplicates. */
let workerLock: Promise<unknown> = Promise.resolve()
/** Live progress sink — reassigned per run, so later runs still report progress. */
let progressSink: ((p: OcrProgress) => void) | undefined

async function getWorker(langs: OcrLang): Promise<Worker> {
  const run = workerLock.then(async () => {
    if (workerPromise && currentLangs === langs) return workerPromise

    // Language changed — tear the old worker down first.
    if (workerPromise) {
      const old = await workerPromise.catch(() => null)
      await old?.terminate().catch(() => {})
      workerPromise = null
    }

    const { createWorker } = await import('tesseract.js')
    const created = createWorker(langs, 1, {
      // Route through a mutable sink rather than capturing one run's callback,
      // otherwise only the very first OCR run would ever report progress.
      logger: (m: { status: string; progress: number }) =>
        progressSink?.({ status: m.status, progress: m.progress }),
    })

    workerPromise = created
    currentLangs = langs
    try {
      await created
    } catch (err) {
      // Never cache a rejected promise: doing so would break OCR permanently
      // (every later attempt would re-await the same failure) until a reload.
      workerPromise = null
      currentLangs = ''
      throw err
    }
    return created
  })

  workerLock = run.catch(() => {})
  return run
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
  progressSink = onProgress
  try {
    const worker = await getWorker(langs)
    const { data } = await worker.recognize(image)
    return { text: data.text.trim(), confidence: data.confidence }
  } finally {
    progressSink = undefined
  }
}

/** Free the OCR worker (call when leaving OCR-heavy screens to reclaim memory). */
export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return
  const pending = workerPromise
  workerPromise = null
  currentLangs = ''
  const w = await pending.catch(() => null)
  await w?.terminate().catch(() => {})
}
