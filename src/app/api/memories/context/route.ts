import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { memories } from '@/lib/schema';
import { authenticate } from '@/lib/auth';
import { desc, eq, and, count, isNull, inArray } from 'drizzle-orm';

const TYPE_ORDER = ['gotcha', 'architecture', 'pattern', 'decision', 'discovery', 'summary'] as const;
const MAX_CHARS = 16000; // ~4000 tokens

// GET /api/memories/context — Markdown-formatted memories for agent injection
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const project = url.searchParams.get('project');

  const conditions = [eq(memories.teamId, auth.teamId), isNull(memories.archivedAt)];
  if (project) conditions.push(eq(memories.project, project));

  const allMemories = await db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt))
    .limit(200);

  const [total] = await db
    .select({ count: count() })
    .from(memories)
    .where(and(...conditions));

  // Group by type in priority order
  const grouped = new Map<string, typeof allMemories>();
  for (const type of TYPE_ORDER) {
    const items = allMemories.filter(m => m.type === type);
    if (items.length > 0) grouped.set(type, items);
  }

  let markdown = `## Team Memory (${total?.count ?? 0} total)\n\n`;

  for (const [type, items] of grouped) {
    const label = type.charAt(0).toUpperCase() + type.slice(1) + 's';
    markdown += `### ${label}\n`;
    for (const m of items) {
      const truncated = m.content.length > 200
        ? m.content.slice(0, 200) + '...'
        : m.content;
      const fileHint = m.files && m.files.length > 0
        ? ` (files: ${m.files.slice(0, 3).join(', ')})`
        : '';
      const projectHint = m.project ? ` [${m.project}]` : '';
      markdown += `- **${m.title}**${projectHint}: ${truncated}${fileHint}\n`;
    }
    markdown += '\n';
  }

  // Fire-and-forget lastAccessedAt update
  if (allMemories.length > 0) {
    db.update(memories)
      .set({ lastAccessedAt: new Date() })
      .where(inArray(memories.id, allMemories.map(m => m.id)))
      .catch(() => {});
  }

  // Truncate to stay within token budget
  if (markdown.length > MAX_CHARS) {
    markdown = markdown.slice(0, MAX_CHARS) + '\n\n...(truncated)';
  }

  return NextResponse.json({
    markdown,
    count: total?.count ?? 0,
  });
}
