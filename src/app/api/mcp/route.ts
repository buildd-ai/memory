/**
 * Streamable HTTP MCP Server — remote, stateless, serverless-compatible.
 *
 * Exposes the same memory tools as the stdio MCP server, but over HTTP
 * using the MCP Streamable HTTP transport.
 *
 * Auth: Bearer token or x-api-key header.
 * Stateless (no sessions) — compatible with Vercel serverless.
 * JSON responses (no SSE) — avoids streaming timeout issues.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { authenticateKey, type AuthContext } from "@/lib/auth";

// ── Auth Helper ──────────────────────────────────────────────────────────────

function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.headers.get("x-api-key");
}

// ── API Wrapper ──────────────────────────────────────────────────────────────

function createApi(apiKey: string) {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXTAUTH_URL || "http://localhost:3002";

  return async (path: string, options: RequestInit = {}): Promise<unknown> => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json();
  };
}

// ── MCP Server Factory ──────────────────────────────────────────────────────

type ApiFn = (path: string, options?: RequestInit) => Promise<unknown>;

const ACTIONS = ["context", "search", "batch", "save", "get", "update", "delete", "archive", "cleanup"] as const;

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function createMcpServer(api: ApiFn, auth: AuthContext) {
  const server = new Server(
    { name: "buildd-memory", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: [
        "Buildd Memory — shared team memory for AI agents.",
        "Use `memory` tool to search, save, and manage team knowledge.",
        "",
        "Workflow:",
        "1. At session start, call `context` to load relevant memories",
        "2. When you learn something important, call `save` to persist it",
        "3. Use `search` to find specific memories, then `batch` to fetch full content",
        "",
        "Memory types: discovery, decision, gotcha, pattern, architecture, summary",
      ].join("\n"),
    }
  );

  // ── Tool listing ────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "memory",
        description:
          "Search, save, and manage shared team memories. Actions: context, search, batch, save, get, update, delete, archive, cleanup.",
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
        inputSchema: {
          type: "object" as const,
          properties: {
            action: {
              type: "string" as const,
              description: `Action to perform: ${ACTIONS.join(", ")}`,
              enum: ACTIONS as unknown as string[],
            },
            params: {
              type: "object" as const,
              description: [
                "Action-specific parameters:",
                "  context: { project? }",
                "  search: { query?, type?, project?, files?, limit?, offset? }",
                "  batch: { ids } — fetch full content for multiple memories (1-20 IDs)",
                "  save: { type, title, content, project?, tags?, files?, source? }",
                "  get: { id }",
                "  update: { id, type?, title?, content?, project?, tags?, files?, source? }",
                "  delete: { id }",
                "  archive: { ids } — bulk archive memories (1-50 IDs)",
                "  cleanup: { project?, stale_days? } — list stale memories not accessed in N days (default 90)",
              ].join("\n"),
            },
          },
          required: ["action"],
        },
      },
    ],
  }));

  // ── Tool handler ────────────────────────────────────────────────────────

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name !== "memory") {
      return { ...text(`Unknown tool: ${name}`), isError: true };
    }

    const action = args?.action as string;
    const params = (args?.params || {}) as Record<string, unknown>;

    try {
      switch (action) {
        case "context": {
          const qs = params.project
            ? `?project=${encodeURIComponent(String(params.project))}`
            : "";
          const data = (await api(`/api/memories/context${qs}`)) as {
            markdown: string;
            count: number;
          };
          return text(data.markdown || "(No memories yet)");
        }

        case "search": {
          const searchParams = new URLSearchParams();
          if (params.query) searchParams.set("query", String(params.query));
          if (params.type) searchParams.set("type", String(params.type));
          if (params.project) searchParams.set("project", String(params.project));
          if (params.files) searchParams.set("files", String(params.files));
          if (params.limit) searchParams.set("limit", String(params.limit));
          if (params.offset) searchParams.set("offset", String(params.offset));
          const qs = searchParams.toString();
          const data = (await api(
            `/api/memories/search${qs ? `?${qs}` : ""}`
          )) as {
            results: Array<{
              id: string;
              title: string;
              type: string;
              project?: string;
              tags?: string[];
              files?: string[];
            }>;
            total: number;
          };

          if (data.results.length === 0) {
            return text("No memories found matching your search.");
          }

          const lines = data.results.map((m) => {
            const meta = [m.type, m.project].filter(Boolean).join(", ");
            return `- **${m.title}** (${meta}) [id: ${m.id}]`;
          });
          return text(`Found ${data.total} memories:\n\n${lines.join("\n")}`);
        }

        case "batch": {
          const ids = params.ids;
          if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return { ...text("Required: ids (array of memory IDs, 1-20)"), isError: true };
          }
          if (ids.length > 20) {
            return { ...text("Maximum 20 IDs per batch request"), isError: true };
          }
          const qs = `?ids=${ids.map(String).join(",")}`;
          const data = (await api(`/api/memories/batch${qs}`)) as {
            memories: Array<{
              id: string;
              type: string;
              title: string;
              content: string;
              project?: string;
              tags?: string[];
              files?: string[];
              source?: string;
            }>;
          };
          if (data.memories.length === 0) {
            return text("No memories found for the given IDs.");
          }
          const sections = data.memories.map((m) => {
            const meta = [
              `Type: ${m.type}`,
              m.project && `Project: ${m.project}`,
              m.tags?.length && `Tags: ${m.tags.join(", ")}`,
              m.files?.length && `Files: ${m.files.join(", ")}`,
            ]
              .filter(Boolean)
              .join(" | ");
            return `## ${m.title}\n${meta}\n\n${m.content}`;
          });
          return text(sections.join("\n\n---\n\n"));
        }

        case "save": {
          if (auth.readOnly) {
            return { ...text("Error: read-only API key"), isError: true };
          }
          if (!params.type || !params.title || !params.content) {
            return { ...text("Required: type, title, content"), isError: true };
          }
          const data = (await api("/api/memories", {
            method: "POST",
            body: JSON.stringify({
              type: params.type,
              title: params.title,
              content: params.content,
              project: params.project || null,
              tags: params.tags || [],
              files: params.files || [],
              source: params.source || "mcp-agent",
            }),
          })) as { memory: { id: string; title: string } };
          return text(
            `Saved memory: "${data.memory.title}" (id: ${data.memory.id})`
          );
        }

        case "get": {
          if (!params.id) {
            return { ...text("Required: id"), isError: true };
          }
          const data = (await api(`/api/memories/${params.id}`)) as {
            memory: {
              id: string;
              type: string;
              title: string;
              content: string;
              project?: string;
              tags?: string[];
              files?: string[];
              source?: string;
            };
          };
          const m = data.memory;
          const meta = [
            `Type: ${m.type}`,
            m.project && `Project: ${m.project}`,
            m.tags?.length && `Tags: ${m.tags.join(", ")}`,
            m.files?.length && `Files: ${m.files.join(", ")}`,
            m.source && `Source: ${m.source}`,
          ]
            .filter(Boolean)
            .join("\n");
          return text(`# ${m.title}\n\n${meta}\n\n${m.content}`);
        }

        case "update": {
          if (auth.readOnly) {
            return { ...text("Error: read-only API key"), isError: true };
          }
          if (!params.id) {
            return { ...text("Required: id"), isError: true };
          }
          const { id, ...updateFields } = params;
          const data = (await api(`/api/memories/${id}`, {
            method: "PATCH",
            body: JSON.stringify(updateFields),
          })) as { memory: { id: string; title: string } };
          return text(`Updated memory: "${data.memory.title}"`);
        }

        case "delete": {
          if (auth.readOnly) {
            return { ...text("Error: read-only API key"), isError: true };
          }
          if (!params.id) {
            return { ...text("Required: id"), isError: true };
          }
          await api(`/api/memories/${params.id}`, { method: "DELETE" });
          return text(`Archived memory ${params.id}`);
        }

        case "archive": {
          if (auth.readOnly) {
            return { ...text("Error: read-only API key"), isError: true };
          }
          const ids = params.ids;
          if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return { ...text("Required: ids (array of memory IDs, 1-50)"), isError: true };
          }
          if (ids.length > 50) {
            return { ...text("Maximum 50 IDs per archive request"), isError: true };
          }
          const archiveData = (await api("/api/memories/bulk-archive", {
            method: "POST",
            body: JSON.stringify({ ids }),
          })) as { archived: number; ids: string[] };
          return text(`Archived ${archiveData.archived} memories`);
        }

        case "cleanup": {
          const staleDays = params.stale_days ? Number(params.stale_days) : 90;
          const cleanupParams = new URLSearchParams();
          cleanupParams.set("stale_days", String(staleDays));
          cleanupParams.set("limit", "50");
          if (params.project) cleanupParams.set("project", String(params.project));
          const cleanupData = (await api(`/api/memories?${cleanupParams.toString()}`)) as {
            memories: Array<{
              id: string;
              title: string;
              type: string;
              project?: string;
              lastAccessedAt?: string;
              createdAt: string;
            }>;
          };
          if (cleanupData.memories.length === 0) {
            return text(`No stale memories found (threshold: ${staleDays} days).`);
          }
          const lines = cleanupData.memories.map((m) => {
            const lastAccess = m.lastAccessedAt
              ? `last accessed: ${m.lastAccessedAt.slice(0, 10)}`
              : `created: ${m.createdAt.slice(0, 10)}, never accessed`;
            return `- **${m.title}** (${m.type}) [id: ${m.id}] — ${lastAccess}`;
          });
          return text(
            `Found ${cleanupData.memories.length} stale memories (not accessed in ${staleDays}+ days):\n\n${lines.join("\n")}\n\nUse \`archive\` action with these IDs to archive them.`
          );
        }

        default:
          return {
            ...text(
              `Unknown action: ${action}. Available: ${ACTIONS.join(", ")}`
            ),
            isError: true,
          };
      }
    } catch (error) {
      return {
        ...text(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        ),
        isError: true,
      };
    }
  });

  return server;
}

// ── Request Handler ──────────────────────────────────────────────────────────

async function handleMcpRequest(req: Request): Promise<Response> {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing API key. Use Authorization: Bearer <key> or x-api-key header." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const auth = await authenticateKey(apiKey);
  if (!auth) {
    return new Response(
      JSON.stringify({ error: "Invalid API key" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const api = createApi(apiKey);
  const server = createMcpServer(api, auth);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(req);
  } finally {
    await transport.close();
    await server.close();
  }
}

// ── Next.js Route Handlers ───────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  return handleMcpRequest(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return handleMcpRequest(req);
}
