import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { memories } from '@/lib/schema';
import { authenticate } from '@/lib/auth';
import { desc, eq, and, ilike, or } from 'drizzle-orm';

const VALID_TYPES = ['discovery', 'decision', 'gotcha', 'pattern', 'architecture', 'summary'];

// GET /api/memories — List memories for team
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const project = url.searchParams.get('project');
  const search = url.searchParams.get('search');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const conditions = [eq(memories.teamId, auth.teamId)];
  if (type && VALID_TYPES.includes(type)) conditions.push(eq(memories.type, type as any));
  if (project) conditions.push(eq(memories.project, project));
  if (search) {
    conditions.push(or(
      ilike(memories.title, `%${search}%`),
      ilike(memories.content, `%${search}%`),
    )!);
  }

  const results = await db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ memories: results });
}

// POST /api/memories — Create a memory
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.readOnly) {
    return NextResponse.json({ error: 'Read-only key' }, { status: 403 });
  }

  const body = await req.json();
  const { type, title, content, project, tags, files, source } = body;

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const [memory] = await db.insert(memories).values({
    teamId: auth.teamId,
    type,
    title: title.trim(),
    content: content.trim(),
    project: project || null,
    tags: Array.isArray(tags) ? tags : [],
    files: Array.isArray(files) ? files : [],
    source: source || null,
  }).returning();

  return NextResponse.json({ memory }, { status: 201 });
}
