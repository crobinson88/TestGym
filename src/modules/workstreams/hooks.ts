import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { WorkstreamRow } from "@/lib/database.types";
import { fetchWorkstreams } from "./api";

// The command centre is desktop-only (PRD): the table is dense enough that a
// phone would need a different layout entirely. `pointer: fine` alongside the
// width check keeps a large tablet in portrait out, since the launch button
// lives in a header sized for a mouse.
export const DESKTOP_QUERY = "(min-width: 1024px) and (pointer: fine)";

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    setIsDesktop(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export interface WorkstreamsState {
  rows: WorkstreamRow[] | undefined;
  error: string | null;
  refresh: () => Promise<void>;
}

function upsertRow(rows: WorkstreamRow[], next: WorkstreamRow): WorkstreamRow[] {
  // A soft-deleted row arrives as an UPDATE, not a DELETE — drop it from view.
  if (next.deleted_at) return rows.filter((r) => r.id !== next.id);
  const idx = rows.findIndex((r) => r.id === next.id);
  if (idx === -1) return [next, ...rows];
  const copy = rows.slice();
  copy[idx] = next;
  return copy;
}

// FR-1: live table, no polling. One Realtime channel, opened while the view is
// mounted and torn down on close, so the phone never carries this subscription.
export function useWorkstreams(): WorkstreamsState {
  const [rows, setRows] = useState<WorkstreamRow[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchWorkstreams();
      if (mounted.current) {
        setRows(next);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "load failed");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    const channel = supabase
      .channel("workstreams:live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workstreams" },
        (payload) => {
          if (!mounted.current) return;
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: string };
            if (old?.id) setRows((cur) => (cur ?? []).filter((r) => r.id !== old.id));
            return;
          }
          const next = payload.new as WorkstreamRow | undefined;
          if (next?.id) setRows((cur) => upsertRow(cur ?? [], next));
        },
      )
      .subscribe();

    // A laptop waking from sleep silently drops the socket; re-reading on focus
    // means the board is never quietly stale.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      mounted.current = false;
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { rows, error, refresh };
}

export interface WorkstreamAlert {
  active: number;
  waiting: number;
}

// Badge counts for the launch button. Deliberately separate from
// useWorkstreams: the launcher lives in the app shell on every page, so it
// fetches two integers rather than the whole board, and does nothing at all
// unless `enabled` (desktop) — a phone never opens this channel.
export function useWorkstreamAlert(enabled: boolean): WorkstreamAlert {
  const [alert, setAlert] = useState<WorkstreamAlert>({ active: 0, waiting: 0 });

  useEffect(() => {
    if (!enabled) {
      setAlert({ active: 0, waiting: 0 });
      return;
    }
    let live = true;

    async function load() {
      const { data, error } = await supabase
        .from("workstreams")
        .select("status")
        .is("deleted_at", null)
        .in("status", ["in_progress", "waiting_input"]);
      if (!live || error) return;
      const statuses = (data ?? []) as { status: string }[];
      setAlert({
        active: statuses.length,
        waiting: statuses.filter((r) => r.status === "waiting_input").length,
      });
    }

    void load();
    const channel = supabase
      .channel("workstreams:alert")
      .on("postgres_changes", { event: "*", schema: "public", table: "workstreams" }, () => {
        void load();
      })
      .subscribe();

    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    return () => {
      live = false;
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [enabled]);

  return alert;
}

// Relative timestamps need to re-render on their own; nothing else on this
// board ticks.
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
