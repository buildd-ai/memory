import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { memories } from '@/lib/schema';
import { authenticate } from '@/lib/auth';
import { eq, and, isNull } from 'drizzle-orm';

// GET /api/memories/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const memory = await db.query.memories.findFirst({
    where: and(eq(memories.id, id), eq(memories.teamId, auth.teamId)),
  });

  if (!memory) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Fire-and-forget lastAccessedAt update
  db.update(memories)
    .set({ lastAccessedAt: new Date() })
    .where(eq(memories.id, id))
    .catch(() => {});

  return NextResponse.json({ memory });
}

// PATCH /api/memories/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.readOnly) {
    return NextResponse.json({ error: 'Read-only key' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { type, title, content, project, tags, files, source, archived } = body;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (type) updateData.type = type;
  if (title) updateData.title = title;
  if (content) updateData.content = content;
  if (project !== undefined) updateData.project = project || null;
  if (tags) updateData.tags = tags;
  if (files) updateData.files = files;
  if (source !== undefined) updateData.source = source || null;
  if (archived === false) updateData.archivedAt = null;

  const [updated] = await db
    .update(memories)
    .set(updateData)
    .where(and(eq(memories.id, id), eq(memories.teamId, auth.teamId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ memory: updated });
}

// DELETE /api/memories/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.readOnly) {
    return NextResponse.json({ error: 'Read-only key' }, { status: 403 });
  }

  const { id } = await params;
  const [archived] = await db
    .update(memories)
    .set({ archivedAt: new Date() })
    .where(and(eq(memories.id, id), eq(memories.teamId, auth.teamId), isNull(memories.archivedAt)))
    .returning();

  if (!archived) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
