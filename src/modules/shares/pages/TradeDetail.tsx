import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  ExternalLink,
  FileSpreadsheet,
  Pencil,
  Sheet,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { syncEngine } from "@/lib/sync";
import { cn, prettyDate } from "@/lib/utils";
import { useShareTrade } from "../hooks";
import { formatMoney, formatQty } from "../types";
import { signedImageUrls, signedUrlMap } from "../storage";

export default function TradeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const trade = useShareTrade(id);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [modelUrls, setModelUrls] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    let active = true;
    if (trade?.images && trade.images.length > 0) {
      void signedImageUrls(trade.images).then((urls) => {
        if (active) setImageUrls(urls);
      });
    } else {
      setImageUrls([]);
    }
    return () => {
      active = false;
    };
  }, [trade?.id, trade?.images]);

  useEffect(() => {
    let active = true;
    const paths = (trade?.models ?? [])
      .filter((m) => m.kind === "file" && m.path)
      .map((m) => m.path as string);
    if (paths.length === 0) {
      setModelUrls({});
      return;
    }
    void signedUrlMap(paths).then((m) => {
      if (active) setModelUrls(m);
    });
    return () => {
      active = false;
    };
  }, [trade?.id, trade?.models]);

  if (trade === undefined) {
    return <div className="p-6 text-center text-muted">Loading…</div>;
  }
  if (trade === null || trade.deleted_at) {
    return (
      <div className="p-6 text-center text-muted">
        Trade not found.{" "}
        <button onClick={() => navigate("/shares")} className="text-accent underline">
          Back
        </button>
      </div>
    );
  }

  async function remove() {
    if (!id) return;
    await syncEngine.mutations.deleteShareTrade(id);
    navigate("/shares");
  }

  function startEditNotes() {
    setNotesDraft(trade && trade.notes ? trade.notes : "");
    setEditingNotes(true);
  }

  async function saveNotes() {
    if (!id) return;
    setSavingNotes(true);
    try {
      await syncEngine.mutations.updateShareTrade(id, {
        notes: notesDraft.trim() === "" ? null : notesDraft,
      });
      setEditingNotes(false);
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={() => navigate("/shares")}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="font-medium text-text">Trade</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-24">
        <div className="flex items-baseline justify-between">
          <div>
            <Link to={`/shares/stock/${trade.ticker}`} className="text-3xl font-bold underline-offset-4 hover:underline">
              {trade.ticker}
            </Link>
            <span
              className={cn(
                "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase",
                trade.side === "buy"
                  ? "bg-success/15 text-success"
                  : "bg-warn/15 text-warn",
              )}
            >
              {trade.side}
            </span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">
              {formatMoney(trade.quantity * trade.price, trade.currency)}
            </div>
            <div className="text-xs text-muted">{prettyDate(trade.traded_at)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Quantity" value={formatQty(trade.quantity)} />
          <Stat label="Price" value={formatMoney(trade.price, trade.currency)} />
          <Stat label="Currency" value={trade.currency} />
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs uppercase tracking-wider text-muted">Notes</h2>
            {!editingNotes && (
              <button
                onClick={startEditNotes}
                className="flex items-center gap-1 text-xs text-accent"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={6}
                placeholder="Why this trade? Paste a research summary here…"
                className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-base text-text placeholder:text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setEditingNotes(false)}
                  disabled={savingNotes}
                >
                  <X className="mr-1 h-4 w-4" /> Cancel
                </Button>
                <Button size="sm" className="flex-1" onClick={saveNotes} disabled={savingNotes}>
                  <Check className="mr-1 h-4 w-4" /> {savingNotes ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : trade.notes ? (
            <p className="whitespace-pre-wrap rounded-2xl border border-line bg-surface px-4 py-3 text-base">
              {trade.notes}
            </p>
          ) : (
            <button
              onClick={startEditNotes}
              className="w-full rounded-2xl border border-dashed border-line bg-surface px-4 py-3 text-left text-sm text-muted"
            >
              Add notes…
            </button>
          )}
          <Link
            to={`/shares/stock/${trade.ticker}`}
            className="flex items-center gap-1 px-1 text-sm text-accent"
          >
            <Sparkles className="h-4 w-4" /> Research {trade.ticker} with Claude
          </Link>
        </section>

        {trade.links.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-xs uppercase tracking-wider text-muted">Links</h2>
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {trade.links.map((link) => (
                <li key={link} className="border-b border-line/50 last:border-b-0">
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-3 text-accent active:bg-surface2"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    <span className="truncate">{link}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {trade.models.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-xs uppercase tracking-wider text-muted">Models</h2>
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {trade.models.map((model, i) => {
                const href =
                  model.kind === "sheet" ? model.url ?? undefined : modelUrls[model.path ?? ""];
                const Icon = model.kind === "sheet" ? Sheet : FileSpreadsheet;
                return (
                  <li key={`${model.name}-${i}`} className="border-b border-line/50 last:border-b-0">
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 px-4 py-3 active:bg-surface2"
                      aria-disabled={!href}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-accent" />
                      <span className="truncate">{model.name}</span>
                      {href && <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-muted" />}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {trade.images.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-xs uppercase tracking-wider text-muted">Images</h2>
            {imageUrls.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
                Loading images…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {imageUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt="Trade attachment"
                      className="h-40 w-full rounded-xl border border-line object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="pt-2">
          {confirming ? (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={remove}>
                Delete trade
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="w-full text-danger" onClick={() => setConfirming(true)}>
              <Trash2 className="mr-2 h-5 w-5" /> Delete trade
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3 text-center">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
