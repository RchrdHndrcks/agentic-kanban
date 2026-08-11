// Smoke test: spawn the MCP server over stdio and exercise its tools.
// Usage: node scripts/smoke-test.mjs  (requires the API server to be running
// and KANBAN_AUTH_TOKEN set to one of your API tokens)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));

if (!process.env.KANBAN_AUTH_TOKEN) {
  console.warn(
    'WARNING: KANBAN_AUTH_TOKEN is not set. Create an API token in the web app (API tokens) and retry.',
  );
}

const transport = new StdioClientTransport({
  command: 'node',
  args: [resolve(here, '..', 'dist', 'index.js')],
  env: { ...process.env, KANBAN_API_URL: process.env.KANBAN_API_URL ?? 'http://localhost:3001/api' },
});

const client = new Client({ name: 'mcp-smoke-test', version: '0.1.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('TOOLS:', tools.map((t) => t.name).join(', '));

const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? '(empty)';
  console.log(`\n== ${name} ==`);
  console.log(text.slice(0, 280));
  return JSON.parse(text);
};

await call('list_boards', {});
const created = await call('create_task', {
  board: 'MB',
  title: 'Refactor webhook retry logic',
  column: 'To do',
  priority: 'high',
  assignee: 'agent:kimi',
  labels: ['backend'],
});
await call('get_task', { task: created.key });
await call('move_task', { task: created.key, column: 'In progress' });
await call('update_task', { task: created.key, assignee: 'agent:kimi', labels: ['backend', 'urgent-fix'] });
await call('add_comment', { task: created.key, body: 'Picked up, working on it.' });
await call('list_comments', { task: created.key });
await call('list_tasks', { board: 'MB', column: 'In progress' });
await call('delete_task', { task: created.key });

await client.close();
console.log('\nMCP SMOKE TEST OK');
