import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://buildd.dev',
  'https://www.buildd.dev',
];

if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:3001');
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': isAllowed ? origin : '',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const res = NextResponse.next();
  if (isAllowed) {
    res.headers.set('Access-Control-Allow-Origin', origin);
  }
  return res;
}

export const config = {
  matcher: ['/api/quickstart', '/api/quickstart/join'],
};
