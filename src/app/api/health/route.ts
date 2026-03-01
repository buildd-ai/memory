import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'error', message: 'Database unreachable' }, { status: 503 });
  }
}
