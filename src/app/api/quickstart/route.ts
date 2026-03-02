import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiKeys } from '@/lib/schema';
import { generateApiKey } from '@/lib/auth';
import { randomUUID } from 'crypto';

// Simple in-memory rate limit: max 3 keys per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }

  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function buildMcpConfig(key: string) {
  return {
    mcpServers: {
      memory: {
        command: 'npx',
        args: ['-y', '@buildd/memory-plugin'],
        env: {
          BUILDD_MEMORY_API_KEY: key,
        },
      },
    },
  };
}

// POST /api/quickstart — Create a new team + API key
export async function POST(req: NextRequest) {
  const ip = getIp(req);

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429 }
    );
  }

  try {
    const teamId = `team_${randomUUID()}`;
    const { plaintext, hash, prefix } = generateApiKey();

    await db.insert(apiKeys).values({
      teamId,
      key: hash,
      keyPrefix: prefix,
      name: 'Quickstart',
      readOnly: false,
    });

    return NextResponse.json({
      key: plaintext,
      teamId,
      mcpConfig: buildMcpConfig(plaintext),
    }, { status: 201 });
  } catch (error) {
    console.error('Quickstart error:', error);
    return NextResponse.json(
      { error: 'Failed to generate key' },
      { status: 500 }
    );
  }
}
