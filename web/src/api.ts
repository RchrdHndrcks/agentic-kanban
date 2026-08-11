import type { Board, BoardFull, Comment, Priority, Task } from './types';

const BASE = '/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check that the API is running and try again.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => undefined)) as ({ error?: string } & T) | undefined;
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface TaskInput {
  title: string;
  description?: string;
  priority?: Priority;
  assignee?: string;
  labels?: string[];
  column?: string;
  column_id?: string;
}

export const api = {
  health: () => request<{ ok: boolean; version: string }>('GET', '/health'),
  listBoards: () => request<Board[]>('GET', '/boards'),
  getBoard: (idOrKey: string) => request<BoardFull>('GET', `/boards/${encodeURIComponent(idOrKey)}`),
  createBoard: (input: { name: string; key?: string; description?: string }) =>
    request<Board>('POST', '/boards', input),
  deleteBoard: (idOrKey: string) => request<void>('DELETE', `/boards/${encodeURIComponent(idOrKey)}`),
  createColumn: (boardId: string, name: string) =>
    request<BoardFull>('POST', `/boards/${encodeURIComponent(boardId)}/columns`, { name }),
  deleteColumn: (id: string) => request<void>('DELETE', `/columns/${encodeURIComponent(id)}`),
  createTask: (boardId: string, input: TaskInput) =>
    request<Task>('POST', '/tasks', { board_id: boardId, ...input }),
  updateTask: (idOrKey: string, input: Partial<TaskInput> & { position?: number }) =>
    request<Task>('PATCH', `/tasks/${encodeURIComponent(idOrKey)}`, input),
  deleteTask: (idOrKey: string) => request<void>('DELETE', `/tasks/${encodeURIComponent(idOrKey)}`),
  listComments: (taskId: string) =>
    request<Comment[]>('GET', `/tasks/${encodeURIComponent(taskId)}/comments`),
  addComment: (taskId: string, body: string, author: string) =>
    request<Comment>('POST', `/tasks/${encodeURIComponent(taskId)}/comments`, { body, author }),
};
