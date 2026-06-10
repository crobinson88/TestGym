import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  evenSplit,
  formatMoney,
  weightedSplit,
  type EvenParticipant,
  type SplitCategory,
} from "../calc";

type Mode = "even" | "weighted";

type CatRow = { id: string; name: string; amount: string };
type EvenRow = { id: string; name: string; joined: Record<string, boolean> };
type WeightRow = { id: string; name: string; weight: string };

const STORE_KEY = "venmo.v1";

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function num(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

interface Persisted {
  mode: Mode;
  categories: CatRow[];
  evenPeople: EvenRow[];
  total: string;
  weightPeople: WeightRow[];
}

function seed(): Persisted {
  const food = uid();
  const booze = uid();
  return {
    mode: "even",
    categories: [
      { id: food, name: "Food", amount: "" },
      { id: booze, name: "Booze", amount: "" },
    ],
    evenPeople: [
      { id: uid(), name: "", joined: { [food]: true, [booze]: true } },
      { id: uid(), name: "", joined: { [food]: true, [booze]: true } },
    ],
    total: "",
    weightPeople: [
      { id: uid(), name: "", weight: "1" },
      { id: uid(), name: "", weight: "1" },
    ],
  };
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...seed(), ...(JSON.parse(raw) as Persisted) };
  } catch {
    // ignore corrupt storage
  }
  return seed();
}

export default function VenmoView() {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / private mode
    }
  }, [state]);

  const { mode, categories, evenPeople, total, weightPeople } = state;
  const set = (patch: Partial<Persisted>) => setState((s) => ({ ...s, ...patch }));

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-1 text-2xl font-semibold">Split the bill</h1>
      <p className="mb-4 text-sm text-muted">Work out who owes what, then Venmo away.</p>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1">
        <ModeTab active={mode === "even"} onClick={() => set({ mode: "even" })}>
          By category
        </ModeTab>
        <ModeTab active={mode === "weighted"} onClick={() => set({ mode: "weighted" })}>
          By weight
        </ModeTab>
      </div>

      {mode === "even" ? (
        <EvenSplitter
          categories={categories}
          people={evenPeople}
          onCategories={(categories) => set({ categories })}
          onPeople={(evenPeople) => set({ evenPeople })}
        />
      ) : (
        <WeightedSplitter
          total={total}
          people={weightPeople}
          onTotal={(total) => set({ total })}
          onPeople={(weightPeople) => set({ weightPeople })}
        />
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-10 rounded-lg text-sm font-medium transition",
        active ? "bg-accent text-bg" : "text-muted hover:bg-surface2",
      )}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </h2>
  );
}

function ReconcileBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        ok ? "bg-success/15 text-success" : "bg-warn/15 text-warn",
      )}
    >
      {ok ? "Balances" : "Off the total"}
    </span>
  );
}

