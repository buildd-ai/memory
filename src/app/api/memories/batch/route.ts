import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { memories } from '@/lib/schema';
import { authenticate } from '@/lib/auth';
import { eq, and, inArray } from 'drizzle-orm';

// GET /api/memories/batch?ids=id1,id2,id3 — Fetch full content for specific memories
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');

  if (!idsParam) {
    return NextResponse.json({ error: 'ids parameter required' }, { status: 400 });
  }

  const ids = idsParam.split(',').map(id => id.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 20) {
    return NextResponse.json({ error: 'Provide 1-20 ids' }, { status: 400 });
  }

  const results = await db
    .select()
    .from(memories)
    .where(and(eq(memories.teamId, auth.teamId), inArray(memories.id, ids)));

  return NextResponse.json({ memories: results });
}
