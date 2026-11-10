import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Camera,
  Check,
  ChevronLeft,
  ImagePlus,
  Library,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { addDays, cn, prettyDate, todayIsoDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { syncEngine } from "@/lib/sync";
import { useFoodEntries, useFoodEntry } from "../hooks";
import {
  foodDayPath,
  foodLibrary,
  isInLibrary,
  parseDayParam,
  searchLibrary,
  type LibraryFood,
} from "../compute";
import { estimateFoodPhoto, estimateFoodText } from "../photo";

type AddMode = "ai" | "library";
const ADD_MODE_KEY = "food:addMode";

function loadAddMode(): AddMode {
  try {
    return localStorage.getItem(ADD_MODE_KEY) === "library" ? "library" : "ai";
  } catch {
    return "ai";
  }
}

export default function AddFoodEntry() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const existing = useFoodEntry(id);
  const editing = !!id;
  const { session } = useAuth();
  const allEntries = useFoodEntries();
  const [params] = useSearchParams();
  const today = todayIsoDate();
  const startDay = parseDayParam(params.get("date"), today);

  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [date, setDate] = useState(startDay);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [estimating, setEstimating] = useState(false);
  const [estimatingText, setEstimatingText] = useState(false);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  // Set once an AI estimate fills the form: "Log it" then asks whether the food
  // should join the library (and under what label) before saving.
  const [aiEstimated, setAiEstimated] = useState(false);
  const [libraryPrompt, setLibraryPrompt] = useState(false);
  const [description, setDescription] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [addMode, setAddModeState] = useState<AddMode>(loadAddMode);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && existing && !hydrated) {
      setName(existing.name);
      setCalories(String(existing.calories));
      setProtein(String(existing.protein));
      setDate(existing.entry_date);
      setHydrated(true);
    }
  }, [editing, existing, hydrated]);

  // The serving is described in its own box ("two slices of pepperoni pizza"),
  // so the entry's name stays whatever you want it filed under; the typed name
  // stands in when the box is empty.
  const describedServing = description.trim() || name.trim();

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !session) return;
    setEstimating(true);
    setError(null);
    setEstimateNote(null);
    try {
      // Pass the description (or the typed name) as a hint to sharpen the estimate.
      const est = await estimateFoodPhoto(file, session.access_token, describedServing || undefined);
      if (est.error) {
        setError(est.error);
        return;
      }
      if (est.name && !name.trim()) setName(est.name);
      setCalories(String(est.calories));
      setProtein(String(est.protein));
      setAiEstimated(true);
      const pct = Math.round(est.confidence * 100);
      setEstimateNote(
        `AI estimate${Number.isFinite(pct) ? ` · ${pct}% confidence` : ""} — check and adjust before saving.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Estimate failed");
    } finally {
      setEstimating(false);
    }
  }

  async function estimateFromText() {
    const desc = describedServing;
    if (!desc || !session || estimatingText || estimating) return;
    setEstimatingText(true);
    setError(null);
    setEstimateNote(null);
    try {
      const est = await estimateFoodText(desc, session.access_token);
      if (est.error) {
        setError(est.error);
        return;
      }
      if (est.name && !name.trim()) setName(est.name);
      setCalories(String(est.calories));
      setProtein(String(est.protein));
      setAiEstimated(true);
      const pct = Math.round(est.confidence * 100);
      setEstimateNote(
        `AI estimate${Number.isFinite(pct) ? ` · ${pct}% confidence` : ""} — check and adjust before saving.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Estimate failed");
    } finally {
      setEstimatingText(false);
    }
  }

  // The food library: every distinct food ever logged (a food is saved here
  // the first time its title is logged), so a repeat meal can be re-logged with
  // one tap. Hidden while editing an existing entry.
  const fullLibrary = useMemo(
    () => (editing ? [] : foodLibrary(allEntries ?? [])),
    [editing, allEntries],
  );
  // The whole library is listed A–Z (no preview cap — an alphabetical list cut
  // short would only ever show the As), capped in height so the page still
  // opens short; search narrows it in place.
  const query = librarySearch.trim();
  const library = query ? searchLibrary(fullLibrary, query) : fullLibrary;

  function setAddMode(next: AddMode) {
    setAddModeState(next);
    try {
      localStorage.setItem(ADD_MODE_KEY, next);
    } catch {
      // per-device convenience only
    }
  }

  // A library food is a known quantity, so tapping it logs it straight away on
  // the chosen date rather than just filling the form.
  async function pickFood(food: LibraryFood) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setEstimateNote(null);
    try {
      await syncEngine.mutations.addFoodEntry({
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        entry_date: date,
      });
      navigate(foodDayPath(date, today));
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const caloriesNum = Number(calories);
  const proteinNum = Number(protein);
  const valid =
    name.trim().length > 0 &&
    calories.trim().length > 0 &&
    protein.trim().length > 0 &&
    Number.isFinite(caloriesNum) &&
    caloriesNum >= 0 &&
    Number.isFinite(proteinNum) &&
    proteinNum >= 0;

  function onLogIt() {
    if (!valid || saving) return;
    if (!editing && aiEstimated) setLibraryPrompt(true);
    else void save();
  }

  async function save(opts: { name?: string; inLibrary?: boolean } = {}) {
    if (!valid || saving) return;
    const finalName = (opts.name ?? name).trim();
    if (!finalName) return;
    setSaving(true);
    setError(null);
    try {
      if (editing && id) {
        await syncEngine.mutations.updateFoodEntry(id, {
          name: name.trim(),
          calories: caloriesNum,
          protein: proteinNum,
          entry_date: date,
        });
      } else {
        await syncEngine.mutations.addFoodEntry({
          name: finalName,
          calories: caloriesNum,
          protein: proteinNum,
          entry_date: date,
          in_library: opts.inLibrary ?? true,
        });
      }
      navigate(foodDayPath(date, today));
    } catch (err) {
      setLibraryPrompt(false);
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id || saving) return;
    setSaving(true);
    try {
      await syncEngine.mutations.deleteFoodEntry(id);
      navigate(foodDayPath(date, today));
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={() => navigate(foodDayPath(existing?.entry_date ?? startDay, today))}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="font-medium text-text">{editing ? "Edit food" : "Log food"}</span>
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
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPhoto}
        />

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            {error}
          </div>
        )}

        <DateField value={date} today={today} onChange={setDate} />

        <div className="space-y-3">
          <Button onClick={onLogIt} size="lg" className="w-full" disabled={!valid || saving}>
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Check className="mr-2 h-5 w-5" /> {editing ? "Save changes" : "Log it"}
              </>
            )}
          </Button>
          {editing && (
            <Button
              variant="ghost"
              size="lg"
              className="w-full text-warn"
              onClick={remove}
              disabled={saving}
            >
              <Trash2 className="mr-2 h-5 w-5" /> Delete
            </Button>
          )}
        </div>

        {!editing && <AddModeToggle value={addMode} onChange={setAddMode} />}

        {!editing && addMode === "ai" && (
          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Estimate with AI
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the serving — e.g. two slices of pepperoni pizza and a side salad"
              aria-label="Describe what you ate"
              rows={3}
              className="w-full resize-y rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-accent"
            />
            <Button
              variant="secondary"
              size="md"
              className="mt-2 w-full"
              onClick={estimateFromText}
              disabled={!describedServing || estimatingText || estimating || !session}
            >
              {estimatingText ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-5 w-5 text-accent" />
              )}
              {estimatingText ? "Estimating…" : "Estimate calories & protein"}
            </Button>
            <div className="mt-2 flex gap-2">
              <Button
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => cameraRef.current?.click()}
                disabled={estimating || estimatingText || !session}
              >
                {estimating ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="mr-2 h-5 w-5" />
                )}
                {estimating ? "Reading…" : "Photo"}
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => libraryRef.current?.click()}
                disabled={estimating || estimatingText || !session}
              >
                <ImagePlus className="mr-2 h-5 w-5" /> Library
              </Button>
            </div>
            {estimateNote && <p className="mt-2 text-xs text-accent">{estimateNote}</p>}
          </div>
        )}

        {!editing && addMode === "library" && fullLibrary.length === 0 && (
          <div className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">
            Your library is empty. Every food you log joins it automatically, so a repeat meal is
            one tap next time.
          </div>
        )}

        {!editing && addMode === "library" && fullLibrary.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
              <Library className="h-3.5 w-3.5 text-accent" /> Library
              <span className="ml-auto normal-case tracking-normal">
                {query ? `${library.length} of ${fullLibrary.length}` : fullLibrary.length}
              </span>
            </div>
            <p className="mb-2 text-xs text-muted">Tap a food to log it.</p>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search your foods…"
                aria-label="Search the food library"
                enterKeyHint="search"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={`h-11 bg-surface2 pl-9 text-sm ${librarySearch ? "pr-11" : ""}`}
              />
              {librarySearch && (
                <button
                  type="button"
                  onClick={() => setLibrarySearch("")}
                  aria-label="Clear search"
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted hover:text-text"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <ul className="flex max-h-64 flex-wrap gap-2 overflow-y-auto overscroll-contain">
              {library.map((food) => (
                <li key={food.name}>
                  <button
                    onClick={() => pickFood(food)}
                    disabled={saving}
                    aria-label={`Log ${food.name}`}
                    className="flex min-h-11 flex-col items-start rounded-xl border border-line bg-surface2 px-3 py-1.5 text-left transition active:scale-[0.98] disabled:opacity-50"
                  >
                    <span className="max-w-[60vw] truncate text-sm font-medium text-text">
                      {food.name}
                    </span>
                    <span className="text-xs text-muted">
                      {food.calories} kcal · {formatProtein(food.protein)} g
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {library.length === 0 && (
              <p className="py-1 text-sm text-muted">
                No food matches “{query}”. Type it in below to log it as a new food.
              </p>
            )}
          </div>
        )}

        <Field label="Food">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What did you eat?"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Calories (kcal)">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Protein (g)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
      </div>

      {libraryPrompt && (
        <SaveToLibraryPrompt
          initialLabel={name.trim()}
          calories={caloriesNum}
          protein={proteinNum}
          alreadyIn={(label) => isInLibrary(allEntries ?? [], label)}
          saving={saving}
          onSave={(label) => save({ name: label, inLibrary: true })}
          onSkip={() => save({ inLibrary: false })}
          onCancel={() => setLibraryPrompt(false)}
        />
      )}
    </div>
  );
}

// Asked after "Log it" on an AI estimate: an estimate is a one-off guess, so it
// only joins the library when the user says so, under a label they can tidy up
// first (the label becomes the entry's name — the library is keyed on it).
// Skipping still logs the entry, just kept out of the library.
function SaveToLibraryPrompt({
  initialLabel,
  calories,
  protein,
  alreadyIn,
  saving,
  onSave,
  onSkip,
  onCancel,
}: {
  initialLabel: string;
  calories: number;
  protein: number;
  alreadyIn: (label: string) => boolean;
  saving: boolean;
  onSave: (label: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const trimmed = label.trim();
  const exists = trimmed.length > 0 && alreadyIn(trimmed);
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-2 sm:items-center"
      onClick={saving ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-to-library-title"
        className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <Library className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h2 id="save-to-library-title" className="font-medium text-text">
              Save this estimate to your library?
            </h2>
            <p className="text-sm text-muted">
              {calories} kcal · {formatProtein(protein)} g protein — one tap to log next time.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Back to the form"
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <Field label="Library label">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name it in your library"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed && !saving) onSave(trimmed);
            }}
          />
        </Field>
        {exists && (
          <p className="-mt-2 text-xs text-muted">
            Already in your library — saving updates it to these macros.
          </p>
        )}

        <div className="space-y-2">
          <Button
            size="lg"
            className="w-full"
            onClick={() => onSave(trimmed)}
            disabled={!trimmed || saving}
          >
            <Check className="mr-2 h-5 w-5" /> {saving ? "Saving…" : "Save to library & log"}
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={onSkip} disabled={saving}>
            Just log it
          </Button>
        </div>
      </div>
    </div>
  );
}

function DateField({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (next: string) => void;
}) {
  const yesterday = addDays(today, -1);
  const chips = [
    { label: "Today", date: today },
    { label: "Yesterday", date: yesterday },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">Date</span>
        {value !== today && value !== yesterday && (
          <span className="text-xs text-muted">{prettyDate(value)}</span>
        )}
      </div>
      <div className="flex gap-2">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onChange(c.date)}
            aria-pressed={value === c.date}
            className={cn(
              "h-11 shrink-0 rounded-xl border px-3 text-sm transition",
              value === c.date
                ? "border-accent bg-accent/15 font-medium text-text"
                : "border-line text-muted hover:text-text",
            )}
          >
            {c.label}
          </button>
        ))}
        <Input
          type="date"
          value={value}
          max={today}
          onChange={(e) => onChange(parseDayParam(e.target.value, today))}
          aria-label="Date"
          className="min-w-0 flex-1"
        />
      </div>
    </div>
  );
}

function AddModeToggle({
  value,
  onChange,
}: {
  value: AddMode;
  onChange: (next: AddMode) => void;
}) {
  const options: { mode: AddMode; label: string; icon: React.ReactNode }[] = [
    { mode: "ai", label: "Estimate with AI", icon: <Sparkles className="h-4 w-4" /> },
    { mode: "library", label: "Library", icon: <Library className="h-4 w-4" /> },
  ];
  return (
    <div
      role="group"
      aria-label="Fill from"
      className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1"
    >
      {options.map((o) => (
        <button
          key={o.mode}
          type="button"
          onClick={() => onChange(o.mode)}
          aria-pressed={value === o.mode}
          className={cn(
            "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm transition",
            value === o.mode ? "bg-surface2 font-medium text-text" : "text-muted hover:text-text",
          )}
        >
          <span className={value === o.mode ? "text-accent" : ""}>{o.icon}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Protein is stored as numeric — trim a trailing ".0" so whole grams read cleanly.
function formatProtein(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
