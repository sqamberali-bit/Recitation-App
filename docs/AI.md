# AI-assisted OCR correction

Urdu and Arabic OCR is genuinely hard: Nastaliq ligatures, missing short vowels, and scanned
handwriting all degrade accuracy. Tesseract gets you most of the way; an LLM pass cleans up the
rest while preserving verse structure.

This is **entirely optional**. The app works fully without it.

## Two ways to configure it

### 1. Correction endpoint (recommended)

Run a small server you control. The app POSTs to it and expects `{ text: "..." }` back. Your API
key stays on the server.

Configure in **Settings → AI OCR correction → Correction endpoint**.

Request the app sends:

```jsonc
POST <your-endpoint>
Content-Type: application/json

{
  "text": "raw OCR output…",
  "language": "ur",          // 'ur' | 'ar' | 'en' | 'mixed'
  "task": "ocr-correction"
}
```

Response it expects:

```json
{ "text": "corrected text…" }
```

`{ "correctedText": ... }` and `{ "output": ... }` are also accepted.

#### Reference implementation (Node)

```js
import express from 'express'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
app.use(express.json({ limit: '1mb' }))

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LANG = { ur: 'Urdu', ar: 'Arabic', en: 'English', mixed: 'mixed Urdu/English' }

app.post('/correct', async (req, res) => {
  const { text, language } = req.body
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text required' })
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            `You are correcting text produced by OCR from a scanned ${LANG[language] ?? 'Urdu'} poem or noha.`,
            'Fix obvious OCR errors (wrong/merged/split letters, stray marks, spacing) and restore',
            'correct Urdu/Arabic characters. Preserve line breaks and verse structure exactly.',
            'Do NOT translate, add commentary, or invent missing words.',
            'Return ONLY the corrected text.',
            '',
            '--- OCR TEXT ---',
            text,
          ].join('\n'),
        },
      ],
    })

    const block = message.content.find((c) => c.type === 'text')
    res.json({ text: block ? block.text.trim() : '' })
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: 'correction failed' })
  }
})

app.listen(8787, () => console.log('correction proxy on :8787'))
```

Deploy it anywhere that runs Node (Fly.io, Railway, Render, a Cloudflare Worker with small
changes). Two things to add before exposing it publicly:

- **CORS**: allow only your app's origin.
- **Auth**: require a shared secret. The app sends any value you put in the API-key field as
  `Authorization: Bearer <value>`, so you can reuse that field as the shared secret.

### 2. Direct Claude API key

Paste a key into **Settings → Claude API key**. The app then calls the Anthropic Messages API
directly from the browser using the `anthropic-dangerous-direct-browser-access` header.

This is convenient on a personal phone, but the key is stored in that browser's IndexedDB —
anyone with access to the unlocked device can read it. Prefer the endpoint on shared devices.
Exported backups deliberately **strip** this key.

## How it's used in the app

1. Attach or capture an image on a poem.
2. Tap **OCR** on the image thumbnail — extracted text is appended to the poem body.
3. Tap **AI fix** (appears only when configured) to clean up the result.
4. Review before saving. The model is instructed never to invent words, but always check
   religious text yourself.

## Model choice

The reference proxy uses `claude-sonnet-5` — a good balance of quality and cost for text cleanup.
For difficult handwritten scans, `claude-opus-5` is more accurate at higher cost. Set it in your
proxy; the app does not need to know.
