import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { BoardMember, BoardRole } from '../types';
import { ModalShell } from './Modals';
import { Avatar } from './TaskModal';
import { useToast } from './Toasts';

export default function ShareBoardModal({
  boardId,
  boardName,
  role,
  currentUserId,
  onClose,
  onChanged,
}: {
  boardId: string;
  boardName: string;
  role: BoardRole;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [members, setMembers] = useState<BoardMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isOwner = role === 'owner';

  useEffect(() => {
    api
      .listBoardMembers(boardId)
      .then(setMembers)
      .catch((err) => toast(err instanceof Error ? err.message : 'Could not load members.', 'error'));
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      setMembers(await api.addBoardMember(boardId, email.trim()));
      setEmail('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that person.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: BoardMember) => {
    try {
      await api.removeBoardMember(boardId, member.user_id);
      setMembers(await api.listBoardMembers(boardId));
      toast(
        member.user_id === currentUserId ? `You left “${boardName}”` : `Removed ${member.email}`,
      );
      onChanged();
      if (member.user_id === currentUserId) onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not remove the member.', 'error');
    }
  };

  return (
    <ModalShell onClose={onClose} label={`Share ${boardName}`}>
      <div className="p-6">
        <h2 className="font-display text-lg font-semibold">Share “{boardName}”</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Everyone listed here can view and edit this board, and sees changes in real time.
        </p>

        {isOwner && (
          <form onSubmit={invite} className="mt-5 flex items-end gap-2" noValidate>
            <div className="min-w-0 flex-1">
              <label htmlFor="member-email" className="label">
                Invite by email
              </label>
              <input
                id="member-email"
                ref={inputRef}
                type="email"
                className="input"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={120}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={busy || !email.trim()}>
              Invite
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="alert-error mt-3">
            {error}
          </p>
        )}

        <div className="mt-5">
          {members === null ? (
            <p className="py-4 text-sm text-ink-soft">Loading…</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {members.map((member) => {
                const self = member.user_id === currentUserId;
                const canRemove = member.role !== 'owner' && (isOwner || self);
                return (
                  <li key={member.user_id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={member.email} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {member.email}
                        {self && <span className="font-normal text-ink-soft"> (you)</span>}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                        {member.role === 'owner' ? 'Owner' : 'Member'}
                      </p>
                    </div>
                    {canRemove && (
                      <button
                        type="button"
                        className="btn-ghost text-xs text-ink-soft hover:text-red-600"
                        onClick={() => remove(member)}
                      >
                        {self ? 'Leave' : 'Remove'}
                      </button>
                    )}
                  </li>
                );
              })}
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
