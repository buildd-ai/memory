ALTER TABLE "memories" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "last_accessed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_archived_at_idx" ON "memories" ("archived_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_last_accessed_at_idx" ON "memories" ("last_accessed_at");