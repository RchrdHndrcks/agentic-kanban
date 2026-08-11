import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const TOKEN = process.env.KANBAN_AUTH_TOKEN;

/** True when an access token has been configured; otherwise the API is open. */
export const authEnabled = typeof TOKEN === 'string' && TOKEN.length > 0;

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

/** Constant-time comparison so token guessing cannot be timed. */
export function tokenMatches(candidate: string): boolean {
  if (!authEnabled) return true;
  return timingSafeEqual(digest(candidate), digest(TOKEN!));
}

export function readBearer(req: Request): string | undefined {
  const header = req.headers.authorization ?? '';
  const [scheme, token, ...rest] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && rest.length === 0 ? token : undefined;
}

/** Express middleware. Accepts a `KANBAN_AUTH_TOKEN` and rejects everything else. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authEnabled) return next();
  const token = readBearer(req);
  if (token && tokenMatches(token)) {
    next();
    return;
  }
  res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(401).json({ error: 'Unauthorized' });
}