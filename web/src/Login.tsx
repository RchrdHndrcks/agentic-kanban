import { useState, type FormEvent } from 'react';
import { api } from './api';

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#1d1d1a" />
        <rect x="7" y="7" width="5" height="18" rx="1.5" fill="#f4f4ee" />
        <rect x="13.5" y="7" width="5" height="12" rx="1.5" fill="#e0450e" />
        <rect x="20" y="7" width="5" height="15" rx="1.5" fill="#f4f4ee" opacity="0.55" />
      </svg>
      <span className="font-display text-lg font-bold tracking-tight">Agentic Kanban</span>
    </span>
  );
}

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(token.trim());
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setToken('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-line bg-white p-8 shadow-[0_24px_64px_rgba(28,28,25,0.10)] animate-pop-in">
          <div className="mb-6 flex items-center justify-center"><Logo /></div>
          <h1 className="text-center font-display text-lg font-semibold">Sign in to your board</h1>
          <p className="mt-1.5 text-center text-sm leading-relaxed text-ink-soft">
            Enter the access token configured on the server
            (<code className="font-mono text-[11px]">KANBAN_AUTH_TOKEN</code>) to continue.
          </p>
          <form onSubmit={submit} className="mt-6">
            <label htmlFor="token" className="label">Access token</label>
            <input
              id="token"
              type="password"
              autoComplete="current-password"
              className="input font-mono"
              placeholder="••••••••••••••••"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus
              required
            />
            {error && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary mt-5 w-full" disabled={busy || !token.trim()}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center font-mono text-[11px] text-ink-soft">
          MIT · Agentic Kanban v0.2
        </p>
      </div>
    </div>
  );
}