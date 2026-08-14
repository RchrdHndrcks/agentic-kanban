import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, clearToken, getToken, onUnauthorized, type User } from './api';
import ApiTokensModal from './components/ApiTokensModal';
import { BoardSkeleton, BoardView } from './components/Board';
import { ConfirmDialog, NewBoardModal, NewColumnModal } from './components/Modals';
import ShareBoardModal from './components/ShareBoardModal';
import { Avatar } from './components/TaskModal';
import { TaskModal, type TaskModalState } from './components/TaskModal';
import { useToast } from './components/Toasts';
import Auth from './Auth';
import type { Board, BoardFull, ColumnWithTasks, Task } from './types';
import { useTheme } from './useTheme';

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

export default function App() {
  const toast = useToast();
  const { theme, toggleTheme } = useTheme();
  const [authState, setAuthState] = useState<'loading' | 'authed' | 'signin'>(
    getToken() ? 'loading' : 'authed',
  );
  const [user, setUser] = useState<User | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [selected, setSelected] = useState(() => localStorage.getItem('kanban.board') ?? '');
  const [board, setBoard] = useState<BoardFull | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    action: () => Promise<void>;
  } | null>(null);

  const loadBoard = useCallback(
    async (idOrKey: string, { soft = false } = {}) => {
      if (!soft) setLoadingBoard(true);
      try {
        setBoard(await api.getBoard(idOrKey));
        setFatalError('');
      } catch (err) {
        if (!soft) {
          setBoard(null);
          setFatalError(err instanceof Error ? err.message : 'Could not load the board.');
        }
      } finally {
        if (!soft) setLoadingBoard(false);
      }
    },
    [],
  );

  const loadBoards = useCallback(async () => {
    try {
      const list = await api.listBoards();
      setBoards(list);
      setFatalError('');
      const stillThere = list.some((b) => b.id === selected || b.key === selected);
      const next = stillThere ? selected : (list[0]?.id ?? '');
      setSelected(next);
      localStorage.setItem('kanban.board', next);
      if (next) {
        await loadBoard(next);
      } else {
        setBoard(null);
      }
    } catch (err) {
      setFatalError(err instanceof Error ? err.message : 'Could not reach the server.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBoard]);

  useEffect(() => {
    onUnauthorized(() => setAuthState('signin'));
    api
      .me()
      .then(({ user: current }) => {
        setUser(current);
        setAuthState('authed');
      })
      .catch(() => setAuthState('signin'))
      .finally(() => {
        if (getToken()) {
          loadBoards();
        }
      });
    api
      .health()
      .then(() => setHealthy(true))
      .catch(() => setHealthy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectBoard = (id: string) => {
    setSelected(id);
    localStorage.setItem('kanban.board', id);
    setAssigneeFilter('');
    loadBoard(id);
  };

  const refreshBoard = useCallback(() => {
    if (selected) loadBoard(selected, { soft: true });
  }, [selected, loadBoard]);

  // Ref so SSE handlers (bound once per session) always see the current board.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  /** Reload the board list (and current board) without any loading spinners. */
  const loadBoardsSoft = useCallback(async () => {
    try {
      const list = await api.listBoards();
      setBoards(list);
      const current = selectedRef.current;
      const stillThere = list.some((b) => b.id === current || b.key === current);
      const next = stillThere ? current : (list[0]?.id ?? '');
      if (next !== current) {
        setSelected(next);
        localStorage.setItem('kanban.board', next);
      }
      if (next) {
        await loadBoard(next, { soft: true });
      } else {
        setBoard(null);
      }
    } catch {
      // Transient failure — the next event (or user action) retries.
    }
  }, [loadBoard]);

  // Live updates: the server pushes SSE events whenever a collaborator (human
  // or MCP agent) changes something. Soft refreshes only — never a skeleton.
  useEffect(() => {
    if (authState !== 'authed') return;
    const token = getToken();
    if (!token) return;
    const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    let timer: number | undefined;
    let pending: 'board' | 'boards' | null = null;
    const flush = () => {
      timer = undefined;
      const what = pending;
      pending = null;
      if (what === 'boards') loadBoardsSoft();
      else if (what === 'board' && selectedRef.current) loadBoard(selectedRef.current, { soft: true });
    };
    const schedule = (what: 'board' | 'boards') => {
      pending = what === 'boards' ? 'boards' : (pending ?? 'board');
      if (timer === undefined) timer = window.setTimeout(flush, 150);
    };
    source.addEventListener('board', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { boardId?: string };
      if (data.boardId && data.boardId === selectedRef.current) schedule('board');
    });
    source.addEventListener('boards', () => schedule('boards'));
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false); // EventSource retries automatically
    return () => {
      source.close();
      setLive(false);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [authState, loadBoard, loadBoardsSoft]);

  const moveTask = useCallback(
    (taskId: string, columnId: string, position: number) => {
      setBoard((current) => {
        if (!current) return current;
        const columns = current.columns.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== taskId) }));
        const all = current.columns.flatMap((c) => c.tasks);
        const task = all.find((t) => t.id === taskId);
        if (!task) return current;
        const moved = { ...task, column_id: columnId, position };
        const target = columns.find((c) => c.id === columnId);
        if (!target) return current;
        const idx = target.tasks.findIndex((t) => t.position > position);
        target.tasks.splice(idx === -1 ? target.tasks.length : idx, 0, moved);
        return { ...current, columns };
      });
      api.updateTask(taskId, { column_id: columnId, position }).catch((err) => {
        toast(err instanceof Error ? err.message : 'Could not move the task.', 'error');
        refreshBoard();
      });
    },
    [toast, refreshBoard],
  );

  const visibleBoard = useMemo<BoardFull | null>(() => {
    if (!board) return null;
    const q = search.trim().toLowerCase();
    if (!q && !assigneeFilter) return board;
    const match = (task: Task) => {
      const textOk =
        !q ||
        [task.title, task.key, task.assignee, task.labels.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(q);
      const assigneeOk = !assigneeFilter || task.assignee === assigneeFilter;
      return textOk && assigneeOk;
    };
    return {
      ...board,
      columns: board.columns.map((c) => ({ ...c, tasks: c.tasks.filter(match) })),
    };
  }, [board, search, assigneeFilter]);

  const assignees = useMemo(() => {
    if (!board) return [];
    const set = new Set<string>();
    board.columns.forEach((c) => c.tasks.forEach((t) => t.assignee && set.add(t.assignee)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [board]);

  const currentBoardMeta = boards?.find((b) => b.id === selected);

  if (authState === 'signin') {
    return (
      <Auth
        onSuccess={() => {
          setAuthState('loading');
          api
            .me()
            .then(({ user: current }) => {
              setUser(current);
              setAuthState('authed');
            })
            .catch(() => setAuthState('signin'));
          loadBoards();
        }}
      />
    );
  }

  if (authState === 'loading') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <span className="font-mono text-xs text-ink-soft">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-paper/85 px-6 py-3 backdrop-blur">
        <Logo />
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        {boards && boards.length > 0 && (
          <div className="flex items-center gap-1.5">
            <label htmlFor="board-switcher" className="sr-only">
              Board
            </label>
            <select
              id="board-switcher"
              className="cursor-pointer rounded-lg border border-transparent bg-transparent px-2 py-1.5 font-display text-sm font-semibold transition-colors hover:border-line focus:border-line"
              value={selected}
              onChange={(e) => selectBoard(e.target.value)}
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {currentBoardMeta && (
              <span className="chip">{currentBoardMeta.key}</span>
            )}
          </div>
        )}
        {board?.members && board.members.length > 0 && (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex items-center"
            title="Board members — manage sharing"
            aria-label="Board members — manage sharing"
          >
            <span className="flex items-center -space-x-1.5">
              {board.members.slice(0, 5).map((member) => (
                <span key={member.user_id} className="rounded-full ring-2 ring-paper">
                  <Avatar name={member.email} size="sm" />
                </span>
              ))}
            </span>
            {board.members.length > 5 && (
              <span className="chip ml-1.5">+{board.members.length - 5}</span>
            )}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost px-2.5"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
              </svg>
            )}
          </button>
          <div className="relative">
            <svg
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-soft"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              aria-label="Search tasks"
              className="input w-44 pl-8 sm:w-56"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {assignees.length > 0 && (
            <select
              aria-label="Filter by assignee"
              className="input w-auto cursor-pointer"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
            >
              <option value="">Everyone</option>
              {assignees.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setNewBoardOpen(true)}
            title="New board"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Board
          </button>
          {visibleBoard && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShareOpen(true)}
              title="Share this board with other people"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Share
            </button>
          )}
          {currentBoardMeta && currentBoardMeta.role !== 'member' && (
            <button
              type="button"
              className="btn-ghost text-ink-soft hover:text-red-600"
              title="Delete this board"
              onClick={() =>
                setConfirm({
                  title: `Delete “${currentBoardMeta.name}”?`,
                  body: 'The board and all of its columns, tasks and comments will be permanently deleted. This cannot be undone.',
                  confirmLabel: 'Delete board',
                  action: async () => {
                    await api.deleteBoard(currentBoardMeta.id);
                    toast('Board deleted');
                    setSelected('');
                    await loadBoards();
                  },
                })
              }
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setTokensOpen(true)}
            title="Create and manage API tokens for agents"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="7.5" cy="15.5" r="4.5" />
              <path d="m10.7 12.3 8.8-8.8M16 5l3 3M19 8l2.5 2.5M14 10.5l1.5 1.5" />
            </svg>
            API tokens
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!visibleBoard}
            onClick={() => setNewColumnOpen(true)}
            title="Add a column — existing ones shrink to make room"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="5" height="16" rx="1.5" />
              <rect x="10" y="4" width="5" height="16" rx="1.5" />
              <path d="M18.5 9v6M15.5 12h6" />
            </svg>
            Column
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!visibleBoard || visibleBoard.columns.length === 0}
            onClick={() => {
              const first = visibleBoard?.columns[0];
              if (first) setTaskModal({ kind: 'create', columnId: first.id });
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New task
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {fatalError && !board ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl border border-line bg-panel p-8 text-center">
              <span className="mx-auto mb-4 block h-2.5 w-2.5 rounded-full bg-red-500" />
              <h1 className="font-display text-lg font-semibold">Something went wrong</h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{fatalError}</p>
              <button type="button" className="btn-primary mt-5" onClick={loadBoards}>
                Try again
              </button>
            </div>
          </div>
        ) : boards && boards.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl border border-line bg-panel p-8 text-center">
              <div className="mx-auto mb-4 w-fit"><Logo /></div>
              <h1 className="font-display text-lg font-semibold">Create your first board</h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Plan work in columns, assign tasks to people or agents, and let your MCP-connected
                agents pick them up.
              </p>
              <button type="button" className="btn-primary mt-5" onClick={() => setNewBoardOpen(true)}>
                New board
              </button>
            </div>
          </div>
        ) : loadingBoard || !visibleBoard ? (
          <BoardSkeleton />
        ) : (
          <BoardView
            board={visibleBoard}
            onOpenTask={(task) => setTaskModal({ kind: 'edit', task })}
            onAddTask={(columnId) => setTaskModal({ kind: 'create', columnId })}
            onMoveTask={moveTask}
            onDeleteColumn={(column: ColumnWithTasks) =>
              setConfirm({
                title: `Delete column “${column.name}”?`,
                body:
                  column.tasks.length > 0
                    ? `This column has ${column.tasks.length} task${column.tasks.length === 1 ? '' : 's'}, which will be permanently deleted. This cannot be undone.`
                    : 'The column will be permanently deleted. This cannot be undone.',
                confirmLabel: 'Delete column',
                action: async () => {
                  await api.deleteColumn(column.id);
                  toast('Column deleted');
                  refreshBoard();
                },
              })
            }
          />
        )}
      </main>

      <footer className="flex items-center gap-3 border-t border-line px-6 py-2 font-mono text-[11px] text-ink-soft">
        <span
          className={
            healthy === null
              ? 'h-1.5 w-1.5 rounded-full bg-ink-soft/40'
              : healthy
                ? 'h-1.5 w-1.5 rounded-full bg-emerald-500'
                : 'h-1.5 w-1.5 rounded-full bg-red-500'
          }
          title={healthy ? 'API reachable' : 'API unreachable'}
        />
        <span>
          {healthy ? 'API online · MCP ready' : 'API offline'}
          {live && <span className="text-emerald-600"> · live</span>}
        </span>
        <span className="flex-1" />
        {user && <span className="hidden sm:inline">{user.email}</span>}
        <button
          type="button"
          className="cursor-pointer transition-colors hover:text-ink"
          onClick={async () => {
            try {
              await api.logout();
            } catch {
              // The session may already be dead; clear locally regardless.
            }
            clearToken();
            setAuthState('signin');
          }}
        >
          Sign out
        </button>
        <span>MIT · Agentic Kanban v0.3</span>
      </footer>

      {taskModal && visibleBoard && (
        <TaskModal
          state={taskModal}
          boardId={selected}
          columns={board?.columns ?? []}
          onClose={() => setTaskModal(null)}
          onChanged={refreshBoard}
        />
      )}
      {newBoardOpen && (
        <NewBoardModal
          onClose={() => setNewBoardOpen(false)}
          onCreate={async (input) => {
            const created = await api.createBoard(input);
            toast(`Created board “${created.name}”`);
            await loadBoards();
            selectBoard(created.id);
          }}
        />
      )}
      {newColumnOpen && (
        <NewColumnModal
          onClose={() => setNewColumnOpen(false)}
          onCreate={async (name) => {
            await api.createColumn(selected, name);
            toast(`Added column “${name}”`);
            refreshBoard();
          }}
        />
      )}
      {shareOpen && board && user && (
        <ShareBoardModal
          boardId={selected}
          boardName={board.name}
          role={board.role ?? 'owner'}
          currentUserId={user.id}
          onClose={() => setShareOpen(false)}
          onChanged={loadBoardsSoft}
        />
      )}
      {tokensOpen && <ApiTokensModal onClose={() => setTokensOpen(false)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.action}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
