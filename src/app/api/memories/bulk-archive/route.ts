import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { memories } from '@/lib/schema';
import { authenticate } from '@/lib/auth';
import { eq, and, inArray, isNull } from 'drizzle-orm';

// POST /api/memories/bulk-archive — Archive multiple memories
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.readOnly) {
    return NextResponse.json({ error: 'Read-only key' }, { status: 403 });
  }

  const body = await req.json();
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
    return NextResponse.json({ error: 'Provide 1-50 ids' }, { status: 400 });
  }

  const archived = await db
    .update(memories)
    .set({ archivedAt: new Date() })
    .where(and(eq(memories.teamId, auth.teamId), inArray(memories.id, ids), isNull(memories.archivedAt)))
    .returning({ id: memories.id });

  return NextResponse.json({ archived: archived.length, ids: archived.map(r => r.id) });
}
