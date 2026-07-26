/**
 * Optional AI-assisted correction of OCR output. This is a pluggable client
 * with two modes (both entirely opt-in — the app is fully usable without it):
 *
 *  1. Proxy endpoint (recommended): POST { text, language } to a small server
 *     you control that forwards to the Claude API and returns { text }. Keeps
 *     your API key off the device. See docs/AI.md.
 *
 *  2. Direct browser call: if you provide a Claude API key in Settings, the app
 *     calls the Anthropic Messages API directly using the browser-access
 *     header. Convenient for a personal device but the key lives in this
 *     browser's storage — only use it on a device you trust.
 */
import type { Language } from '@/types'

export interface AiCorrectionOptions {
  endpoint?: string
  apiKey?: string
  model?: string
  language?: Language
}

const DEFAULT_MODEL = 'claude-3-5-sonnet-latest'

function buildPrompt(text: string, language?: Language): string {
  const lang =
    language === 'ur'
      ? 'Urdu'
      : language === 'ar'
        ? 'Arabic'
        : language === 'en'
          ? 'English'
          : 'mixed Urdu/English'
  return [
    `You are correcting text produced by OCR from a scanned ${lang} poem or noha.`,
    'Fix obvious OCR errors (wrong/merged/split letters, stray marks, spacing),',
    'restore correct Urdu/Arabic characters, and keep the original meaning.',
    'Preserve line breaks and verse structure exactly. Do NOT translate,',
    'add commentary, or invent missing words. Return ONLY the corrected text.',
    '',
    '--- OCR TEXT ---',
    text,
  ].join('\n')
}

/** Returns AI-corrected text, or throws if no integration is configured. */
export async function aiCorrect(text: string, opts: AiCorrectionOptions): Promise<string> {
  const prompt = buildPrompt(text, opts.language)

  if (opts.endpoint) {
    const res = await fetch(opts.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify({ text, language: opts.language, task: 'ocr-correction' }),
    })
    if (!res.ok) throw new Error(`Correction endpoint error ${res.status}`)
    const data = await res.json()
    const out = data.text ?? data.correctedText ?? data.output
    if (typeof out !== 'string') throw new Error('Endpoint did not return { text }')
    return out.trim()
  }

  if (opts.apiKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model || DEFAULT_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Claude API error ${res.status}: ${detail.slice(0, 200)}`)
    }
    const data = await res.json()
    const block = Array.isArray(data.content) ? data.content.find((c: { type: string }) => c.type === 'text') : null
    if (!block?.text) throw new Error('Unexpected Claude API response')
    return String(block.text).trim()
  }

  throw new Error(
    'AI correction is not configured. Add a correction endpoint or Claude API key in Settings.',
  )
}

export function isAiConfigured(opts: AiCorrectionOptions): boolean {
  return Boolean(opts.endpoint || opts.apiKey)
}
