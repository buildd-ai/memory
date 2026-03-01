import {
  pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, boolean
} from 'drizzle-orm/pg-core';

// API keys for team authentication
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: text('team_id').notNull(),
  key: text('key').notNull().unique(),       // mem_xxx hashed
  keyPrefix: text('key_prefix'),             // First 8 chars for display
  name: text('name').notNull(),              // "CI agents", "dev team", etc.
  readOnly: boolean('read_only').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  keyIdx: uniqueIndex('api_keys_key_idx').on(t.key),
  teamIdx: index('api_keys_team_idx').on(t.teamId),
}));

// Core memories table — team-shared observations
export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: text('team_id').notNull(),

  // Classification
  type: text('type').notNull().$type<
    'discovery' | 'decision' | 'gotcha' | 'pattern' | 'architecture' | 'summary'
  >(),

  // Content
  title: text('title').notNull(),
  content: text('content').notNull(),

  // Metadata for filtering
  project: text('project'),                   // Optional project scoping
  tags: jsonb('tags').default([]).$type<string[]>(),
  files: jsonb('files').default([]).$type<string[]>(),

  // Provenance
  source: text('source'),                     // Who saved: agent name, user email, etc.

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  teamIdx: index('memories_team_idx').on(t.teamId),
  typeIdx: index('memories_type_idx').on(t.type),
  projectIdx: index('memories_project_idx').on(t.project),
  teamProjectIdx: index('memories_team_project_idx').on(t.teamId, t.project),
  createdAtIdx: index('memories_created_at_idx').on(t.createdAt),
}));
