import { NextRequest, NextResponse } from 'next/server';

/**
 * Decommission tombstone — 2026-08-30.
 *
 * This service was absorbed into buildd's own database. Every memory was migrated
 * and verified byte-identical, and buildd no longer calls this API at all, so
 * anything still reaching these routes is a client we cannot see: an old `mem_*`
 * key in someone's `.mcp.json`, or a link from docs that have since been rewritten.
 *
 * Those clients get an explicit 410 with somewhere to go, rather than a dead
 * hostname and a connection error. That is the only reason this file returns a
 * response instead of the domain simply being unbound.
 *
 * It also closes the unauthenticated key-minting hole at POST /api/quickstart,
 * which had a module-scope rate limiter that could never work on serverless.
 *
 * Reverting is deleting this matcher. The database, the escrowed credentials and
 * the deployment are all untouched.
 */

const ALLOWED_ORIGINS = [
  'https://buildd.dev',
  'https://www.buildd.dev',
];

const GONE_BODY = {
  error: 'gone',
  message:
    'The standalone Buildd Memory service has been retired. Memory is now built into ' +
    'buildd and backed by buildd\'s own database — there is no separate service, no ' +
    'separate signup, and no memory API key.',
  detail:
    'Existing mem_* keys no longer authenticate. Agents should use the buildd MCP ' +
    'server\'s recall and learn tools instead; memories are scoped to your buildd team.',
  movedTo: 'https://buildd.dev',
  retiredOn: '2026-08-30',
};

function cors(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');

  // Answer preflight so a browser surfaces the 410 below instead of a CORS error,
  // which would otherwise hide the explanation from anyone debugging.
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: { ...cors(origin), 'Access-Control-Max-Age': '86400' },
    });
  }

  return NextResponse.json(GONE_BODY, {
    status: 410,
    headers: {
      ...cors(origin),
      // Nothing about this answer will change; let clients and crawlers cache it.
      'Cache-Control': 'public, max-age=3600',
      // Deprecation/Sunset are the standard signals for a retired HTTP resource.
      Deprecation: 'true',
      Sunset: 'Sat, 30 Aug 2026 00:00:00 GMT',
      Link: '<https://buildd.dev>; rel="alternate"',
    },
  });
}

export const config = {
  // Every API route. The landing page stays reachable so the explanation is visible
  // to a human who opens the hostname in a browser.
  matcher: ['/api/:path*'],
};
