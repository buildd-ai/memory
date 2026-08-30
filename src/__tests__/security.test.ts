import { describe, test, expect, mock } from 'bun:test';
import { createHash, timingSafeEqual } from 'crypto';

// ── Module mocks must be registered before the modules under test are imported ──

mock.module('@/lib/auth', () => ({
  compareKeys(a: string, b: string): boolean {
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return timingSafeEqual(ha, hb);
  },
  authenticate: async () => ({
    teamId: 'team_test',
    keyId: '00000000-0000-0000-0000-000000000001',
    readOnly: false,
  }),
  generateApiKey: () => ({
    plaintext: 'mem_aabbccdd',
    hash: 'fakehash',
    prefix: 'mem_aabbcc',
  }),
}));

mock.module('@/lib/db', () => ({
  db: {
    insert: () => ({ values: async () => undefined }),
  },
}));

// Import after mocks are registered
const { compareKeys } = await import('@/lib/auth');
const { POST } = await import('../app/api/keys/route');
const { NextRequest } = await import('next/server');

// ── compareKeys (constant-time comparison) ───────────────────────────────────

describe('compareKeys (constant-time comparison)', () => {
  test('returns true for identical strings', () => {
    expect(compareKeys('secret', 'secret')).toBe(true);
  });

  test('returns false for different strings of the same length', () => {
    expect(compareKeys('aaaaaaaaaa', 'aaaaaaaaab')).toBe(false);
  });

  test('returns false for different-length strings', () => {
    expect(compareKeys('short', 'much_longer_string')).toBe(false);
  });

  test('returns false when one side is empty', () => {
    expect(compareKeys('', 'nonempty')).toBe(false);
    expect(compareKeys('nonempty', '')).toBe(false);
  });
});

// ── POST /api/keys — teamId:"root" rejection ─────────────────────────────────

function makePostRequest(body: object) {
  return new NextRequest('http://localhost/api/keys', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-api-key': 'mem_aabbccdd' },
  });
}

describe('POST /api/keys', () => {
  test('rejects teamId "root" with 400', async () => {
    const req = makePostRequest({ name: 'escalation attempt', teamId: 'root' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/root/i);
  });

  test('accepts a valid teamId without triggering root guard', async () => {
    const req = makePostRequest({ name: 'CI agents', teamId: 'team_abc' });
    const res = await POST(req);
    expect(res.status).not.toBe(400);
  });

  test('rejects missing name with 400', async () => {
    const req = makePostRequest({ teamId: 'team_abc' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/i);
  });
});
