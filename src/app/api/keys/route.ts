import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiKeys } from '@/lib/schema';
import { authenticate, generateApiKey } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// GET /api/keys — List API keys for team
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      readOnly: apiKeys.readOnly,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.teamId, auth.teamId));

  return NextResponse.json({ keys });
}

// POST /api/keys — Create a new API key
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.readOnly) {
    return NextResponse.json({ error: 'Read-only key' }, { status: 403 });
  }

  const body = await req.json();
  const { name, teamId, readOnly } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Root key can create keys for any team, otherwise scoped to own team
  const targetTeam = auth.teamId === 'root' && teamId ? teamId : auth.teamId;
  if (auth.teamId === 'root' && !teamId) {
    return NextResponse.json({ error: 'teamId required when using root key' }, { status: 400 });
  }

  const { plaintext, hash, prefix } = generateApiKey();

  await db.insert(apiKeys).values({
    teamId: targetTeam,
    key: hash,
    keyPrefix: prefix,
    name,
    readOnly: readOnly ?? false,
  });

  return NextResponse.json({
    key: plaintext,
    prefix,
    teamId: targetTeam,
    message: 'Save this key — it cannot be retrieved again.',
  }, { status: 201 });
}
