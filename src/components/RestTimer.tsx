import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const DEFAULT_REST_SECONDS = 90;

interface RestTimerProps {
  startedAt: number | null;
  durationSeconds?: number;
  onClear: () => void;
}

function format(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.max(0, Math.ceil(secs % 60));
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RestTimer({
  startedAt,
  durationSeconds = DEFAULT_REST_SECONDS,
  onClear,
}: RestTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    let running = true;
    function tick() {
      if (!running) return;
      setNow(Date.now());
      rafRef.current = window.setTimeout(tick, 250) as unknown as number;
    }
    tick();
    return () => {
      running = false;
      if (rafRef.current !== null) window.clearTimeout(rafRef.current);
    };
  }, [startedAt]);

  if (startedAt === null) return null;
  const elapsedMs = now - startedAt;
  const totalMs = durationSeconds * 1000;
  const remainingMs = totalMs - elapsedMs;
  const remainingSec = Math.max(0, remainingMs / 1000);
  const done = remainingMs <= 0;
  const progress = Math.min(1, elapsedMs / totalMs);

  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">
            {done ? "Rest complete" : "Rest"}
          </div>
          <div
            className={`mt-1 text-2xl font-bold tabular-nums ${done ? "text-success" : ""}`}
          >
            {done ? "Ready" : format(remainingSec)}
          </div>
        </div>
        <button
          onClick={onClear}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface2"
          aria-label="Clear rest timer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2">
        <div
          className={`h-full transition-[width] duration-300 ease-out ${done ? "bg-success" : "bg-accent"}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
