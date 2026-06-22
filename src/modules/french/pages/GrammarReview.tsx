import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ChevronDown, Lightbulb, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { GUIDE, type GuidePoint, type GuidePointKind } from "../data/guide";

const KIND_META: Record<GuidePointKind, { icon: typeof Pin | null; cls: string }> = {
  rule: { icon: Pin, cls: "text-accent" },
  tip: { icon: Lightbulb, cls: "text-success" },
  warning: { icon: AlertTriangle, cls: "text-warn" },
  note: { icon: null, cls: "text-muted" },
};

function Point({ point }: { point: GuidePoint }) {
  const { icon: Icon, cls } = KIND_META[point.kind];
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 w-5 shrink-0">
        {Icon ? <Icon className={cn("h-4 w-4", cls)} /> : <span className="block h-4 w-1 rounded bg-line" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-text">{point.text}</p>
        {point.examples && point.examples.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {point.examples.map((ex, i) => (
              <li key={i} className="rounded-lg bg-surface2 px-3 py-1.5 text-sm">
                <span className="font-medium text-text">{ex.fr}</span>
                <span className="text-muted"> — {ex.en}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function GrammarReview() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(GUIDE[0]?.id ?? null);

  return (
    <div className="space-y-4 p-4 pb-24">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate("/french")}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface2"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">Grammar rules</h1>
      </header>

      <ul className="space-y-2">
        {GUIDE.map((section, i) => {
          const isOpen = open === section.id;
          return (
            <li key={section.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <button
                onClick={() => setOpen(isOpen ? null : section.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-surface2"
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs font-semibold text-muted tabular-nums">
                    {i + 1}
                  </span>
                  <span className="font-semibold">{section.title}</span>
                </span>
                <ChevronDown
                  className={cn("h-5 w-5 shrink-0 text-muted transition-transform", isOpen && "rotate-180")}
                />
              </button>
              {isOpen && (
                <div className="space-y-4 border-t border-line/60 px-4 py-4">
                  <p className="text-sm text-muted">{section.intro}</p>
                  {section.points.map((point, pi) => (
                    <Point key={pi} point={point} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
