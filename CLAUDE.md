# Memory Service - Agent Instructions

## Quick Reference

- **Repo**: `buildd-ai/memory` — standalone shared memory service
- **Stack**: Next.js 15 (app router), Drizzle ORM, Postgres (Neon), Bun
- **Domain**: `memory.buildd.dev`
- **Key paths**:
  - API routes: `src/app/api/`
  - MCP server (stdio): `src/mcp/server.ts`
  - MCP server (HTTP): `src/app/api/mcp/route.ts`
  - DB schema: `src/lib/schema.ts`
  - DB client: `src/lib/db.ts`
  - Auth: `src/lib/auth.ts`

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

## Auth Model

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
