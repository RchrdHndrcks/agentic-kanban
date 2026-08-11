import { useMemo, useState, type FormEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardFull, ColumnWithTasks, Task } from '../types';
import { cx } from '../utils';
import { Avatar, PriorityDot } from './TaskModal';

const POSITION_GAP = 1024;

function positionAt(tasks: Task[], index: number): number {
  if (tasks.length === 0) return POSITION_GAP;
  if (index <= 0) return tasks[0]!.position / 2;
  if (index >= tasks.length) return tasks[tasks.length - 1]!.position + POSITION_GAP;
  return (tasks[index - 1]!.position + tasks[index]!.position) / 2;
}

function TaskCardView({ task, dragging }: { task: Task; dragging?: boolean }) {
  return (
    <div className={cx('task-card', dragging && 'rotate-1.5 shadow-[0_16px_32px_rgba(28,28,25,0.18)]')}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-medium text-ink-soft">{task.key}</span>
        <PriorityDot priority={task.priority} />
      </div>
      <p className="mt-1.5 line-clamp-3 text-sm leading-snug font-medium break-words">{task.title}</p>
      {(task.labels.length > 0 || task.assignee || (task.comment_count ?? 0) > 0) && (
        <div className="mt-2.5 flex items-center gap-1.5">
          {task.labels.slice(0, 3).map((label) => (
            <span key={label} className="chip">
              {label}
            </span>
          ))}
          {task.labels.length > 3 && <span className="chip">+{task.labels.length - 3}</span>}
          <span className="flex-1" />
          {(task.comment_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-soft" title="Comments">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {task.comment_count}
            </span>
          )}
          {task.assignee && <Avatar name={task.assignee} size="sm" />}
        </div>
      )}
    </div>
  );
}

function SortableTaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { columnId: task.column_id },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen();
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open task ${task.key}: ${task.title}`}
      className={cx('outline-none', isDragging && 'opacity-40')}
    >
      <TaskCardView task={task} />
    </div>
  );
}

function ColumnView({
  column,
  onOpenTask,
  onAddTask,
  onDeleteColumn,
  canDelete,
}: {
  column: ColumnWithTasks;
  onOpenTask: (task: Task) => void;
  onAddTask: (columnId: string) => void;
  onDeleteColumn: (column: ColumnWithTasks) => void;
  canDelete: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      aria-label={column.name}
      className="flex w-72 shrink-0 flex-col rounded-2xl border border-line bg-panel/60"
    >
      <header className="group flex items-center gap-2 px-3.5 pt-3.5 pb-2">
        <h2 className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
          {column.name}
        </h2>
        <span className="rounded-full bg-ink/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-soft">
          {column.tasks.length}
        </span>
        <span className="flex-1" />
        {canDelete && (
          <button
            type="button"
            aria-label={`Delete column ${column.name}`}
            title="Delete column"
            onClick={() => onDeleteColumn(column)}
            className="rounded p-1 text-ink-soft/0 transition-colors group-hover:text-ink-soft hover:bg-red-50 hover:text-red-600!"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={cx(
          'flex min-h-24 flex-1 flex-col gap-2 rounded-b-2xl px-2.5 pb-2.5 transition-colors',
          isOver && 'bg-accent-soft/50',
        )}
      >
        <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {column.tasks.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line px-3 py-6 text-center">
              <p className="text-xs text-ink-soft">Drop tasks here</p>
            </div>
          ) : (
            column.tasks.map((task) => (
              <SortableTaskCard key={task.id} task={task} onOpen={() => onOpenTask(task)} />
            ))
          )}
        </SortableContext>
        <button
          type="button"
          onClick={() => onAddTask(column.id)}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add task
        </button>
      </div>
    </section>
  );
}

function AddColumn({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onAdd(name.trim());
      setName('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-72 shrink-0 items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm font-semibold text-ink-soft transition-colors hover:border-accent hover:text-accent"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add column
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl border border-line bg-white p-3">
      <label htmlFor="new-column-name" className="sr-only">
        Column name
      </label>
      <input
        id="new-column-name"
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Column name"
        maxLength={40}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={!name.trim() || busy}>
          Add column
        </button>
      </div>
    </form>
  );
}

export function BoardView({
  board,
  onOpenTask,
  onAddTask,
  onMoveTask,
  onAddColumn,
  onDeleteColumn,
}: {
  board: BoardFull;
  onOpenTask: (task: Task) => void;
  onAddTask: (columnId: string) => void;
  onMoveTask: (taskId: string, columnId: string, position: number) => void;
  onAddColumn: (name: string) => Promise<void>;
  onDeleteColumn: (column: ColumnWithTasks) => void;
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const taskIndex = useMemo(() => {
    const map = new Map<string, { column: ColumnWithTasks; index: number }>();
    for (const column of board.columns) {
      column.tasks.forEach((task, index) => map.set(task.id, { column, index }));
    }
    return map;
  }, [board]);

  const onDragStart = (event: DragStartEvent) => {
    const hit = taskIndex.get(String(event.active.id));
    if (hit) setActiveTask(hit.column.tasks[hit.index]!);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const overId = String(over.id);
    if (taskId === overId) return;

    const source = taskIndex.get(taskId);
    if (!source) return;
    const task = source.column.tasks[source.index]!;

    const overColumn = board.columns.find((c) => c.id === overId);
    const overTask = taskIndex.get(overId);
    const targetColumn = overColumn ?? overTask?.column;
    if (!targetColumn) return;

    const siblings = targetColumn.tasks.filter((t) => t.id !== taskId);
    let insertIndex = siblings.length;
    if (overTask) {
      const idx = siblings.findIndex((t) => t.id === overId);
      if (idx !== -1) insertIndex = idx;
    }
    onMoveTask(task.id, targetColumn.id, positionAt(siblings, insertIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="flex h-full items-start gap-4 overflow-x-auto px-6 pt-2 pb-6">
        {board.columns.map((column) => (
          <ColumnView
            key={column.id}
            column={column}
            onOpenTask={onOpenTask}
            onAddTask={onAddTask}
            onDeleteColumn={onDeleteColumn}
            canDelete={board.columns.length > 1}
          />
        ))}
        <AddColumn onAdd={onAddColumn} />
      </div>
      <DragOverlay>{activeTask ? <TaskCardView task={activeTask} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

export function BoardSkeleton() {
  return (
    <div className="flex h-full items-start gap-4 overflow-x-auto px-6 pt-2 pb-6" aria-label="Loading board">
      {[0, 1, 2, 3].map((col) => (
        <div key={col} className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl border border-line bg-panel/60 p-3">
          <div className="skeleton h-3 w-24" />
          {[0, 1, 2].slice(0, col === 0 ? 3 : col).map((i) => (
            <div key={i} className="skeleton h-20" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
