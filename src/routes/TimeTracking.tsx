import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { addDays, todayIsoDate } from "@/lib/utils";
import {
  formatHours,
  formatMdy,
  hoursOnDate,
  slotEndLabel,
  SLOTS_PER_DAY,
  taskHoursOnDate,
  workHoursInRange,
  workHoursOnDate,
} from "@/lib/time";
import {
  clearAllocation,
  countAllocationsForTask,
  createTimeTask,
  deleteTimeTaskCascade,
  setAllocation,
  toggleOrAssignAllocation,
  updateTimeTask,
  useAllocationsForDate,
  useAllocationsInRange,
  useTimeTasks,
} from "@/lib/timeHooks";
import type { LocalTimeTask } from "@/lib/db";

const SLOT_INDICES = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i);

export function TimeTracking() {
  const [date, setDate] = useState<string>(todayIsoDate());
  const [taskId, setTaskId] = useState<string>("");
  const [warning, setWarning] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const tasks = useTimeTasks();
  const allocsToday = useAllocationsForDate(date);
  const yesterday = addDays(date, -1);
  const weekStart = addDays(date, -6);
  const weekAllocs = useAllocationsInRange(weekStart, date);
  const yesterdayAllocs = useAllocationsForDate(yesterday);

  const tasksById = useMemo(() => {
    const m = new Map<string, LocalTimeTask>();
    for (const t of tasks ?? []) m.set(t.id, t);
    return m;
  }, [tasks]);

  const allocByslot = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of allocsToday ?? []) m.set(a.slot, a.task_id);
    return m;
  }, [allocsToday]);

  const total = hoursOnDate(allocsToday ?? [], date);
  const workSubTotal = workHoursOnDate(allocsToday ?? [], tasksById, date);
  const typeSubTotal = taskHoursOnDate(allocsToday ?? [], taskId || null, date);
  const yesterdayWork = workHoursOnDate(yesterdayAllocs ?? [], tasksById, yesterday);
  const sevenDayWork = workHoursInRange(weekAllocs ?? [], tasksById, weekStart, date);

  async function onSlotClick(slot: number) {
    const current = allocByslot.get(slot);
    if (!taskId) {
      if (current) {
        await clearAllocation(date, slot);
        setWarning(null);
        return;
      }
      setWarning("Pick a task first to allocate this slot.");
      window.setTimeout(() => setWarning(null), 2000);
      return;
    }
    setWarning(null);
    if (current && current === taskId) {
      await clearAllocation(date, slot);
      return;
    }
    if (current && current !== taskId) {
      await setAllocation(date, slot, taskId);
      return;
    }
    await toggleOrAssignAllocation(date, slot, taskId);
  }

  return (
    <div className="p-4 pb-12">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Time Tracking</h1>
        <div className="mt-1 text-xs uppercase tracking-wide text-muted">
          15-minute allocations
        </div>
      </header>

      <div className="space-y-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <label className="block text-xs uppercase tracking-wide text-muted">Date</label>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDate(addDays(date, -1))}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface2 text-muted hover:text-text"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayIsoDate())}
              className="h-12 flex-1 rounded-xl border border-line bg-surface2 px-3 text-base text-text"
            />
            <button
              type="button"
              onClick={() => setDate(addDays(date, 1))}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface2 text-muted hover:text-text"
              aria-label="Next day"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="text-base tabular-nums text-muted">{formatMdy(date)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs uppercase tracking-wide text-muted">Task</label>
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base text-text"
              >
                <option value="">Choose an option...</option>
                {(tasks ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_work ? " · work" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setManageOpen(true)}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface2 text-muted hover:text-text"
              aria-label="Manage tasks"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="h-9 rounded-lg bg-success px-4 text-sm font-medium text-bg"
              onClick={() => {
                /* placeholder */
              }}
            >
              Test
            </button>
            {taskId && tasksById.get(taskId) && (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface2 px-3 py-1 text-xs text-muted"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: tasksById.get(taskId)!.color }}
                  aria-hidden
                />
                {tasksById.get(taskId)!.name}
              </span>
            )}
          </div>

          {warning && (
            <div className="mt-3 rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">
              {warning}
            </div>
          )}
        </div>

        <Summary
          total={total}
          work={workSubTotal}
          type={typeSubTotal}
          yesterday={yesterdayWork}
          sevenDay={sevenDayWork}
          selectedTaskName={taskId ? tasksById.get(taskId)?.name ?? null : null}
        />

        <div className="grid grid-cols-4 gap-2">
          {SLOT_INDICES.map((slot) => {
            const assigned = allocByslot.get(slot);
            const task = assigned ? tasksById.get(assigned) : undefined;
            const color = task?.color;
            return (
              <button
                key={slot}
                onClick={() => onSlotClick(slot)}
                style={
                  color
                    ? {
                        backgroundColor: color,
                        borderColor: color,
                        color: "#0a0a0a",
                      }
                    : undefined
                }
                className={cn(
                  "h-11 rounded-full border tabular-nums text-sm font-medium transition active:scale-[0.97]",
                  color
                    ? "shadow-sm"
                    : "border-line bg-surface2 text-text hover:bg-surface2/80",
                )}
                aria-pressed={Boolean(assigned)}
                aria-label={`${slotEndLabel(slot)}${task ? ` — ${task.name}` : ""}`}
              >
                {slotEndLabel(slot)}
              </button>
            );
          })}
        </div>
      </div>

      {manageOpen && (
        <ManageTasksModal
          tasks={tasks ?? []}
          onClose={() => setManageOpen(false)}
          onTaskDeleted={(id) => {
            if (taskId === id) setTaskId("");
          }}
        />
      )}
    </div>
  );
}

