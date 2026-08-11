import { Router } from 'express';
import { z } from 'zod';
import {
  checkCredentials,
  createApiToken,
  createSession,
  createUser,
  currentUser,
  deleteSession,
  listApiTokens,
  revokeApiToken,
  userByEmail,
  userById,
  type ApiTokenRow,
} from './auth.js';
import {
  boardByIdOrKey,
  claimOrphanBoards,
  columnById,
  columnByIdOrName,
  createBoardWithDefaults,
  db,
  listColumns,
  mapTask,
  nextPosition,
  now,
  taskByIdOrKey,
  uid,
  type BoardRow,
  type ColumnRow,
  type CommentRow,
  type TaskRow,
} from './db.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const notFound = (what: string) => new HttpError(404, `${what} not found`);

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.join('.');
    throw new HttpError(400, path ? `${path}: ${issue.message}` : issue.message);
  }
  return result.data;
}

const prioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
const labelsSchema = z.array(z.string().trim().min(1).max(24)).max(12);

function requireBoard(idOrKey: string, userId: string): BoardRow {
  const board = boardByIdOrKey(idOrKey, userId);
  if (!board) throw notFound('Board');
  return board;
}

function requireTask(idOrKey: string, userId: string): TaskRow {
  const task = taskByIdOrKey(idOrKey, userId);
  if (!task) throw notFound('Task');
  return task;
}

function taskWithCount(id: string) {
  const row = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
       FROM tasks t WHERE t.id = ?`,
    )
    .get(id) as (TaskRow & { comment_count: number }) | undefined;
  if (!row) throw notFound('Task');
  return mapTask(row);
}

function publicBoard(row: BoardRow) {
  const { next_task_number, user_id, ...rest } = row;
  return rest;
}

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, version: '0.3.0' });
});

// ------------------------------------------------------------------ auth ---

const credentialsSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(200),
});

router.post('/auth/register', (req, res) => {
  const input = parse(credentialsSchema, req.body);
  if (userByEmail(input.email)) {
    throw new HttpError(409, 'An account with that email already exists');
  }
  const user = createUser(input.email.toLowerCase(), input.password);
  claimOrphanBoards(user.id);
  res.status(201).json({ user: { id: user.id, email: user.email }, token: createSession(user.id) });
});

router.post('/auth/login', (req, res) => {
  const input = parse(credentialsSchema, req.body);
  const user = checkCredentials(input.email, input.password);
  if (!user) throw new HttpError(401, 'Invalid email or password');
  res.json({ user: { id: user.id, email: user.email }, token: createSession(user.id) });
});

router.post('/auth/logout', (req, res) => {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token) deleteSession(token);
  res.status(204).end();
});

router.get('/auth/me', (req, res) => {
  res.json({ user: { id: currentUser(req), email: userById(currentUser(req))?.email } });
});

// -------------------------------------------------------------- API tokens ---

router.get('/tokens', (req, res) => {
  const userId = currentUser(req);
  res.json(listApiTokens(userId));
});

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

router.post('/tokens', (req, res) => {
  const input = parse(createTokenSchema, req.body);
  const userId = currentUser(req);
  const raw = createApiToken(userId, input.name);
  const row = db
    .prepare('SELECT id, name, created_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC')
    .get(userId) as Omit<ApiTokenRow, 'token_hash' | 'last_used_at' | 'revoked_at'>;
  res.status(201).json({ ...row, token: raw });
});

router.post('/tokens/:id/revoke', (req, res) => {
  if (!revokeApiToken(req.params.id, currentUser(req))) throw notFound('Token');
  res.status(204).end();
});

// ---------------------------------------------------------------- boards ---

router.get('/boards', (req, res) => {
  const userId = currentUser(req);
  const rows = db
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM tasks t WHERE t.board_id = b.id) AS task_count
       FROM boards b WHERE b.user_id = ? ORDER BY b.created_at ASC`,
    )
    .all(userId) as unknown as (BoardRow & { task_count: number })[];
  res.json(rows.map(publicBoard));
});

const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(80),
  key: z.string().trim().min(2).max(6).regex(/^[a-zA-Z0-9]+$/).optional(),
  description: z.string().max(500).optional(),
});

router.post('/boards', (req, res) => {
  const input = parse(createBoardSchema, req.body);
  if (input.key && boardByIdOrKey(input.key, currentUser(req))) {
    throw new HttpError(409, `Board key "${input.key.toUpperCase()}" is already taken`);
  }
  const board = createBoardWithDefaults(input, currentUser(req));
  res.status(201).json(publicBoard(board));
});

