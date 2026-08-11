import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authEnabled, requireAuth } from './auth.js';
import { ensureSeed } from './db.js';
import { HttpError, router } from './routes.js';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const WEB_DIST = process.env.KANBAN_WEB_DIST ?? resolve(here, '..', '..', 'web', 'dist');

ensureSeed();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api', (req, res, next) => {
  if (!authEnabled || req.path === '/auth/login' || req.path === '/health') {
    next();
    return;
  }
  requireAuth(req, res, next);
});
app.use('/api', router);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve the built web app (production mode) when available.
if (existsSync(resolve(WEB_DIST, 'index.html'))) {
  app.use(express.static(WEB_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(resolve(WEB_DIST, 'index.html'));
  });
}

// Centralized error handling: consistent JSON errors for the API and the MCP server.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (message.includes('UNIQUE constraint failed')) {
    res.status(409).json({ error: 'A resource with that identifier already exists' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Agentic Kanban server listening on http://localhost:${PORT}`);
  if (authEnabled) {
    console.log('Authentication is enabled; API requests need an Authorization: Bearer token.');
  } else {
    console.log('WARNING: KANBAN_AUTH_TOKEN is not set. Anyone can access the API.');
  }
});
