#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.MEMORY_API_URL || "http://localhost:3002";
const API_KEY = process.env.MEMORY_API_KEY || "";

if (!API_KEY) {
  console.error("MEMORY_API_KEY is required. Set it in your environment.");
  process.exit(1);
}

async function api(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

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

// --- Tool definitions ---

const ACTIONS = [
  "context",
  "search",
  "save",
  "get",
  "update",
  "delete",
] as const;

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

// --- Tool handler ---

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
        const qs = params.project ? `?project=${encodeURIComponent(String(params.project))}` : "";
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
        const data = (await api(`/api/memories/search${qs ? `?${qs}` : ""}`)) as {
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
        return text(
          `Found ${data.total} memories:\n\n${lines.join("\n")}`
        );
      }

      case "save": {
        if (!params.type || !params.title || !params.content) {
          return {
            ...text("Required: type, title, content"),
            isError: true,
          };
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
        return text(`Saved memory: "${data.memory.title}" (id: ${data.memory.id})`);
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
        if (!params.id) {
          return { ...text("Required: id"), isError: true };
        }
        await api(`/api/memories/${params.id}`, { method: "DELETE" });
        return text(`Deleted memory ${params.id}`);
      }

      default:
        return {
          ...text(`Unknown action: ${action}. Available: ${ACTIONS.join(", ")}`),
          isError: true,
        };
    }
  } catch (error) {
    return {
      ...text(`Error: ${error instanceof Error ? error.message : "Unknown error"}`),
      isError: true,
    };
  }
});

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("buildd-memory MCP server running");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
