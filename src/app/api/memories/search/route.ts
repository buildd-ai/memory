import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { memories } from '@/lib/schema';
import { authenticate } from '@/lib/auth';
import { desc, eq, and, ilike, or, sql, count, isNull } from 'drizzle-orm';

// GET /api/memories/search — Compact search (index only, no content)
// Progressive disclosure: search first, then batch fetch full content
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const query = url.searchParams.get('query');
  const type = url.searchParams.get('type');
  const project = url.searchParams.get('project');
  const filesParam = url.searchParams.get('files');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const conditions = [eq(memories.teamId, auth.teamId), isNull(memories.archivedAt)];

  if (query) {
    conditions.push(or(
      ilike(memories.title, `%${query}%`),
      ilike(memories.content, `%${query}%`),
    )!);
  }
  if (type) conditions.push(eq(memories.type, type as any));
  if (project) conditions.push(eq(memories.project, project));
  if (filesParam) {
    const fileList = filesParam.split(',').map(f => f.trim()).filter(Boolean);
    if (fileList.length > 0) {
      conditions.push(sql`${memories.files} @> ${JSON.stringify(fileList)}::jsonb`);
    }
  }

  const where = and(...conditions);

  const [results, [total]] = await Promise.all([
    db
      .select({
        id: memories.id,
        title: memories.title,
        type: memories.type,
        project: memories.project,
        tags: memories.tags,
        files: memories.files,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(where)
      .orderBy(desc(memories.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(memories)
      .where(where),
  ]);

  return NextResponse.json({
    results,
    total: total?.count ?? 0,
    limit,
    offset,
  });
}