router.get('/boards/:boardId', (req, res) => {
  const board = requireBoard(req.params.boardId, currentUser(req));
  const columns = listColumns(board.id).map((col) => {
    const tasks = db
      .prepare(
        `SELECT t.*, (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
         FROM tasks t WHERE t.column_id = ? ORDER BY t.position ASC`,
      )
      .all(col.id) as unknown as (TaskRow & { comment_count: number })[];
    return { ...col, tasks: tasks.map(mapTask) };
  });
  res.json({ ...publicBoard(board), columns });
});

const updateBoardSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
});

router.patch('/boards/:boardId', (req, res) => {
  const userId = currentUser(req);
  const board = requireBoard(req.params.boardId, userId);
  const input = parse(updateBoardSchema, req.body);
  db.prepare('UPDATE boards SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
    input.name ?? board.name,
    input.description ?? board.description,
    now(),
    board.id,
  );
  res.json(publicBoard(requireBoard(board.id, userId)));
});

router.delete('/boards/:boardId', (req, res) => {
  const board = requireBoard(req.params.boardId, currentUser(req));
  db.prepare('DELETE FROM boards WHERE id = ?').run(board.id);
  res.status(204).end();
});

// --------------------------------------------------------------- columns ---

const createColumnSchema = z.object({
  name: z.string().trim().min(1).max(40),
  position: z.number().optional(),
});

router.post('/boards/:boardId/columns', (req, res) => {
  const board = requireBoard(req.params.boardId, currentUser(req));
  const input = parse(createColumnSchema, req.body);
  const ts = now();
  const id = uid();
  const position = input.position ?? nextPosition('columns', 'board_id = ?', board.id);
  db.prepare(
    'INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, board.id, input.name, position, ts, ts);
  res.status(201).json(columnById(id, currentUser(req)));
});

const updateColumnSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  position: z.number().optional(),
});

router.patch('/columns/:id', (req, res) => {
  const userId = currentUser(req);
  const column = columnById(req.params.id, userId);
  if (!column) throw notFound('Column');
  const input = parse(updateColumnSchema, req.body);
  db.prepare('UPDATE columns SET name = ?, position = ?, updated_at = ? WHERE id = ?').run(
    input.name ?? column.name,
    input.position ?? column.position,
    now(),
    column.id,
  );
  res.json(columnById(column.id, userId));
});

router.delete('/columns/:id', (req, res) => {
  const userId = currentUser(req);
  const column = columnById(req.params.id, userId);
  if (!column) throw notFound('Column');
  const siblings = listColumns(column.board_id);
  if (siblings.length <= 1) {
    throw new HttpError(400, 'A board needs at least one column');
  }
  db.prepare('DELETE FROM columns WHERE id = ?').run(column.id);
  res.status(204).end();
});

// ----------------------------------------------------------------- tasks ---

