// Recitation Sync Worker — paste this into the Cloudflare Dashboard editor

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (!authenticate(request, env)) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/sync' && request.method === 'POST') {
      return handleSync(request, env);
    }

    const mediaMatch = path.match(/^\/api\/media\/(.+)$/);
    if (mediaMatch) {
      const id = decodeURIComponent(mediaMatch[1]);
      if (request.method === 'PUT') return handleMediaPut(request, env, id);
      if (request.method === 'GET') return handleMediaGet(request, env, id);
    }

    if (path === '/api/health') {
      return new Response(JSON.stringify({ ok: true, time: Date.now() }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
      });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders(request, env) });
  },
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '*';
  const match = allowed === '*' || origin.startsWith(allowed);
  return {
    'Access-Control-Allow-Origin': match ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function authenticate(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, '');
  return token === env.SYNC_TOKEN;
}

async function handleSync(request, env) {
  const body = await request.json();
  const since = body.since || 0;

  const pushRecords = async (table, records) => {
    if (!records || !records.length) return;
    const stmt = env.DB.prepare(
      `INSERT INTO ${table} (id, data, updated_at, deleted_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET
         data = CASE WHEN ?3 > updated_at THEN ?2 ELSE data END,
         updated_at = CASE WHEN ?3 > updated_at THEN ?3 ELSE updated_at END,
         deleted_at = CASE WHEN ?3 > updated_at THEN ?4 ELSE deleted_at END`
    );
    const batch = records.map((r) =>
      stmt.bind(r.id, r.data, r.updatedAt, r.deletedAt || null)
    );
    await env.DB.batch(batch);
  };

  await pushRecords('poems', body.poems);
  await pushRecords('authors', body.authors);
  await pushRecords('collections', body.collections);

  const pullRecords = async (table) => {
    const { results } = await env.DB.prepare(
      `SELECT id, data, updated_at, deleted_at FROM ${table} WHERE updated_at > ?1`
    )
      .bind(since)
      .all();
    return (results || []).map((r) => ({
      id: r.id,
      data: r.data,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at || undefined,
    }));
  };

  const [poems, authors, collections] = await Promise.all([
    pullRecords('poems'),
    pullRecords('authors'),
    pullRecords('collections'),
  ]);

  return new Response(
    JSON.stringify({ poems, authors, collections, serverTime: Date.now() }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) } }
  );
}

async function handleMediaPut(request, env, id) {
  const body = await request.arrayBuffer();
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
  await env.MEDIA.put(id, body, { httpMetadata: { contentType } });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
  });
}

async function handleMediaGet(request, env, id) {
  const object = await env.MEDIA.get(id);
  if (!object) {
    return new Response('Not found', { status: 404, headers: corsHeaders(request, env) });
  }
  return new Response(object.body, {
    headers: {
      'Content-Type': (object.httpMetadata && object.httpMetadata.contentType) || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...corsHeaders(request, env),
    },
  });
}
