# Buildd Memory

Shared team memory for AI agents. Postgres-backed, MCP-native.

Unlike local-only memory tools, Buildd Memory is a **hosted service** that lets your entire team's agents share knowledge — gotchas, architectural decisions, patterns, and discoveries persist across sessions and machines.

## Quick Start

```bash
# Install
bun install

# Set up environment
cp .env.example .env
# Edit .env with your Neon Postgres URL and a root API key

# Run migrations
bun db:migrate

# Start the server
bun dev
```

## API

All endpoints require authentication via `Authorization: Bearer <key>` or `x-api-key: <key>` header.

### Memories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/memories/context?project=` | Markdown-formatted memories for agent injection |
| `GET` | `/api/memories/search?query=&type=&project=&files=&limit=&offset=` | Compact search (index only) |
| `GET` | `/api/memories/batch?ids=id1,id2` | Fetch full content by IDs (max 20) |
| `POST` | `/api/memories` | Create a memory |
| `GET` | `/api/memories/:id` | Get single memory |
| `PATCH` | `/api/memories/:id` | Update a memory |
| `DELETE` | `/api/memories/:id` | Delete a memory |

### Memory Types

- `gotcha` — Things that are easy to get wrong
- `architecture` — System structure and design
- `pattern` — Recurring code patterns
- `decision` — Why something was done a certain way
- `discovery` — New findings about the codebase
- `summary` — High-level overviews

### API Keys

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/keys` | List API keys for your team |
| `POST` | `/api/keys` | Create a new API key |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |

## MCP Integration

Add to your `.mcp.json` (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@buildd/memory"],
      "env": {
        "MEMORY_API_URL": "https://memory.buildd.dev",
        "MEMORY_API_KEY": "mem_your_key_here"
      }
    }
  }
}
```

Or run the MCP server directly:

```bash
MEMORY_API_URL=https://memory.buildd.dev MEMORY_API_KEY=mem_xxx bun run mcp
```

### MCP Actions

The `memory` tool supports these actions:

| Action | Params | Description |
|--------|--------|-------------|
| `context` | `{ project? }` | Load formatted memories for current session |
| `search` | `{ query?, type?, project?, files?, limit?, offset? }` | Search memories |
| `save` | `{ type, title, content, project?, tags?, files?, source? }` | Save a new memory |
| `get` | `{ id }` | Get full memory content |
| `update` | `{ id, ...fields }` | Update a memory |
| `delete` | `{ id }` | Delete a memory |

## Deploy

Deploy as a standalone Vercel app:

```bash
vercel
```

Set environment variables in Vercel:
- `DATABASE_URL` — Neon Postgres connection string
- `ROOT_API_KEY` — Root key for bootstrapping team API keys

## Architecture

```
buildd-memory/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── memories/     # CRUD, search, batch, context
│   │   │   ├── keys/         # API key management
│   │   │   └── health/       # Health check
│   │   ├── layout.tsx
│   │   └── page.tsx          # Landing page
│   ├── lib/
│   │   ├── schema.ts         # Drizzle schema (memories + apiKeys)
│   │   ├── db.ts             # Neon + Drizzle client
│   │   ├── auth.ts           # API key authentication
│   │   └── migrate.ts        # Migration runner
│   └── mcp/
│       └── server.ts         # MCP server (stdio transport)
├── drizzle/                  # Generated migrations
├── drizzle.config.ts
└── package.json
```

## Bootstrapping

1. Set `ROOT_API_KEY` in your environment (any strong secret)
2. Use the root key to create team API keys:

```bash
curl -X POST https://memory.buildd.dev/api/keys \
  -H "Authorization: Bearer $ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "dev-team", "teamId": "my-team"}'
```

3. Distribute the returned `mem_xxx` key to your team's agents

## License

MIT
