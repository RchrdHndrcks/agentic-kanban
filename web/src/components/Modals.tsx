import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useToast } from './Toasts';

/** Accessible modal shell: Esc closes, backdrop click closes, autofocus via children. */
export function ModalShell({
  onClose,
  children,
  wide,
  label,
}: {
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  label: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={wide ? 'modal-panel max-w-2xl' : 'modal-panel max-w-md'}>{children}</div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} label={title}>
      <div className="p-6">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={confirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function NewBoardModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; key?: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Give the board a name.');
      return;
    }
    if (key && !/^[a-zA-Z0-9]{2,6}$/.test(key.trim())) {
      setError('The key must be 2–6 letters or numbers.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), key: key.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the board.');
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} label="New board">
      <form onSubmit={submit} className="p-6" noValidate>
        <h2 className="font-display text-lg font-semibold">New board</h2>
        <div className="mt-5">
          <label htmlFor="board-name" className="label">
            Name <span className="text-accent">*</span>
          </label>
          <input
            id="board-name"
            ref={inputRef}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Website redesign"
            maxLength={80}
          />
        </div>
        <div className="mt-4">
          <label htmlFor="board-key" className="label">
            Key <span className="font-normal normal-case">(optional)</span>
          </label>
          <input
            id="board-key"
            className="input font-mono"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="Auto-derived, e.g. WR"
            maxLength={6}
          />
          <p className="mt-1.5 text-xs text-ink-soft">Used as the prefix for task keys, like WR-12.</p>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create board'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
