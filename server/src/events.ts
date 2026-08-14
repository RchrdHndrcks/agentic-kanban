import type { Response } from 'express';

/**
 * In-process Server-Sent Events hub. Each connected browser tab registers its
 * response object; mutations are fanned out to every collaborator of the
 * affected board so other clients can soft-refresh in real time.
 */

const clients = new Map<string, Set<Response>>();

export function addClient(userId: string, res: Response): () => void {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add(res);
  return () => {
    const current = clients.get(userId);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) clients.delete(userId);
  };
}

export function emitToUsers(userIds: Iterable<string>, event: 'board' | 'boards', data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const userId of userIds) {
    const set = clients.get(userId);
    if (!set) continue;
    for (const res of set) {
      try {
        res.write(payload);
      } catch {
        // The socket died mid-write; its close handler will clean it up.
      }
    }
  }
}
