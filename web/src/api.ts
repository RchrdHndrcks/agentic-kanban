import type { Board, BoardFull, BoardMember, Comment, Priority, Task } from './types';

const BASE = '/api';
const TOKEN_KEY = 'kanban.token';

export interface User {
  id: string;
  email: string;
}

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token: string | null = getToken(),
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : undefined),
        ...(token ? { authorization: `Bearer ${token}` } : undefined),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check that the API is running and try again.');
  }
  if (res.status === 401) {
    unauthorizedHandler?.();
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

interface AuthResponse {
  user: User;
  token: string;
}

export const api = {
  health: () => request<{ ok: boolean; version: string }>('GET', '/health'),
  login: async (email: string, password: string) => {
    const result = await request<AuthResponse>('POST', '/auth/login', { email, password });
    setToken(result.token);
    return result;
  },
  register: async (email: string, password: string) => {
    const result = await request<AuthResponse>('POST', '/auth/register', { email, password }, null);
    setToken(result.token);
    return result;
  },
  me: () => request<{ user: User }>('GET', '/auth/me'),
  logout: () => request<void>('POST', '/auth/logout'),
  listTokens: () => request<ApiToken[]>('GET', '/tokens'),
  createToken: (name: string) =>
    request<ApiToken & { token: string }>('POST', '/tokens', { name }),
  revokeToken: (id: string) => request<void>('POST', `/tokens/${encodeURIComponent(id)}/revoke`),
  listBoards: () => request<Board[]>('GET', '/boards'),
  getBoard: (idOrKey: string) => request<BoardFull>('GET', `/boards/${encodeURIComponent(idOrKey)}`),
  createBoard: (input: { name: string; key?: string; description?: string }) =>
    request<Board>('POST', '/boards', input),
  deleteBoard: (idOrKey: string) => request<void>('DELETE', `/boards/${encodeURIComponent(idOrKey)}`),
  listBoardMembers: (boardId: string) =>
    request<BoardMember[]>('GET', `/boards/${encodeURIComponent(boardId)}/members`),
  addBoardMember: (boardId: string, email: string) =>
    request<BoardMember[]>('POST', `/boards/${encodeURIComponent(boardId)}/members`, { email }),
  removeBoardMember: (boardId: string, userId: string) =>
    request<void>(
      'DELETE',
      `/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(userId)}`,
    ),
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