function Summary({
  total,
  work,
  type,
  yesterday,
  sevenDay,
  selectedTaskName,
}: {
  total: number;
  work: number;
  type: number;
  yesterday: number;
  sevenDay: number;
  selectedTaskName: string | null;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-center">
      <Row label="Total" hours={total} bold />
      <Row label="Work Sub Total" hours={work} />
      <Row
        label={`Type Sub Total${selectedTaskName ? ` (${selectedTaskName})` : ""}`}
        hours={type}
      />
      <Row label="Yesterday Work Sub Total" hours={yesterday} />
      <Row label="7 Day Work" hours={sevenDay} />
    </div>
  );
}

function Row({ label, hours, bold }: { label: string; hours: number; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={cn("text-sm", bold ? "text-text" : "text-muted")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          bold ? "text-2xl font-bold" : "text-base font-medium",
        )}
      >
        {formatHours(hours)} h
      </span>
    </div>
  );
}

function ManageTasksModal({
  tasks,
  onClose,
  onTaskDeleted,
}: {
  tasks: readonly LocalTimeTask[];
  onClose: () => void;
  onTaskDeleted: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newIsWork, setNewIsWork] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; count: number } | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function onAdd() {
    const name = newName.trim();
    if (!name) {
      setError("Name required");
      return;
    }
    if (tasks.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setError("A task with that name already exists");
      return;
    }
    setError(null);
    await createTimeTask({ name, isWork: newIsWork });
    setNewName("");
    setNewIsWork(true);
  }

  async function onAskDelete(id: string) {
    const count = await countAllocationsForTask(id);
    setConfirmDelete({ id, count });
  }

  async function onConfirmDelete() {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    await deleteTimeTaskCascade(id);
    onTaskDeleted(id);
  }

  function startEdit(t: LocalTimeTask) {
    setEditingId(t.id);
    setEditName(t.name);
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    await updateTimeTask(id, { name });
    setEditingId(null);
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Manage tasks"
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-2 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-semibold">Manage tasks</h2>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-3 p-4">
          <div className="rounded-xl border border-line bg-surface2 p-3">
            <div className="text-xs uppercase tracking-wide text-muted">New task</div>
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Task name"
                className="flex-1"
              />
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={newIsWork}
                  onChange={(e) => setNewIsWork(e.target.checked)}
                  className="h-5 w-5 accent-accent"
                />
                Work
              </label>
              <Button size="sm" onClick={onAdd}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            {error && <div className="mt-2 text-sm text-danger">{error}</div>}
          </div>

          <ul className="max-h-[50vh] divide-y divide-line/50 overflow-y-auto rounded-xl border border-line">
            {tasks.length === 0 && (
              <li className="p-4 text-center text-sm text-muted">No tasks yet. Add one above.</li>
            )}
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-3">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: t.color }}
                  aria-hidden
                />
                {editingId === t.id ? (
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => saveEdit(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(t.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1"
                  />
                ) : (
                  <button
                    onClick={() => startEdit(t)}
                    className="flex-1 truncate text-left text-base text-text"
                  >
                    {t.name}
                  </button>
                )}
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={t.is_work}
                    onChange={(e) =>
                      void updateTimeTask(t.id, { is_work: e.target.checked })
                    }
                    className="h-4 w-4 accent-accent"
                  />
                  Work
                </label>
                {editingId !== t.id && (
                  <button
                    onClick={() => startEdit(t)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2"
                    aria-label={`Rename ${t.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => onAskDelete(t.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-danger"
                  aria-label={`Delete ${t.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {confirmDelete && (
        <div
          role="alertdialog"
          aria-modal
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Delete task?</h3>
            <p className="mt-2 text-sm text-muted">
              {confirmDelete.count === 0
                ? "This task has no allocations."
                : `This will also remove ${confirmDelete.count} allocation${
                    confirmDelete.count === 1 ? "" : "s"
                  } on every date.`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={onConfirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
