/**
 * Duty — Cloudflare edge worker.
 *
 * Sits in front of the Duty origin and handles the concerns that belong at the
 * edge rather than in the app: TLS termination, the public hostname, security
 * headers, edge caching for the public catalogue, rate limiting on the unauthed
 * write paths, and a status page when the origin is unreachable.
 *
 * The origin is whatever host runs the Duty server (a container, a VPS, Fly,
 * Render, Railway…). Set it in wrangler.toml as the ORIGIN var.
 */

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), microphone=(), camera=()',
};

// Paths that are safe to cache at the edge. The public catalogue changes rarely
// and is read on every widget load, so caching it removes most origin traffic.
const CACHEABLE = [
  { test: (p) => p === '/api/public/config' || p === '/api/public/catalog', ttl: 60 },
  { test: (p) => p === '/widget/duty-widget.js', ttl: 300 },
];

// Unauthenticated endpoints that a stranger can POST to. These get the tight
// limit so a single client cannot drive unbounded agent work.
const RATE_LIMITED = ['/webhooks/inbound', '/webhooks/whatsapp', '/api/public/chat'];

const RATE_LIMIT = { windowSeconds: 60, max: 60 };

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

/**
 * Fixed-window rate limit keyed by IP + path.
 *
 * The Cache API is used as the counter store because it is the only primitive
 * available without provisioning a KV namespace, and it is per-colo, so the
 * effective limit is max × number-of-colos. That is acceptable for abuse
 * control; a global limit would need a Durable Object or KV.
 */
async function checkRateLimit(request, path) {
  const window = Math.floor(Date.now() / 1000 / RATE_LIMIT.windowSeconds);
  const key = new Request(
    `https://duty-rate-limit.internal/${encodeURIComponent(clientIp(request))}/${window}/${encodeURIComponent(path)}`,
  );
  const cache = caches.default;
  const hit = await cache.match(key);
  const count = hit ? Number(await hit.text()) + 1 : 1;
  if (count > RATE_LIMIT.max) return { limited: true, count };
  await cache.put(
    key,
    new Response(String(count), { headers: { 'cache-control': `max-age=${RATE_LIMIT.windowSeconds}` } }),
  );
  return { limited: false, count };
}

function statusPage(env, detail) {
  const origin = env.ORIGIN ?? 'not configured';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Duty — origin unreachable</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font:15px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;
         background:#0b0b0c; color:#e8e8ea; }
  .card { max-width:34rem; padding:2.5rem; border:1px solid #26262a;
          border-radius:14px; background:#131316; }
  h1 { margin:0 0 .5rem; font-size:1.25rem; letter-spacing:-.01em; }
  p  { margin:.5rem 0; color:#a1a1a8; }
  code { background:#1d1d21; padding:.15rem .4rem; border-radius:5px;
         font-size:.85em; color:#e8e8ea; }
  .dot { display:inline-block; width:.55rem; height:.55rem; border-radius:50%;
         background:#f5a524; margin-right:.5rem; }
</style></head>
<body><div class="card">
  <h1><span class="dot"></span>Duty is deployed; the origin is not answering</h1>
  <p>This edge worker is live and serving. The Duty application origin at
     <code>${origin}</code> could not be reached.</p>
  <p>${detail}</p>
  <p>Start the origin, or point <code>ORIGIN</code> in
     <code>wrangler.toml</code> at a reachable host, then redeploy.</p>
</div></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '30', ...SECURITY_HEADERS },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!env.ORIGIN) return statusPage(env, 'No origin is configured.');

    if (RATE_LIMITED.includes(path) && request.method === 'POST') {
      // Fail open: a broken counter must never take the whole proxy down, so a
      // Cache API error here degrades to "no limit" rather than a 5xx.
      let limited = false;
      try {
        ({ limited } = await checkRateLimit(request, path));
      } catch {
        limited = false;
      }
      if (limited) {
        return new Response(JSON.stringify({ error: 'rate_limited', retryAfter: RATE_LIMIT.windowSeconds }), {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': String(RATE_LIMIT.windowSeconds),
            ...SECURITY_HEADERS,
          },
        });
      }
    }

    const rule = CACHEABLE.find((r) => r.test(path));
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    if (rule && request.method === 'GET') {
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        const res = new Response(cached.body, cached);
        res.headers.set('x-duty-edge', 'hit');
        return res;
      }
    }

    const originUrl = new URL(url.pathname + url.search, env.ORIGIN);
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', 'https');
    // The origin builds absolute webhook URLs from the host it is told about.
    headers.set('x-duty-public-url', `https://${url.host}`);

    let upstream;
    try {
      upstream = await fetch(originUrl.toString(), {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      });
    } catch (error) {
      return statusPage(env, `Fetch failed: ${String(error?.message ?? error)}`);
    }

    if (upstream.status >= 500 && upstream.headers.get('content-type')?.includes('text/html')) {
      return statusPage(env, `Origin returned ${upstream.status}.`);
    }

    const response = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
    response.headers.set('x-duty-edge', 'miss');

    if (rule && request.method === 'GET' && upstream.ok) {
      response.headers.set('cache-control', `public, max-age=${rule.ttl}, s-maxage=${rule.ttl}`);
      ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    }

    return response;
  },
};
