import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { todayIsoDate } from "@/lib/utils";
import { useDay, usePrevDateWithItems } from "../hooks";
import { SECTIONS } from "../sections";
import {
  cycleStatus,
  deleteItem,
  moveItem,
  reorderSection,
  togglePriority,
  createItem,
} from "../repo";
import { DayHeader } from "../components/DayHeader";
import { SectionColumn } from "../components/SectionColumn";
import { RollForwardButton } from "../components/RollForwardButton";

export default function DayView() {
  const params = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const date = params.date ?? todayIsoDate();
  const bundle = useDay(date);
  const prev = usePrevDateWithItems(date);

  const allIds = useMemo(() => bundle?.items.map((i) => i.id) ?? [], [bundle]);
  const [focusIdx, setFocusIdx] = useState(0);
  const focusedId = allIds[focusIdx];

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusIdx >= allIds.length) setFocusIdx(Math.max(0, allIds.length - 1));
  }, [allIds.length, focusIdx]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (!bundle) return;
      if (e.key === "j") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(allIds.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === " ") {
        if (focusedId) {
          e.preventDefault();
          void cycleStatus(focusedId);
        }
      } else if (e.key === "p") {
        if (focusedId) {
          e.preventDefault();
          void togglePriority(focusedId);
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (focusedId && e.metaKey) {
          e.preventDefault();
          void deleteItem(focusedId);
        }
      } else if (e.key === "n") {
        e.preventDefault();
        const focusedItem = bundle.items.find((i) => i.id === focusedId);
        const section = focusedItem?.section ?? SECTIONS[0].key;
        void createItem({ snapshot_date: date, section, title: "New task" });
      }
    },
    [allIds, bundle, focusedId, date],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    if (!bundle) return;
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || activeId === overId) return;
    const activeItem = bundle.items.find((i) => i.id === activeId);
    if (!activeItem) return;
    const overItem = bundle.items.find((i) => i.id === overId);

    const sourceSection = activeItem.section;
    const targetSection = overItem?.section ?? sourceSection;
    const isRecurring = activeItem.is_recurring;

    const targetList = (
      bundle.bySection[targetSection]?.[isRecurring ? "recurring" : "dated"] ?? []
    ).filter((i) => i.id !== activeId);

    const insertAt = overItem ? targetList.findIndex((i) => i.id === overItem.id) : targetList.length;
    const orderedIds = [...targetList.map((i) => i.id)];
    orderedIds.splice(Math.max(0, insertAt), 0, activeId);

    if (sourceSection !== targetSection) {
      void moveItem(activeId, targetSection, insertAt);
      void reorderSection(date, targetSection, isRecurring, orderedIds);
    } else {
      void reorderSection(date, targetSection, isRecurring, orderedIds);
    }
  }

  if (!bundle) {
    return <div className="p-6 text-center text-muted">Loading...</div>;
  }

  const empty = bundle.items.length === 0;

  return (
    <div ref={containerRef} className="flex min-h-full flex-col">
      <DayHeader
        snapshot_date={date}
        items={bundle.items}
        completionItems={bundle.completionItems}
        day={bundle.day}
        onNavigate={(d) => navigate(`/tdl/${d}`)}
      />
      <div className="p-3">
        {empty && prev && (
          <div className="mb-4">
            <RollForwardButton fromDate={prev} toDate={date} />
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((cfg) => (
              <SectionColumn
                key={cfg.key}
                cfg={cfg}
                snapshot_date={date}
                recurring={bundle.bySection[cfg.key]?.recurring ?? []}
                dated={bundle.bySection[cfg.key]?.dated ?? []}
                focusedId={focusedId}
              />
            ))}
          </div>
        </DndContext>
      </div>
    </div>
  );
}
