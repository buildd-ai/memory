# buildd-ai/memory - Agent Instructions

## The hosted service is retired — read this first

This repo used to run a standalone memory service. **It was retired on
2026-08-30.** Everything under `/api` returns `410 Gone`, `mem_*` keys no longer
authenticate, and the data was migrated into buildd's own database. Memory is a
built-in buildd feature now, reached through the `recall` and `learn` MCP tools.

So: **do not add features to `src/`**, do not treat `memory.buildd.dev` as a live
API, and do not point anything at it. `src/` is kept for history and to serve the
tombstone (`src/middleware.ts`).

**Do not archive or delete this repo.** It publishes
`@buildd-ai/knowledge-store` to GitHub Packages, and at least one other repo in
the org pins that package exactly. Archiving makes a repo read-only, so the
publish workflow would stop being able to run.

## Quick Reference

- **Repo**: `buildd-ai/memory` — library repo; the retired service is history
- **Live code**: `packages/knowledge-store/` → `@buildd-ai/knowledge-store`
- **Licence**: Apache-2.0 (`LICENSE`). Public *and* licensed; those are different
  things and this repo was only the first for a long time.
- **Stack**: TypeScript library; the retired service was Next.js 15 + Drizzle +
  Postgres (Neon) + Bun
- **Key paths**:
  - Library: `packages/knowledge-store/src/`
  - Publish: `.github/workflows/publish-knowledge-store.yml`
  - Tombstone: `src/middleware.ts`, `src/app/page.tsx`
  - Retired service (history): `src/app/api/`, `src/lib/`, `src/mcp/`

## Git Workflow

- **Default branch**: `dev`
- **Production branch**: `main`
- **Flow**: Push to `dev` → CI runs → release PR merges dev→main → Vercel deploys
- **PRs**: Target `dev` for features, `main` for hotfixes only
- **Release**: `bun run release` (dev→main), `bun run release:hotfix` (branch→main, patch bump)
- **Branch cleanup**: `bun run cleanup-branches`
- **CI**: `.github/workflows/build.yml` runs type check + build
- **Vercel**: Deploys from `main`

Do NOT commit directly to `main` unless it's an emergency hotfix.

### Commits

Use **conventional commits**. The release script auto-detects semver bumps from these prefixes:

- `feat:` → minor bump (new feature)
- `fix:` → patch bump (bug fix)
- `BREAKING CHANGE` in body → major bump
- `ci:`, `chore:`, `refactor:`, `docs:`, `revert:` → patch bump (no user-facing change)

Format: `type(optional-scope): short description`

Examples:
```
feat: add streamable HTTP MCP server
fix: lazy-init db connection to fix build without DATABASE_URL
ci: add CI/CD workflows and release automation
chore: bump version to 0.2.0
refactor(auth): extract authenticateKey helper
revert: remove invalid deploymentProtection from vercel.json
```

### Hotfix vs Normal Release

- **Normal** (`bun run release`): Feature/fix goes to `dev` first, then release PR merges dev→main. Use when there's no urgency.
- **Hotfix** (`bun run release:hotfix`): Run from a feature branch. Creates PR directly to `main` with a patch bump. Use only for urgent production fixes. After merging, `sync-dev.yml` auto-syncs dev from main.

## Database

Postgres via Neon + Drizzle ORM. Schema in `src/lib/schema.ts`.

### Schema Changes

When modifying `src/lib/schema.ts`:

1. **Generate migration**: `bun run db:generate`
2. **Commit the migration files** in `drizzle/`
3. **Push to dev** — CI verifies migrations are up to date
4. **Run migration**: `bun run db:migrate`

CI will **fail** if you change schema.ts without generating/committing migrations.

### DB Client

`src/lib/db.ts` uses lazy initialization (Proxy) so the module can be imported during `next build` without a live `DATABASE_URL`. The actual `neon()` connection is created on first property access at runtime.

## Auth Model (retired — historical)

None of this is reachable: the middleware returns 410 before any handler runs.
Recorded because it explains the orphaned `mem_*` keys still sitting in users'
`.mcp.json` files, and because reverting the tombstone would expose it again.

API key auth (`mem_xxx` prefix). Keys are hashed and stored in the `api_keys` table.

- `authenticate(req)` — authenticate a NextRequest via `x-api-key` header
- `authenticateKey(rawKey)` — authenticate a raw key string (used by MCP transport)
- `ROOT_API_KEY` env var for bootstrapping

## When Modifying

- **Schema changes** → run `bun run db:generate` and commit migration files
- **API routes using db** → ensure `export const dynamic = 'force-dynamic'` if the handler has no dynamic inputs (no headers/cookies/params), otherwise `next build` will fail without `DATABASE_URL`
- **Do NOT use `db.transaction()`** with interactive logic — neon-http driver doesn't support it

## Related Repos

| Repo | Purpose | Domain |
|------|---------|--------|
| [buildd-ai/buildd](https://github.com/buildd-ai/buildd) | Main app (dashboard + API) | `app.buildd.dev` |
| [buildd-ai/buildd-docs](https://github.com/buildd-ai/buildd-docs) | Product documentation | `docs.buildd.dev` |
