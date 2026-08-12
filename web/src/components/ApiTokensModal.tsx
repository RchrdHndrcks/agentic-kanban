import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type ApiToken } from '../api';
import { useToast } from './Toasts';
import { ModalShell } from './Modals';

export default function ApiTokensModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .listTokens()
      .then(setTokens)
      .catch((err) => toast(err instanceof Error ? err.message : 'Could not load tokens.', 'error'));
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await api.createToken(name.trim());
      setFresh({ name: created.name, token: created.token });
      setTokens(await api.listTokens());
      setName('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create the token.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!fresh) return;
    const text = fresh.token;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    toast('Token copied');
    setFresh(null);
  };

  const revoke = async (token: ApiToken) => {
    try {
      await api.revokeToken(token.id);
      setTokens(await api.listTokens());
      toast(`Revoked “${token.name}”`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not revoke the token.', 'error');
    }
  };

  return (
    <ModalShell onClose={onClose} label="API tokens" wide>
      <div className="p-6">
        <h2 className="font-display text-lg font-semibold">API tokens</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Tokens let AI agents (MCP) access only your boards. Use one as the{' '}
          <code className="font-mono text-[11px]">KANBAN_AUTH_TOKEN</code> in your agent&apos;s config.
        </p>

        {fresh && (
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent-soft p-4">
            <p className="text-sm font-semibold">“{fresh.name}” created — copy it now</p>
            <p className="mt-1 text-xs text-ink-soft">This is the only time the full token is shown.</p>
            <div className="mt-2.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-white px-3 py-2 font-mono text-[11px]">
                {fresh.token}
              </code>
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={copy}
              >
                Copy
              </button>
            </div>
          </div>
        )}

        <form onSubmit={create} className="mt-5 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="token-name" className="label">New token name</label>
            <input
              id="token-name"
              ref={inputRef}
              className="input"
              placeholder="e.g. claude-desktop"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
            Create token
          </button>
        </form>

        <div className="mt-5">
          {tokens === null ? (
            <p className="py-4 text-sm text-ink-soft">Loading…</p>
          ) : tokens.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line py-4 text-center text-sm text-ink-soft">
              No tokens yet. Create one to connect your agents.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {tokens.map((token) => (
                <li key={token.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{token.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                      {token.prefix}… · created {new Date(token.created_at).toLocaleDateString()}
                      {token.last_used_at
                        ? ` · last used ${new Date(token.last_used_at).toLocaleDateString()}`
                        : ' · never used'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost text-xs text-ink-soft hover:text-red-600"
                    onClick={() => revoke(token)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}