function EvenSplitter({
  categories,
  people,
  onCategories,
  onPeople,
}: {
  categories: CatRow[];
  people: EvenRow[];
  onCategories: (c: CatRow[]) => void;
  onPeople: (p: EvenRow[]) => void;
}) {
  const result = useMemo(() => {
    const cats: SplitCategory[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      amount: num(c.amount),
    }));
    const ppl: EvenParticipant[] = people.map((p) => ({
      id: p.id,
      name: p.name,
      joined: p.joined,
    }));
    return evenSplit(cats, ppl);
  }, [categories, people]);

  const rateById = new Map(result.rates.map((r) => [r.categoryId, r]));
  const owedById = new Map(result.owed.map((o) => [o.id, o.amount]));

  function addCategory() {
    const id = uid();
    onCategories([...categories, { id, name: "", amount: "" }]);
    onPeople(people.map((p) => ({ ...p, joined: { ...p.joined, [id]: true } })));
  }

  function removeCategory(id: string) {
    onCategories(categories.filter((c) => c.id !== id));
    onPeople(
      people.map((p) => {
        const joined = { ...p.joined };
        delete joined[id];
        return { ...p, joined };
      }),
    );
  }

  function addPerson() {
    const joined: Record<string, boolean> = {};
    for (const c of categories) joined[c.id] = true;
    onPeople([...people, { id: uid(), name: "", joined }]);
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Categories</SectionLabel>
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Input
                value={c.name}
                placeholder="Category"
                onChange={(e) =>
                  onCategories(
                    categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                  )
                }
                className="flex-1"
              />
              <div className="relative w-28">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                  $
                </span>
                <Input
                  value={c.amount}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) =>
                    onCategories(
                      categories.map((x) =>
                        x.id === c.id ? { ...x, amount: e.target.value } : x,
                      ),
                    )
                  }
                  className="pl-7 text-right"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove category"
                onClick={() => removeCategory(c.id)}
              >
                <Trash2 className="h-5 w-5 text-muted" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {categories.map((c) => {
            const r = rateById.get(c.id);
            if (!r) return null;
            return (
              <span key={c.id}>
                {c.name || "—"}: {formatMoney(r.rate)}/pp
                <span className="text-muted/60"> ({r.count})</span>
              </span>
            );
          })}
        </div>
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={addCategory}>
          <Plus className="mr-1 h-4 w-4" /> Add category
        </Button>
      </section>

      <section>
        <SectionLabel>People</SectionLabel>
        <div className="space-y-3">
          {people.map((p) => (
            <div key={p.id} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={p.name}
                  placeholder="Name"
                  onChange={(e) =>
                    onPeople(
                      people.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className="flex-1"
                />
                <span className="w-20 text-right text-base font-semibold tabular-nums">
                  {formatMoney(owedById.get(p.id) ?? 0)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove person"
                  onClick={() => onPeople(people.filter((x) => x.id !== p.id))}
                >
                  <Trash2 className="h-5 w-5 text-muted" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {categories.map((c) => {
                  const on = !!p.joined[c.id];
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        onPeople(
                          people.map((x) =>
                            x.id === p.id
                              ? { ...x, joined: { ...x.joined, [c.id]: !on } }
                              : x,
                          ),
                        )
                      }
                      className={cn(
                        "min-h-tap rounded-lg border px-3 py-1.5 text-sm transition",
                        on
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-line bg-surface2 text-muted",
                      )}
                    >
                      {c.name || "—"}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={addPerson}>
          <Plus className="mr-1 h-4 w-4" /> Add person
        </Button>
      </section>

      <section className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
        <div>
          <div className="text-sm text-muted">Bill total</div>
          <div className="text-xl font-semibold tabular-nums">{formatMoney(result.total)}</div>
        </div>
        <div className="text-right">
          <ReconcileBadge ok={result.reconciles} />
          {!result.reconciles && (
            <div className="mt-1 text-xs text-muted">
              {formatMoney(result.allocated)} assigned
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function WeightedSplitter({
  total,
  people,
  onTotal,
  onPeople,
}: {
  total: string;
  people: WeightRow[];
  onTotal: (t: string) => void;
  onPeople: (p: WeightRow[]) => void;
}) {
  const result = useMemo(
    () =>
      weightedSplit(
        num(total),
        people.map((p) => ({ id: p.id, name: p.name, weight: num(p.weight) })),
      ),
    [total, people],
  );
  const owedById = new Map(result.owed.map((o) => [o.id, o.amount]));

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Total to split</SectionLabel>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
            $
          </span>
          <Input
            value={total}
            inputMode="decimal"
            placeholder="0"
            onChange={(e) => onTotal(e.target.value)}
            className="pl-8 text-lg"
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          One full share = {formatMoney(result.perShare)} · total weight {result.totalWeight}
        </p>
      </section>

      <section>
        <SectionLabel>People</SectionLabel>
        <div className="space-y-3">
          {people.map((p) => (
            <div key={p.id} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={p.name}
                  placeholder="Name"
                  onChange={(e) =>
                    onPeople(
                      people.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className="flex-1"
                />
                <span className="w-20 text-right text-base font-semibold tabular-nums">
                  {formatMoney(owedById.get(p.id) ?? 0)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove person"
                  onClick={() => onPeople(people.filter((x) => x.id !== p.id))}
                >
                  <Trash2 className="h-5 w-5 text-muted" />
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted">Weight</span>
                {["0.5", "0.75", "1"].map((w) => (
                  <button
                    key={w}
                    onClick={() =>
                      onPeople(people.map((x) => (x.id === p.id ? { ...x, weight: w } : x)))
                    }
                    className={cn(
                      "min-h-tap rounded-lg border px-3 py-1 text-sm transition",
                      p.weight === w
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-line bg-surface2 text-muted",
                    )}
                  >
                    {w}
                  </button>
                ))}
                <Input
                  value={p.weight}
                  inputMode="decimal"
                  onChange={(e) =>
                    onPeople(
                      people.map((x) => (x.id === p.id ? { ...x, weight: e.target.value } : x)),
                    )
                  }
                  className="h-10 w-20 text-right"
                />
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 w-full"
          onClick={() => onPeople([...people, { id: uid(), name: "", weight: "1" }])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add person
        </Button>
      </section>

      <section className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
        <div>
          <div className="text-sm text-muted">Charged</div>
          <div className="text-xl font-semibold tabular-nums">{formatMoney(result.charged)}</div>
        </div>
        <ReconcileBadge ok={result.reconciles} />
      </section>
    </div>
  );
}
