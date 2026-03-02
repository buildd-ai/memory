export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '80px auto', fontFamily: 'system-ui, sans-serif', padding: '0 20px' }}>
      <h1>Buildd Memory</h1>
      <p>Shared team memory for AI agents. Postgres-backed, MCP-native.</p>

      <h2>Endpoints</h2>
      <ul>
        <li><code>GET /api/memories/context</code> — Markdown context for agent injection</li>
        <li><code>GET /api/memories/search</code> — Search memories (compact index)</li>
        <li><code>GET /api/memories/batch?ids=...</code> — Fetch full content by IDs</li>
        <li><code>POST /api/memories</code> — Create a memory</li>
        <li><code>GET /api/memories/:id</code> — Get single memory</li>
        <li><code>PATCH /api/memories/:id</code> — Update a memory</li>
        <li><code>DELETE /api/memories/:id</code> — Delete a memory</li>
        <li><code>GET /api/keys</code> — List API keys</li>
        <li><code>POST /api/keys</code> — Create API key</li>
        <li><code>GET /api/health</code> — Health check</li>
      </ul>

      <h2>MCP Integration</h2>
      <p>Add to your <code>.mcp.json</code>:</p>
      <pre style={{ background: '#f4f4f4', padding: 16, borderRadius: 8, overflow: 'auto' }}>{`{
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
}`}</pre>

      <p style={{ marginTop: 40, color: '#666', fontSize: 14 }}>
        <a href="https://github.com/AugmentedMind-Team/buildd-memory">GitHub</a>
      </p>
    </main>
  );
}
