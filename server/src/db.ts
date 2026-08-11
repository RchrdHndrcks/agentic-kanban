import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.KANBAN_DB ?? resolve(here, '..', 'data', 'kanban.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  hint TEXT NOT NULL,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  next_task_number INTEGER NOT NULL DEFAULT 1,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_columns_board ON columns(board_id, position);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assignee TEXT NOT NULL DEFAULT '',
  labels TEXT NOT NULL DEFAULT '[]',
  position REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (board_id, number)
);
CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id, created_at);
`);

// Migration: boards created before accounts existed have no owner. Their
// user_id stays NULL until the first user registers and claims them.
const boardColumns = db.prepare(`PRAGMA table_info(boards)`).all() as { name: string }[];
if (!boardColumns.some((c) => c.name === 'user_id')) {
  db.exec('ALTER TABLE boards ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
}

const tokenColumns = db.prepare(`PRAGMA table_info(api_tokens)`).all() as { name: string }[];
if (!tokenColumns.some((c) => c.name === 'hint')) {
  db.exec('ALTER TABLE api_tokens ADD COLUMN hint TEXT NOT NULL DEFAULT \'\'');
}

export const now = () => new Date().toISOString();
export const uid = () => randomUUID();

/** Gap used when appending items so that between-inserts stay cheap. */
export const POSITION_GAP = 1024;

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface BoardRow {
  id: string;
  key: string;
  name: string;
  description: string;
  next_task_number: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ColumnRow {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  board_id: string;
  column_id: string;
  number: number;
  key: string;
  title: string;
  description: string;
  priority: Priority;
  assignee: string;
  labels: string; // JSON array
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: string;
  task_id: string;
  body: string;
  author: string;
  created_at: string;
}

export function mapTask(row: TaskRow & { comment_count?: number }) {
  const { labels, ...rest } = row;
  return { ...rest, labels: JSON.parse(labels) as string[] };
}

export function boardByIdOrKey(idOrKey: string, userId: string): BoardRow | undefined {
  return db
    .prepare('SELECT * FROM boards WHERE user_id = ? AND (id = ? OR upper(key) = upper(?))')
    .get(userId, idOrKey, idOrKey) as BoardRow | undefined;
}

export function taskByIdOrKey(idOrKey: string, userId: string): TaskRow | undefined {
  return db
    .prepare(
      `SELECT t.* FROM tasks t JOIN boards b ON b.id = t.board_id
       WHERE b.user_id = ? AND (t.id = ? OR upper(t.key) = upper(?))`,
    )
    .get(userId, idOrKey, idOrKey) as TaskRow | undefined;
}

export function columnById(id: string, userId: string): ColumnRow | undefined {
  return db
    .prepare(
      `SELECT col.* FROM columns col JOIN boards b ON b.id = col.board_id
       WHERE b.user_id = ? AND col.id = ?`,
    )
    .get(userId, id) as ColumnRow | undefined;
}

/** Resolve a column by id, or by (case-insensitive) name within a board. */
export function columnByIdOrName(idOrName: string, boardId: string, userId: string): ColumnRow | undefined {
  const byId = columnById(idOrName, userId);
  if (byId) return byId;
  return db
    .prepare('SELECT * FROM columns WHERE board_id = ? AND lower(name) = lower(?)')
    .get(boardId, idOrName) as ColumnRow | undefined;
}

export function listColumns(boardId: string): ColumnRow[] {
  return db
    .prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC')
    .all(boardId) as unknown as ColumnRow[];
}

export function nextPosition(table: 'columns' | 'tasks', whereSql: string, ...params: string[]): number {
  const row = db.prepare(`SELECT MAX(position) AS max_pos FROM ${table} WHERE ${whereSql}`).get(...params) as {
    max_pos: number | null;
  };
  return (row.max_pos ?? 0) + POSITION_GAP;
}

/** Derive a short uppercase key from a board name, e.g. "Web App" -> "WA". */
export function deriveBoardKey(name: string): string {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  let base = words.map((w) => w[0]).join('').toUpperCase().slice(0, 4);
  if (base.length === 0) base = 'KB';
  let candidate = base;
  let i = 2;
  while (db.prepare('SELECT 1 FROM boards WHERE key = ?').get(candidate)) {
    candidate = `${base.slice(0, 3)}${i}`;
    i += 1;
  }
  return candidate;
}

export const DEFAULT_COLUMNS = ['Backlog', 'To do', 'In progress', 'Done'];

export function createBoardWithDefaults(
  input: { name: string; key?: string; description?: string },
  userId: string | null,
): BoardRow {
  const ts = now();
  const id = uid();
  const key = input.key ? input.key.toUpperCase() : deriveBoardKey(input.name);
  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO boards (id, key, name, description, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, key, input.name, input.description ?? '', userId, ts, ts);
    DEFAULT_COLUMNS.forEach((name, idx) => {
      db.prepare(
        'INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(uid(), id, name, (idx + 1) * POSITION_GAP, ts, ts);
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return boardByIdOrKey(id, userId ?? '')!;
}

/**
 * Claim boards created before accounts existed for the first user to
 * register. No-op once a user owns anything.
 */
export function claimOrphanBoards(userId: string): number {
  db.prepare('UPDATE boards SET user_id = ? WHERE user_id IS NULL').run(userId);
  const row = db.prepare('SELECT COUNT(*) AS c FROM boards WHERE user_id = ?').get(userId) as {
    c: number;
  };
  return row.c;
}

/** First-run experience: one default board, no tasks (empty states stay visible). */
export function ensureSeed(): void {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  const boards = db.prepare('SELECT COUNT(*) AS c FROM boards').get() as { c: number };
  if (users.c === 0 && boards.c === 0) {
    createBoardWithDefaults({ name: 'Main board' }, null);
  }
}
