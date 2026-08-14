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

export default function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') {
        if (password !== confirm) {
          setError('Passwords do not match.');
          setBusy(false);
          return;
        }
        await api.register(email.trim(), password);
      } else {
        await api.login(email.trim(), password);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setPassword('');
      setConfirm('');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: 'signin' | 'register') => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-line bg-panel p-8 shadow-[0_24px_64px_rgba(28,28,25,0.10)] animate-pop-in">
          <div className="mb-6 flex items-center justify-center"><Logo /></div>
          <h1 className="text-center font-display text-lg font-semibold">
            {mode === 'signin' ? 'Sign in to your board' : 'Create your account'}
          </h1>
          <p className="mt-1.5 text-center text-sm leading-relaxed text-ink-soft">
            {mode === 'signin'
              ? 'Each account keeps its own boards, tasks and API tokens.'
              : 'Your boards are private to your account. Agents connect with tokens you create.'}
          </p>
          <form onSubmit={submit} className="mt-6">
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
            <label htmlFor="password" className="label mt-4">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="input"
              placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            {mode === 'register' && (
              <>
                <label htmlFor="confirm" className="label mt-4">Confirm password</label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  className="input"
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                />
              </>
            )}
            {error && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="btn-primary mt-5 w-full"
              disabled={busy || !email.trim() || password.length < 8 || (mode === 'register' && !confirm)}
            >
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <button
            type="button"
            className="mt-4 w-full text-center text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            onClick={() => switchMode(mode === 'signin' ? 'register' : 'signin')}
          >
            {mode === 'signin' ? 'No account? Create one' : 'Already have an account? Sign in'}
          </button>
        </div>
        <p className="mt-4 text-center font-mono text-[11px] text-ink-soft">
          MIT · Agentic Kanban v0.3
        </p>
      </div>
    </div>
  );
}
