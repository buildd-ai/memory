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

const ACTIONS = ["context", "search", "save", "get", "update", "delete"] as const;

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
        "3. Use `search` to find specific memories when needed",
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
          "Search, save, and manage shared team memories. Actions: context, search, save, get, update, delete.",
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
                "  save: { type, title, content, project?, tags?, files?, source? }",
                "  get: { id }",
                "  update: { id, type?, title?, content?, project?, tags?, files?, source? }",
                "  delete: { id }",
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
          return text(`Deleted memory ${params.id}`);
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
