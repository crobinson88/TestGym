import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { syncEngine } from "@/lib/sync";
import { cn, prettyDate } from "@/lib/utils";
import { useShareTrade } from "../hooks";
import { formatMoney, formatQty } from "../types";
import { signedImageUrls } from "../storage";

export default function TradeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const trade = useShareTrade(id);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

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
            <h1 className="text-3xl font-bold">{trade.ticker}</h1>
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

        {trade.notes && (
          <section className="space-y-2">
            <h2 className="px-1 text-xs uppercase tracking-wider text-muted">Notes</h2>
            <p className="whitespace-pre-wrap rounded-2xl border border-line bg-surface px-4 py-3 text-base">
              {trade.notes}
            </p>
          </section>
        )}

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
