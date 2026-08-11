#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = (process.env.KANBAN_API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
const DEFAULT_AUTHOR = process.env.KANBAN_AUTHOR ?? 'agent';

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Could not reach the Kanban API at ${API_URL}. Is the server running?`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(`Unexpected response from the Kanban API (${res.status})`);
  }
  if (!res.ok) {
    const message = (data as { error?: string } | undefined)?.error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
  };
}

const taskRef = z
  .string()
  .min(1)
  .describe('Task id, or human key like "MAIN-3" (case-insensitive)');
const boardRef = z.string().min(1).describe('Board id, or board key like "MAIN" (case-insensitive)');
const columnRef = z.string().min(1).describe('Column id, or column name like "In progress"');
const priority = z.enum(['low', 'medium', 'high', 'urgent']);

const server = new McpServer({
  name: 'agentic-kanban',
  version: '0.1.0',
});

server.tool(
  'list_boards',
  'List all kanban boards with their keys and task counts. Use the board key (e.g. "MAIN") when calling other tools.',
  {},
  async () => {
    try {
      return ok(await api('GET', '/boards'));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  'get_board',
  'Get a board with all its columns and tasks, ordered as shown in the UI.',
  { board: boardRef },
  async ({ board }) => {
    try {
      return ok(await api('GET', `/boards/${encodeURIComponent(board)}`));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  'create_board',
  'Create a new kanban board with default columns (Backlog, To do, In progress, Done).',
  {
    name: z.string().min(1).max(80).describe('Board name'),
    key: z
      .string()
      .min(2)
      .max(6)
      .regex(/^[a-zA-Z0-9]+$/)
      .optional()
      .describe('Short uppercase prefix for task keys, e.g. "WEB" -> WEB-1. Derived from the name if omitted.'),
    description: z.string().max(500).optional(),
  },
  async ({ name, key, description }) => {
    try {
      return ok(await api('POST', '/boards', { name, key, description }));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  'list_tasks',
  'List tasks, optionally filtered by board, column, assignee, label or a free-text query.',
  {
    board: boardRef.optional(),
    column: columnRef.optional(),
    assignee: z.string().optional().describe('Exact assignee name (case-insensitive)'),
    label: z.string().optional(),
    query: z.string().optional().describe('Matches title, description or task key'),
  },
  async ({ board, column, assignee, label, query }) => {
    try {
      const params = new URLSearchParams();
      if (board) params.set('board', board);
      if (column) params.set('column', column);
      if (assignee) params.set('assignee', assignee);
      if (label) params.set('label', label);
      if (query) params.set('q', query);
      const qs = params.toString();
      return ok(await api('GET', `/tasks${qs ? `?${qs}` : ''}`));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  'get_task',
  'Get full details of a single task, including its description, labels and comment count.',
  { task: taskRef },
  async ({ task }) => {
    try {
      return ok(await api('GET', `/tasks/${encodeURIComponent(task)}`));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  'create_task',
  'Create a task on a board. If no column is given, the task goes to the first column. Returns the created task with its key (e.g. "MAIN-4").',
  {
    board: boardRef,
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional().describe('Markdown-friendly task description'),
    column: columnRef.optional().describe('Target column; defaults to the first column'),
    priority: priority.optional().describe('Defaults to "medium"'),
    assignee: z
      .string()
      .max(60)
      .optional()
      .describe('Who the task is assigned to, e.g. "ana" or "agent:claude"'),
    labels: z.array(z.string().min(1).max(24)).max(12).optional(),
  },
  async ({ board, title, description, column, priority: prio, assignee, labels }) => {
    try {
      return ok(
        await api('POST', '/tasks', { board, title, description, column, priority: prio, assignee, labels }),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  'update_task',
  'Update a task\'s title, description, priority, assignee or labels. Only the fields provided are changed.',
  {
    task: taskRef,
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    priority: priority.optional(),
    assignee: z.string().max(60).optional().describe('Pass an empty string to unassign'),
    labels: z.array(z.string().min(1).max(24)).max(12).optional().describe('Replaces all labels'),
  },
  async ({ task, ...fields }) => {
    try {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      return ok(await api('PATCH', `/tasks/${encodeURIComponent(task)}`, body));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  'move_task',
  'Move a task to another column (by column name or id), optionally at an explicit position.',
  {
    task: taskRef,
    column: columnRef,
    position: z.number().optional().describe('Ordering hint; omit to append to the column'),
  },
  async ({ task, column, position }) => {
    try {
      return ok(await api('POST', `/tasks/${encodeURIComponent(task)}/move`, { column, position }));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  'delete_task',
  'Permanently delete a task and its comments.',
  { task: taskRef },
  async ({ task }) => {
    try {
      await api('DELETE', `/tasks/${encodeURIComponent(task)}`);
      return ok({ deleted: task });
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  'add_comment',
  'Add a comment to a task. Useful for reporting progress or results.',
  {
    task: taskRef,
    body: z.string().min(1).max(2000),
    author: z.string().max(60).optional().describe('Defaults to the KANBAN_AUTHOR env var or "agent"'),
  },
  async ({ task, body, author }) => {
    try {
      return ok(
        await api('POST', `/tasks/${encodeURIComponent(task)}/comments`, {
          body,
          author: author ?? DEFAULT_AUTHOR,
        }),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  'list_comments',
  'List all comments on a task, oldest first.',
  { task: taskRef },
  async ({ task }) => {
    try {
      return ok(await api('GET', `/tasks/${encodeURIComponent(task)}/comments`));
    } catch (err) {
      return fail(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
