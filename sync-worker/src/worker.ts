export interface Env {
  DB: D1Database
  MEDIA: R2Bucket
  SYNC_TOKEN: string
  ALLOWED_ORIGIN: string
}

interface SyncRequest {
  since: number
  poems?: SyncRecord[]
  authors?: SyncRecord[]
  collections?: SyncRecord[]
}

interface SyncRecord {
  id: string
  data: string
  updatedAt: number
  deletedAt?: number | null
}

interface SyncResponse {
  poems: SyncRecord[]
  authors: SyncRecord[]
  collections: SyncRecord[]
  serverTime: number
}

function cors(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') ?? ''
  const allowed = env.ALLOWED_ORIGIN || '*'
  const match = allowed === '*' || origin.startsWith(allowed)
  return {
    'Access-Control-Allow-Origin': match ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

function unauthorized(request: Request, env: Env): Response {
  return new Response('Unauthorized', { status: 401, headers: cors(request, env) })
}

function authenticate(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization')
  if (!auth) return false
  const token = auth.replace(/^Bearer\s+/i, '')
  return token === env.SYNC_TOKEN
}

async function handleSync(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as SyncRequest
  const since = body.since ?? 0

  const push = async (table: string, records?: SyncRecord[]) => {
    if (!records?.length) return
    const stmt = env.DB.prepare(
      `INSERT INTO ${table} (id, data, updated_at, deleted_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET
         data = CASE WHEN ?3 > updated_at THEN ?2 ELSE data END,
         updated_at = CASE WHEN ?3 > updated_at THEN ?3 ELSE updated_at END,
         deleted_at = CASE WHEN ?3 > updated_at THEN ?4 ELSE deleted_at END`
    )
    const batch = records.map((r) =>
      stmt.bind(r.id, r.data, r.updatedAt, r.deletedAt ?? null)
    )
    await env.DB.batch(batch)
  }

  await push('poems', body.poems)
  await push('authors', body.authors)
  await push('collections', body.collections)

  const pull = async (table: string): Promise<SyncRecord[]> => {
    const { results } = await env.DB.prepare(
      `SELECT id, data, updated_at, deleted_at FROM ${table} WHERE updated_at > ?1`
    )
      .bind(since)
      .all()
    return (results ?? []).map((r) => ({
      id: r.id as string,
      data: r.data as string,
      updatedAt: r.updated_at as number,
      deletedAt: (r.deleted_at as number | null) ?? undefined,
    }))
  }

  const [poems, authors, collections] = await Promise.all([
    pull('poems'),
    pull('authors'),
    pull('collections'),
  ])

  const response: SyncResponse = {
    poems,
    authors,
    collections,
    serverTime: Date.now(),
  }

  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json', ...cors(request, env) },
  })
}

async function handleMediaPut(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const body = await request.arrayBuffer()
  const contentType = request.headers.get('Content-Type') ?? 'application/octet-stream'
  await env.MEDIA.put(id, body, {
    httpMetadata: { contentType },
  })
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...cors(request, env) },
  })
}

async function handleMediaGet(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const object = await env.MEDIA.get(id)
  if (!object) {
    return new Response('Not found', { status: 404, headers: cors(request, env) })
  }
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...cors(request, env),
    },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(request, env) })
    }

    if (!authenticate(request, env)) {
      return unauthorized(request, env)
    }

    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/api/sync' && request.method === 'POST') {
      return handleSync(request, env)
    }

    const mediaMatch = path.match(/^\/api\/media\/(.+)$/)
    if (mediaMatch) {
      const id = decodeURIComponent(mediaMatch[1])
      if (request.method === 'PUT') return handleMediaPut(request, env, id)
      if (request.method === 'GET') return handleMediaGet(request, env, id)
    }

    if (path === '/api/health') {
      return new Response(JSON.stringify({ ok: true, time: Date.now() }), {
        headers: { 'Content-Type': 'application/json', ...cors(request, env) },
      })
    }

    return new Response('Not found', { status: 404, headers: cors(request, env) })
  },
} satisfies ExportedHandler<Env>
