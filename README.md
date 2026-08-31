# buildd-ai/memory

A library repo. It publishes **`@buildd-ai/knowledge-store`** — a database-agnostic
retrieval engine — to GitHub Packages.

> ### The hosted service is retired
>
> This repo used to run a standalone memory service at `memory.buildd.dev`.
> **That service was retired on 2026-08-30.** Every route under `/api` now
> returns `410 Gone`, existing `mem_*` keys no longer authenticate, and the
> memories were migrated into buildd's own database.
>
> Memory is a built-in buildd feature now: agents reach it through the `recall`
> and `learn` MCP tools, scoped to a buildd team. There is no separate service to
> sign up for, no second API key, and nothing to install. See
> [buildd.dev](https://buildd.dev).
>
> The `src/` tree here is the retired service, kept for history. Nothing in it
> should be treated as a live deployment target.

## `@buildd-ai/knowledge-store`

The part of this repo that is alive. Extracted from `@buildd/core` so retrieval
could be reused without dragging along a specific database or app framework.

- Chunking, embedding and hybrid (vector + lexical) retrieval
- Corpus-aware ranking: per-corpus authority weights and half-lives, with
  recency×authority applied after reranking
- Supersession, so a newer chunk can retire an older one without deleting it
- `PgVectorStore` for Postgres/pgvector; the retrieval engine itself is
  storage-agnostic

The contract is deliberately *shared code, not shared data*. Each consumer owns
its own tables and namespaces; this package never reaches across a tenant
boundary for you.

### Installing

Published to **GitHub Packages**, not npmjs.com. That registry requires
authentication even for public packages, so a consumer needs an `.npmrc`:

```
@buildd-ai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

with `NODE_AUTH_TOKEN` set to a token carrying `read:packages`.

```
npm install @buildd-ai/knowledge-store
```

Pin it exactly. The package has already shipped one breaking change, and
consumers in this org pin exact versions rather than ranges.

### Publishing

`.github/workflows/publish-knowledge-store.yml`, on a version bump. Because that
workflow lives here, **this repo must not be archived** — archiving makes a
repository read-only and the publish workflow would stop being able to run.

## Licence

Apache-2.0 — see [LICENSE](LICENSE). Copyright the Buildd authors.

Apache-2.0 rather than MIT for the explicit patent grant, which matters for a
library intended to be embedded in other people's software.

Note that "public" and "open source" are not the same thing: this repo was public
for a long time with no licence, which meant all rights reserved and no legal
right to use it. The licence is what changes that.
