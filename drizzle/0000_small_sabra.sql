CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"key" text NOT NULL,
	"key_prefix" text,
	"name" text NOT NULL,
	"read_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"project" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"files" jsonb DEFAULT '[]'::jsonb,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_idx" ON "api_keys" ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_team_idx" ON "api_keys" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_team_idx" ON "memories" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_type_idx" ON "memories" ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_project_idx" ON "memories" ("project");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_team_project_idx" ON "memories" ("team_id","project");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_created_at_idx" ON "memories" ("created_at");