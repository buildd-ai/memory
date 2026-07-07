# @buildd/knowledge-store

DB-agnostic hybrid retrieval engine, extracted from `@buildd/core` so buildd, the
memory service, and cue (dispatch-family) can share one implementation instead of
each reinventing embeddings + RRF. **Shared code, not shared data** — each consumer
injects its own `@neondatabase/serverless` Drizzle handle and runs against its own
database.

## What's inside

- **`VoyageEmbedder`** — Voyage AI embeddings (`voyage-4-large` prose / `voyage-code-3` code), 1024-dim, asymmetric `document`/`query` input types.
- **`PgVectorStore`** — hybrid vector + lexical search fused with Reciprocal Rank Fusion, content-hash dedup, recency/supersession, optional graph expansion.
- **`VoyageReranker`** — cross-encoder rerank (optional; RRF order stands without it).
- **chunker / ingest** — `chunkText`, `chunkMarkdown`, `chunkCode`, `ingestFiles`.
- **entity graph** — extractor / resolver / edge-builder (Phase 2+, optional).

## Usage

```ts
import { PgVectorStore, getVoyageEmbedder, getVoyageReranker } from '@buildd/knowledge-store';
import { db } from './your-app/db'; // any @neondatabase/serverless Drizzle handle

const store = new PgVectorStore(db, getVoyageEmbedder(), getVoyageReranker());

// namespace = "{scopeId}:{corpus}" — scopeId is your tenant/workspace/team id
await store.upsert('tenant-123:email', [{
  id: 'email-abc',
  content: 'Water bill $142.50 due Jul 15',
  sourceType: 'email',
  sourceTs: new Date('2026-07-01'),
  metadata: { from: 'utility@city.gov' },
}]);

const hits = await store.query('tenant-123:email', { text: 'when is the water bill due', mode: 'hybrid', topK: 5 });
```

## Schema

Apply `schema.sql` to your database (idempotent, `--> statement-breakpoint`-delimited
for HTTP drivers). The chunk table is required; the entity-graph tables are only
needed if you pass `entities`/`relations` or use `useGraph` queries.

## Requirements

- Postgres with the `vector` (pgvector) extension.
- `VOYAGE_API_KEY` in the environment (embedder/reranker return null without it, so the store degrades to lexical-only).
- `drizzle-orm` as a peer dependency.