router.get('/tasks', (req, res) => {
  const userId = currentUser(req);
  const { board, column, assignee, label, q } = req.query as Record<string, string | undefined>;
  const clauses: string[] = ['b.user_id = ?'];
  const params: string[] = [userId];

  if (board) {
    const b = requireBoard(board, userId);
    clauses.push('t.board_id = ?');
    params.push(b.id);
  }
  if (column) {
    clauses.push('(t.column_id = ? OR lower(col.name) = lower(?))');
    params.push(column, column);
  }
  if (assignee) {
    clauses.push('lower(t.assignee) = lower(?)');
    params.push(assignee);
  }
  if (label) {
    clauses.push('EXISTS (SELECT 1 FROM json_each(t.labels) je WHERE lower(je.value) = lower(?))');
    params.push(label);
  }
  if (q) {
    clauses.push('(t.title LIKE ? OR t.description LIKE ? OR upper(t.key) = upper(?))');
    const like = `%${q}%`;
    params.push(like, like, q);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
       FROM tasks t JOIN columns col ON col.id = t.column_id
       JOIN boards b ON b.id = t.board_id
       ${where} ORDER BY col.position ASC, t.position ASC`,
    )
    .all(...params) as unknown as (TaskRow & { comment_count: number })[];
  res.json(rows.map(mapTask));
});

const createTaskSchema = z.object({
  board: z.string().trim().min(1).optional(),
  board_id: z.string().trim().min(1).optional(),
  column: z.string().trim().min(1).optional(),
  column_id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: prioritySchema.optional(),
  assignee: z.string().trim().max(60).optional(),
  labels: labelsSchema.optional(),
});

router.post('/tasks', (req, res) => {
  const userId = currentUser(req);
  const input = parse(createTaskSchema, req.body);
  const boardRef = input.board_id ?? input.board;
  if (!boardRef) throw new HttpError(400, 'board (id or key) is required');
  const board = requireBoard(boardRef, userId);

  const columnRef = input.column_id ?? input.column;
  const column = columnRef
    ? columnByIdOrName(columnRef, board.id, userId)
    : listColumns(board.id)[0];
  if (!column || column.board_id !== board.id) throw notFound('Column');

  const ts = now();
  const id = uid();
  db.exec('BEGIN IMMEDIATE');
  try {
    const fresh = db.prepare('SELECT next_task_number FROM boards WHERE id = ?').get(board.id) as {
      next_task_number: number;
    };
    const number = fresh.next_task_number;
    const key = `${board.key}-${number}`;
    const position = nextPosition('tasks', 'column_id = ?', column.id);
    db.prepare(
      `INSERT INTO tasks (id, board_id, column_id, number, key, title, description, priority, assignee, labels, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      board.id,
      column.id,
      number,
      key,
      input.title,
      input.description ?? '',
      input.priority ?? 'medium',
      input.assignee ?? '',
      JSON.stringify(input.labels ?? []),
      position,
      ts,
      ts,
    );
    db.prepare('UPDATE boards SET next_task_number = ?, updated_at = ? WHERE id = ?').run(
      number + 1,
      ts,
      board.id,
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.status(201).json(taskWithCount(id));
});

router.get('/tasks/:taskId', (req, res) => {
  const task = requireTask(req.params.taskId, currentUser(req));
  res.json(taskWithCount(task.id));
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  priority: prioritySchema.optional(),
  assignee: z.string().trim().max(60).optional(),
  labels: labelsSchema.optional(),
  column: z.string().trim().min(1).optional(),
  column_id: z.string().trim().min(1).optional(),
  position: z.number().optional(),
});

router.patch('/tasks/:taskId', (req, res) => {
  const userId = currentUser(req);
  const task = requireTask(req.params.taskId, userId);
  const input = parse(updateTaskSchema, req.body);

  let columnId = task.column_id;
  let position = task.position;
  const columnRef = input.column_id ?? input.column;
  if (columnRef) {
    const column = columnByIdOrName(columnRef, task.board_id, userId);
    if (!column || column.board_id !== task.board_id) throw notFound('Column');
    columnId = column.id;
    if (column.id !== task.column_id && input.position === undefined) {
      position = nextPosition('tasks', 'column_id = ?', column.id);
    }
  }
  if (input.position !== undefined) position = input.position;

  db.prepare(
    `UPDATE tasks SET title = ?, description = ?, priority = ?, assignee = ?, labels = ?,
       column_id = ?, position = ?, updated_at = ? WHERE id = ?`,
  ).run(
    input.title ?? task.title,
    input.description ?? task.description,
    input.priority ?? task.priority,
    input.assignee ?? task.assignee,
    input.labels !== undefined ? JSON.stringify(input.labels) : task.labels,
    columnId,
    position,
    now(),
    task.id,
  );
  res.json(taskWithCount(task.id));
});

const moveTaskSchema = z.object({
  column: z.string().trim().min(1),
  position: z.number().optional(),
});

router.post('/tasks/:taskId/move', (req, res) => {
  const userId = currentUser(req);
  const task = requireTask(req.params.taskId, userId);
  const input = parse(moveTaskSchema, req.body);
  const column = columnByIdOrName(input.column, task.board_id, userId);
  if (!column || column.board_id !== task.board_id) throw notFound('Column');
  const position =
    input.position ??
    (column.id === task.column_id ? task.position : nextPosition('tasks', 'column_id = ?', column.id));
  db.prepare('UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?').run(
    column.id,
    position,
    now(),
    task.id,
  );
  res.json(taskWithCount(task.id));
});

router.delete('/tasks/:taskId', (req, res) => {
  const task = requireTask(req.params.taskId, currentUser(req));
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  res.status(204).end();
});

// -------------------------------------------------------------- comments ---

router.get('/tasks/:taskId/comments', (req, res) => {
  const task = requireTask(req.params.taskId, currentUser(req));
  const rows = db
    .prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(task.id) as unknown as CommentRow[];
  res.json(rows);
});

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  author: z.string().trim().max(60).optional(),
});

router.post('/tasks/:taskId/comments', (req, res) => {
  const task = requireTask(req.params.taskId, currentUser(req));
  const input = parse(createCommentSchema, req.body);
  const id = uid();
  db.prepare('INSERT INTO comments (id, task_id, body, author, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    task.id,
    input.body,
    input.author ?? '',
    now(),
  );
  db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(now(), task.id);
  res.status(201).json(db.prepare('SELECT * FROM comments WHERE id = ?').get(id));
});
