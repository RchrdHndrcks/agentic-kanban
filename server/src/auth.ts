import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, now, uid } from './db.js';

const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

// ------------------------------------------------------------------ users ---

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

export function createUser(email: string, password: string): UserRow {
  const id = uid();
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    email,
    hashPassword(password),
    now(),
  );
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
}

export function userByEmail(email: string): UserRow | undefined {
  return db
    .prepare('SELECT * FROM users WHERE lower(email) = lower(?)')
    .get(email) as UserRow | undefined;
}

export function userById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function checkCredentials(email: string, password: string): UserRow | undefined {
  const user = userByEmail(email);
  if (user && verifyPassword(password, user.password_hash)) return user;
  return undefined;
}

// --------------------------------------------------------------- sessions ---

/** Create a login session and return the raw token to hand to the client. */
export function createSession(userId: string): string {
  const raw = randomBytes(32).toString('hex');
  db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(uid(), userId, digest(raw), now(), new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString());
  return raw;
}

export function userForSession(raw: string): UserRow | undefined {
  const row = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(digest(raw)) as { user_id: string; expires_at: string } | undefined;
  if (!row || row.expires_at <= now()) return undefined;
  return userById(row.user_id);
}

export function deleteSession(raw: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(raw));
}

// ------------------------------------------------------------- API tokens ---

const API_TOKEN_PREFIX = 'kt_';

export interface ApiTokenRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  hint: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/** Create an API token for agents/MCP and return the raw token (shown once). */
export function createApiToken(userId: string, name: string): string {
  const raw = `${API_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
  db.prepare(
    'INSERT INTO api_tokens (id, user_id, name, token_hash, hint, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(uid(), userId, name, digest(raw), raw.slice(0, 10), now());
  return raw;
}

export function userForApiToken(raw: string): UserRow | undefined {
  const row = db
    .prepare('SELECT user_id, revoked_at FROM api_tokens WHERE token_hash = ?')
    .get(digest(raw)) as { user_id: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) return undefined;
  db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?').run(now(), digest(raw));
  return userById(row.user_id);
}

export function listApiTokens(userId: string): (Omit<ApiTokenRow, 'token_hash' | 'hint'> & {
  prefix: string;
})[] {
  const rows = db
    .prepare('SELECT * FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC')
    .all(userId) as unknown as ApiTokenRow[];
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    prefix: row.hint,
  }));
}

export function revokeApiToken(id: string, userId: string): boolean {
  const result = db
    .prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ?')
    .run(now(), id, userId);
  return result.changes > 0;
}

// ------------------------------------------------------------- middleware ---

export type AuthedRequest = Request & { userId: string };

/** The authenticated user id; throws 401 if the request is unauthenticated. */
export function currentUser(req: Request): string {
  return (req as AuthedRequest).userId;
}

export function readBearer(req: Request): string | undefined {
  const header = req.headers.authorization ?? '';
  const [scheme, token, ...rest] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && rest.length === 0 ? token : undefined;
}

/** Resolve any raw token — login session or `kt_` API token — to its user. */
export function userForToken(raw: string): UserRow | undefined {
  return raw.startsWith(API_TOKEN_PREFIX) ? userForApiToken(raw) : userForSession(raw);
}

/**
 * Resolves the bearer token to a user. Session tokens are for the web app;
 * `kt_`-prefixed tokens are long-lived API tokens for agents (MCP).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const raw = readBearer(req);
  const user = raw ? userForToken(raw) : undefined;
  if (!user) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  (req as AuthedRequest).userId = user.id;
  next();
}