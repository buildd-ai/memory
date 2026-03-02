import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiKeys } from '@/lib/schema';
import { generateApiKey } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// Simple in-memory rate limit: max 3 joins per IP per hour
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

// POST /api/quickstart/join — Join an existing team by team code
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const { team } = body;

    if (!team || typeof team !== 'string') {
      return NextResponse.json({ error: 'team is required' }, { status: 400 });
    }

    // Verify team exists by checking for at least one key
    const existing = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.teamId, team),
      columns: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const { plaintext, hash, prefix } = generateApiKey();

    await db.insert(apiKeys).values({
      teamId: team,
      key: hash,
      keyPrefix: prefix,
      name: 'Team member',
      readOnly: false,
    });

    const mcpConfig = {
      mcpServers: {
        memory: {
          command: 'npx',
          args: ['-y', '@buildd/memory-plugin'],
          env: {
            BUILDD_MEMORY_API_KEY: plaintext,
          },
        },
      },
    };

    return NextResponse.json({ key: plaintext, mcpConfig }, { status: 201 });
  } catch (error) {
    console.error('Quickstart join error:', error);
    return NextResponse.json(
      { error: 'Failed to join team' },
      { status: 500 }
    );
  }
}
