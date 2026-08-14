import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../api';
import type { ColumnWithTasks, Comment, Priority, Task } from '../types';
import { cx, hueFrom, initials, isAgent, PRIORITIES, priorityMeta, timeAgo } from '../utils';
import { useToast } from './Toasts';

export type TaskModalState =
  | { kind: 'create'; columnId: string }
  | { kind: 'edit'; task: Task };

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  if (isAgent(name)) {
    return (
      <span
        title={name}
        className={cx(
          'inline-flex items-center justify-center rounded-full bg-action text-action-ink',
          size === 'sm' ? 'h-6 w-6' : 'h-7 w-7',
        )}
      >
        <svg width={size === 'sm' ? 12 : 14} height={size === 'sm' ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M12 8V4M8 4h8" />
          <circle cx="9" cy="13" r="0.5" fill="currentColor" />
          <circle cx="15" cy="13" r="0.5" fill="currentColor" />
          <path d="M9 17h6" />
        </svg>
      </span>
    );
  }
  return (
    <span
      title={name}
      className={cx(
        'inline-flex items-center justify-center rounded-full font-semibold text-white',
        size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-xs',
      )}
      style={{ background: `hsl(${hueFrom(name)} 45% 42%)` }}
    >
      {initials(name)}
    </span>
  );
}

