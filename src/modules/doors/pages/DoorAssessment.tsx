import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MinusCircle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  assessDoor,
  CRITERIA,
  type Criterion,
  type CriterionStatus,
  type DoorAssessment,
} from "../assess";

export default function DoorAssessmentPage() {
  const { session } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [result, setResult] = useState<DoorAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revoke the object URL when it changes or the screen unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !session) return;

    setError(null);
    setResult(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setAssessing(true);
    try {
      setResult(await assessDoor(file, session.access_token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAssessing(false);
    }
  }

  function reset() {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setResult(null);
    setError(null);
  }

  const showPicker = !preview && !assessing;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="font-medium text-text">Door check</span>
        <span className="text-xs text-muted">Plumb · Level · Square · Bow</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPhoto}
        />
        <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />

        {showPicker && (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted">
              Photograph an installed door or sliding door square-on, with the whole frame in shot
              and good light. An AI inspector estimates plumb, level, square and bow and gives a
              pass / fail call.
            </p>
            <div className="flex gap-2">
              <Button
                size="lg"
                className="flex-1"
                disabled={!session}
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="mr-2 h-5 w-5" /> Take photo
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                disabled={!session}
                onClick={() => libraryRef.current?.click()}
              >
                <ImagePlus className="mr-2 h-5 w-5" /> Upload
              </Button>
            </div>
          </div>
        )}

        {preview && (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <img src={preview} alt="Door under assessment" className="max-h-72 w-full object-contain" />
          </div>
        )}

        {assessing && (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-line bg-surface px-4 py-6 text-muted">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span>Inspecting the install…</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && !result.assessable && (
          <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{result.reason ?? "Couldn't assess this image — try a clearer, square-on shot."}</span>
          </div>
        )}

        {result && result.assessable && <Results result={result} />}

        {(preview || result || error) && !assessing && (
          <Button variant="ghost" size="lg" className="w-full" onClick={reset}>
            <RotateCcw className="mr-2 h-5 w-5" /> New photo
          </Button>
        )}
      </div>
    </div>
  );
}

function Results({ result }: { result: DoorAssessment }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {result.doorType && (
          <span className="rounded-full bg-surface2 px-2.5 py-1 text-text">{result.doorType}</span>
        )}
        <span className="rounded-full bg-surface2 px-2.5 py-1 text-muted">
          {result.confidence} confidence
        </span>
      </div>

      <p className="text-sm text-text">{result.summary}</p>

      <div className="space-y-2">
        {CRITERIA.map(({ key, label, blurb }) => (
          <CriterionRow key={key} label={label} blurb={blurb} c={result[key]} />
        ))}
      </div>

      {result.recommendations.length > 0 && (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <span className="text-xs uppercase tracking-wide text-muted">Installer notes</span>
          <ul className="space-y-1.5">
            {result.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-text">
                <span className="text-accent">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted">
        Estimates from a single uncalibrated photo — confirm critical work with a level and tape.
      </p>
    </div>
  );
}

const STATUS_META: Record<
  CriterionStatus,
  { label: string; cls: string; icon: typeof CheckCircle2 }
> = {
  pass: { label: "Pass", cls: "text-success", icon: CheckCircle2 },
  marginal: { label: "Marginal", cls: "text-warn", icon: AlertTriangle },
  fail: { label: "Fail", cls: "text-danger", icon: XCircle },
  unknown: { label: "N/A", cls: "text-muted", icon: MinusCircle },
};

function formatDeviation(c: Criterion): string | null {
  if (c.deviation === null || c.unit === null) return null;
  const rounded = c.unit === "mm" ? Math.round(c.deviation) : Math.round(c.deviation * 10) / 10;
  const tol = c.tolerance !== null ? ` (tol ±${c.tolerance}${c.unit})` : "";
  return `${rounded}${c.unit}${tol}`;
}

function CriterionRow({ label, blurb, c }: { label: string; blurb: string; c: Criterion }) {
  const meta = STATUS_META[c.status];
  const Icon = meta.icon;
  const value = formatDeviation(c);
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-text">{label}</div>
          <div className="text-xs text-muted">{blurb}</div>
        </div>
        <div className={cn("flex items-center gap-1.5 text-sm font-medium", meta.cls)}>
          <Icon className="h-4 w-4" />
          {meta.label}
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        {value ? (
          <span className="text-lg font-semibold text-text">{value}</span>
        ) : (
          <span className="text-sm text-muted">No reading</span>
        )}
      </div>
      {c.detail && <p className="mt-1 text-sm text-muted">{c.detail}</p>}
    </div>
  );
}
