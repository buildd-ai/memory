import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';
import { apiKeys } from './schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

export interface AuthContext {
  teamId: string;
  keyId: string;
  readOnly: boolean;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Authenticate a request via Bearer token or x-api-key header.
 * Returns team context or a 401 response.
 */
export async function authenticate(req: NextRequest): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get('authorization');
  const apiKeyHeader = req.headers.get('x-api-key');

  const rawKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : apiKeyHeader;

  if (!rawKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  // Check root key for bootstrapping
  if (process.env.ROOT_API_KEY && rawKey === process.env.ROOT_API_KEY) {
    return { teamId: 'root', keyId: 'root', readOnly: false };
  }

  const hashed = hashKey(rawKey);
  const record = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.key, hashed),
  });

  if (!record) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  return {
    teamId: record.teamId,
    keyId: record.id,
    readOnly: record.readOnly,
  };
}

/**
 * Authenticate a raw API key string.
 * Returns auth context or null if invalid.
 */
export async function authenticateKey(rawKey: string): Promise<AuthContext | null> {
  // Check root key for bootstrapping
  if (process.env.ROOT_API_KEY && rawKey === process.env.ROOT_API_KEY) {
    return { teamId: 'root', keyId: 'root', readOnly: false };
  }

  const hashed = hashKey(rawKey);
  const record = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.key, hashed),
  });

  if (!record) return null;

  return {
    teamId: record.teamId,
    keyId: record.id,
    readOnly: record.readOnly,
  };
}

/**
 * Generate a new API key with prefix `mem_`.
 */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const plaintext = `mem_${hex}`;
  const hash = hashKey(plaintext);
  const prefix = plaintext.slice(0, 12);
  return { plaintext, hash, prefix };
}
