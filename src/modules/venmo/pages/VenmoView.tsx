import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { evenSplit, formatMoney, type EvenParticipant, type SplitCategory } from "../calc";
import { scanReceipt, type ScannedReceipt } from "../receipt";

type CatRow = { id: string; name: string; amount: string };
type EvenRow = { id: string; name: string; joined: Record<string, boolean> };

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
  categories: CatRow[];
  evenPeople: EvenRow[];
  tip: string;
}

function seed(): Persisted {
  const item = uid();
  return {
    categories: [{ id: item, name: "", amount: "" }],
    evenPeople: [
      { id: uid(), name: "", joined: { [item]: true } },
      { id: uid(), name: "", joined: { [item]: true } },
    ],
    tip: "",
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

  const { categories, evenPeople, tip } = state;
  const set = (patch: Partial<Persisted>) => setState((s) => ({ ...s, ...patch }));

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-1 text-2xl font-semibold">Split the bill</h1>
      <p className="mb-5 text-sm text-muted">
        Scan a receipt, tag who shared each item, then Venmo away.
      </p>

      <EvenSplitter
        categories={categories}
        people={evenPeople}
        tip={tip}
        onCategories={(categories) => set({ categories })}
        onPeople={(evenPeople) => set({ evenPeople })}
        onTip={(tip) => set({ tip })}
      />
    </div>
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

// Reserved id for the tip line synthesized into the split. Tip is split evenly
// across everyone on the list (it isn't shown as a per-item toggle), so it gets
// a stable id that won't collide with a real item's uuid.
const TIP_ID = "__tip__";

function EvenSplitter({
  categories,
  people,
  tip,
  onCategories,
  onPeople,
  onTip,
}: {
  categories: CatRow[];
  people: EvenRow[];
  tip: string;
  onCategories: (c: CatRow[]) => void;
  onPeople: (p: EvenRow[]) => void;
  onTip: (t: string) => void;
}) {
  const { session } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<string | null>(null);
  const [receiptTotal, setReceiptTotal] = useState<number | null>(null);

  function applyReceipt(r: ScannedReceipt) {
    const rows: CatRow[] = r.items
      .filter((it) => it.name.trim() || it.amount)
      .map((it) => ({ id: uid(), name: it.name.trim(), amount: String(it.amount) }));
    if (r.tax) rows.push({ id: uid(), name: "Tax", amount: String(r.tax) });
    if (rows.length === 0) {
      setScanError("No items found on that photo — try again or add them by hand.");
      return;
    }
    // Everyone on the list shares every scanned item by default; untoggle the
    // ones a given person didn't have.
    const joined: Record<string, boolean> = {};
    for (const row of rows) joined[row.id] = true;
    setMerchant(r.merchant);
    setReceiptTotal(r.total);
    // Tip rarely prints on the merchant copy; prefill it when the OCR found one,
    // otherwise leave the field for manual entry.
    onTip(r.tip ? String(r.tip) : "");
    onCategories(rows);
    onPeople(
      people.length > 0
        ? people.map((p) => ({ ...p, joined: { ...joined } }))
        : [{ id: uid(), name: "", joined: { ...joined } }],
    );
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !session) return;
    setScanning(true);
    setScanError(null);
    try {
      applyReceipt(await scanReceipt(file, session.access_token));
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  const result = useMemo(() => {
    const cats: SplitCategory[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      amount: num(c.amount),
    }));
    const tipNum = num(tip);
    const ppl: EvenParticipant[] = people.map((p) => ({
      id: p.id,
      name: p.name,
      // Everyone chips in for the tip, so join them all to the synthesized line.
      joined: tipNum ? { ...p.joined, [TIP_ID]: true } : p.joined,
    }));
    if (tipNum) cats.push({ id: TIP_ID, name: "Tip", amount: tipNum });
    return evenSplit(cats, ppl);
  }, [categories, people, tip]);

  const rateById = new Map(result.rates.map((r) => [r.categoryId, r]));
  const owedById = new Map(result.owed.map((o) => [o.id, o.amount]));
  // The receipt total covers items + tax but not the (often hand-written) tip,
  // so cross-check against the pre-tip subtotal.
  const subtotal = result.total - num(tip);
  const receiptDelta = receiptTotal == null ? 0 : subtotal - receiptTotal;

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

  function toggleShare(personId: string, itemId: string) {
    onPeople(
      people.map((p) =>
        p.id === personId ? { ...p, joined: { ...p.joined, [itemId]: !p.joined[itemId] } } : p,
      ),
    );
  }

  function personLabel(p: EvenRow, i: number) {
    return p.name.trim() || `Person ${i + 1}`;
  }

  function clearTags() {
    onPeople(people.map((p) => ({ ...p, joined: {} })));
  }

  const anyTagged = people.some((p) => Object.values(p.joined).some(Boolean));

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Items</SectionLabel>
          <div className="flex items-center gap-3">
            {merchant && <span className="text-xs text-muted">{merchant}</span>}
            {anyTagged && (
              <button
                onClick={clearTags}
                className="text-xs font-medium text-accent hover:underline"
              >
                Clear tags
              </button>
            )}
          </div>
        </div>
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
        <div className="mb-3 flex gap-2">
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            disabled={scanning || !session}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="mr-2 h-5 w-5" />
            {scanning ? "Reading..." : "Scan receipt"}
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="flex-1"
            disabled={scanning || !session}
            onClick={() => libraryRef.current?.click()}
          >
            <ImagePlus className="mr-2 h-5 w-5" />
            Upload photo
          </Button>
        </div>
        {scanError && <p className="mb-3 text-xs text-danger">{scanError}</p>}
        <div className="space-y-3">
          {categories.map((c) => {
            const r = rateById.get(c.id);
            return (
              <div key={c.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={c.name}
                    placeholder="Item"
                    onChange={(e) =>
                      onCategories(
                        categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    className="flex-1"
                  />
                  <div className="relative w-24">
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
                    aria-label="Remove item"
                    onClick={() => removeCategory(c.id)}
                  >
                    <Trash2 className="h-5 w-5 text-muted" />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {people.length === 0 ? (
                    <span className="text-xs text-muted">Add people below, then tag who shared this.</span>
                  ) : (
                    people.map((p, i) => {
                      const on = !!p.joined[c.id];
                      return (
                        <button
                          key={p.id}
                          onClick={() => toggleShare(p.id, c.id)}
                          className={cn(
                            "min-h-tap rounded-lg border px-3 py-1.5 text-sm transition",
                            on
                              ? "border-accent bg-accent/15 text-accent"
                              : "border-line bg-surface2 text-muted",
                          )}
                        >
                          {personLabel(p, i)}
                        </button>
                      );
                    })
                  )}
                </div>
                {r && r.count > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    {formatMoney(r.rate)}/pp · split {r.count} {r.count === 1 ? "way" : "ways"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={addCategory}>
          <Plus className="mr-1 h-4 w-4" /> Add item
        </Button>
      </section>

      <section>
        <SectionLabel>People</SectionLabel>
        <div className="space-y-2">
          {people.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Input
                value={p.name}
                placeholder="Name"
                onChange={(e) =>
                  onPeople(people.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))
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
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={addPerson}>
          <Plus className="mr-1 h-4 w-4" /> Add person
        </Button>
      </section>

      <section>
        <SectionLabel>Tip</SectionLabel>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
            $
          </span>
          <Input
            value={tip}
            inputMode="decimal"
            placeholder="0"
            onChange={(e) => onTip(e.target.value)}
            className="pl-8"
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          Added on top of the items and split evenly across everyone.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
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
        </div>
        {receiptTotal != null && (
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="text-muted">Receipt total</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{formatMoney(receiptTotal)}</span>
              {Math.abs(receiptDelta) < 0.005 ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                  Matches
                </span>
              ) : (
                <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
                  {receiptDelta > 0 ? "+" : "−"}
                  {formatMoney(Math.abs(receiptDelta))}
                </span>
              )}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
