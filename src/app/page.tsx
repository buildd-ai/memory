export const metadata = {
  title: 'Buildd Memory — retired',
  description:
    'The standalone Buildd Memory service has been retired. Memory is now built into buildd.',
};

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '80px auto', fontFamily: 'system-ui, sans-serif', padding: '0 20px', lineHeight: 1.6 }}>
      <h1>Buildd Memory has moved</h1>

      <p>
        This service has been retired. Memory is now built into buildd and backed by
        buildd&apos;s own database, so there is no separate service to sign up for, no
        separate API key, and nothing to install.
      </p>

      <h2>If you were using this API</h2>
      <p>
        Every endpoint under <code>/api</code> now returns <code>410 Gone</code>, and
        existing <code>mem_*</code> keys no longer authenticate. Agents should use the
        buildd MCP server&apos;s <code>recall</code> and <code>learn</code> tools
        instead; memories are scoped to your buildd team, as they were here.
      </p>
      <p>
        <a href="https://buildd.dev">Go to buildd</a>
      </p>

      <h2>If you were using the library</h2>
      <p>
        <code>@buildd-ai/knowledge-store</code> is unaffected. It is a library, published
        to GitHub Packages, and it never depended on this service — shared code, not
        shared data.
      </p>

      <p style={{ marginTop: 48, fontSize: 14, color: '#666' }}>
        Retired 2026-08-30. All existing memories were migrated to buildd; nothing was
        deleted.
      </p>
    </main>
  );
}