function LabelsEditor({ labels, onChange }: { labels: string[]; onChange: (labels: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const value = raw.trim().replace(/,+$/, '');
    if (!value) return;
    if (labels.some((l) => l.toLowerCase() === value.toLowerCase()) || labels.length >= 12) {
      setDraft('');
      return;
    }
    onChange([...labels, value.slice(0, 24)]);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(draft);
    } else if (event.key === 'Backspace' && draft === '' && labels.length > 0) {
      onChange(labels.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1.5 transition-colors focus-within:border-accent">
      {labels.map((label) => (
        <span key={label} className="chip">
          {label}
          <button
            type="button"
            aria-label={`Remove label ${label}`}
            className="rounded text-ink-soft/70 hover:text-accent"
            onClick={() => onChange(labels.filter((l) => l !== label))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="min-w-24 flex-1 border-none bg-transparent py-0.5 text-sm outline-none placeholder:text-ink-soft/50"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder={labels.length === 0 ? 'Type and press Enter' : ''}
      />
    </div>
  );
}

export function TaskModal({
  state,
  boardId,
  columns,
  onClose,
  onChanged,
}: {
  state: TaskModalState;
  boardId: string;
  columns: ColumnWithTasks[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const isCreate = state.kind === 'create';
  const original = state.kind === 'edit' ? state.task : null;

  const [title, setTitle] = useState(original?.title ?? '');
  const [description, setDescription] = useState(original?.description ?? '');
  const [priority, setPriority] = useState<Priority>(original?.priority ?? 'medium');
  const [assignee, setAssignee] = useState(original?.assignee ?? '');
  const [labels, setLabels] = useState<string[]>(original?.labels ?? []);
  const [columnId, setColumnId] = useState(isCreate ? state.columnId : original!.column_id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [author, setAuthor] = useState(() => localStorage.getItem('kanban.author') ?? '');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => titleRef.current?.focus(), []);

  useEffect(() => {
    if (state.kind === 'edit') {
      api
        .listComments(state.task.id)
        .then(setComments)
        .catch(() => setComments([]));
    }
  }, [state]);

  const dirty = useMemo(() => {
    if (isCreate) return Boolean(title.trim() || description.trim() || assignee.trim() || labels.length > 0);
    return (
      title !== original!.title ||
      description !== original!.description ||
      priority !== original!.priority ||
      assignee !== original!.assignee ||
      columnId !== original!.column_id ||
      JSON.stringify(labels) !== JSON.stringify(original!.labels)
    );
  }, [isCreate, title, description, priority, assignee, labels, columnId, original]);

  const requestClose = () => {
    if (dirty && !confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  };

  // Esc closes (with discard protection), matching the backdrop behaviour.
  useEffect(() => {
    const onKey = (event: Event) => {
      if ((event as globalThis.KeyboardEvent).key === 'Escape') {
        event.stopPropagation();
        requestClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, confirmingDiscard]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('Give the task a title.');
      titleRef.current?.focus();
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (isCreate) {
        const column = columns.find((c) => c.id === columnId);
        const created = await api.createTask(boardId, {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          assignee: assignee.trim() || undefined,
          labels,
          column_id: column?.id,
        });
        toast(`Created ${created.key}`);
      } else {
        await api.updateTask(original!.id, {
          title: title.trim(),
          description: description.trim(),
          priority,
          assignee: assignee.trim(),
          labels,
          column_id: columnId,
        });
        toast(`Saved ${original!.key}`);
      }
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!original) return;
    setBusy(true);
    try {
      await api.deleteTask(original.id);
      toast(`Deleted ${original.key}`);
      onChanged();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete the task.', 'error');
      setBusy(false);
      setConfirmingDelete(false);
    }
  };

  const postComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!commentDraft.trim() || !original) return;
    const trimmedAuthor = author.trim();
    localStorage.setItem('kanban.author', trimmedAuthor);
    try {
      const comment = await api.addComment(original.id, commentDraft.trim(), trimmedAuthor);
      setComments((current) => [...(current ?? []), comment]);
      setCommentDraft('');
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add the comment.', 'error');
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isCreate ? 'New task' : `Task ${original!.key}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="modal-panel max-w-2xl">
        <form onSubmit={submit} noValidate>
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
            <div className="flex items-center gap-2.5">
              {original ? (
                <span className="rounded-md bg-action px-2 py-1 font-mono text-xs font-semibold text-action-ink">
                  {original.key}
                </span>
              ) : (
                <span className="font-display text-lg font-semibold">New task</span>
              )}
              <select
                aria-label="Column"
                className="cursor-pointer rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium text-ink-soft"
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
              >
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
            <label htmlFor="task-title" className="label">
              Title <span className="text-accent">*</span>
            </label>
            <input
              id="task-title"
              ref={titleRef}
              className="input text-base font-semibold"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              maxLength={200}
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <span className="label">Priority</span>
                <div className="flex gap-1 rounded-lg border border-line bg-paper p-1" role="radiogroup" aria-label="Priority">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={priority === p.value}
                      onClick={() => setPriority(p.value)}
                      className={cx(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-all',
                        priority === p.value ? 'bg-panel text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="task-assignee" className="label">
                  Assignee
                </label>
                <input
                  id="task-assignee"
                  className="input"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="e.g. ana or agent:claude"
                  maxLength={60}
                />
              </div>
            </div>

            <div className="mt-4">
              <span className="label">Labels</span>
              <LabelsEditor labels={labels} onChange={setLabels} />
            </div>

            <div className="mt-4">
              <label htmlFor="task-description" className="label">
                Description
              </label>
              <textarea
                id="task-description"
                className="input min-h-28 resize-y leading-relaxed"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add context, acceptance criteria, links…"
                maxLength={5000}
              />
            </div>

            {!isCreate && (
              <div className="mt-6 border-t border-line pt-5">
                <span className="label">Activity</span>
                {comments === null ? (
                  <div className="space-y-2">
                    <div className="skeleton h-10" />
                    <div className="skeleton h-10" />
                  </div>
                ) : comments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line px-3 py-3 text-sm text-ink-soft">
                    No comments yet. Agents and humans can leave updates here.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {comments.map((comment) => (
                      <li key={comment.id} className="flex gap-2.5">
                        {comment.author ? (
                          <Avatar name={comment.author} size="sm" />
                        ) : (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink/10 text-[10px] font-semibold text-ink-soft">
                            ?
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs text-ink-soft">
                            <span className="font-semibold text-ink">{comment.author || 'Someone'}</span> ·{' '}
                            {timeAgo(comment.created_at)}
                          </p>
                          <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap">{comment.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex gap-2">
                  <input
                    aria-label="Your name"
                    className="input w-32 shrink-0"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Name"
                    maxLength={60}
                  />
                  <input
                    aria-label="Add a comment"
                    className="input"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') postComment(e);
                    }}
                    placeholder="Leave an update…"
                    maxLength={2000}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
            <div>
              {!isCreate &&
                (confirmingDelete ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-ink-soft">Delete {original!.key} for good?</span>
                    <button type="button" className="btn-danger px-3 py-1.5 text-xs" onClick={remove} disabled={busy}>
                      Yes, delete
                    </button>
                    <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirmingDelete(false)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost danger-hover text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete task
                  </button>
                ))}
            </div>
            <div className="flex items-center gap-2">
              {confirmingDiscard ? (
                <span className="flex items-center gap-2">
                  <span className="text-sm text-ink-soft">Discard unsaved changes?</span>
                  <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={onClose}>
                    Discard
                  </button>
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirmingDiscard(false)} autoFocus>
                    Keep editing
                  </button>
                </span>
              ) : (
                <>
                  <button type="button" className="btn-ghost" onClick={requestClose}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : isCreate ? 'Create task' : 'Save changes'}
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PriorityDot({ priority }: { priority: Priority }) {
  const meta = priorityMeta(priority);
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-wider uppercase"
      style={{ color: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export { Avatar };
