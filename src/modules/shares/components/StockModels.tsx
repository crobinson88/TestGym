import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileSpreadsheet, Sheet, Table2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { LocalShareTrade } from "@/lib/db";
import type { TradeModel } from "@/lib/database.types";
import { signedUrlMap } from "../storage";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StockModels({ trades }: { trades: LocalShareTrade[] | undefined }) {
  const { session } = useAuth();
  const who = session?.user?.email ?? "";
  const [urls, setUrls] = useState<Record<string, string>>({});

  const items = useMemo(() => {
    const out: { model: TradeModel; trade: LocalShareTrade }[] = [];
    for (const t of trades ?? []) for (const m of t.models ?? []) out.push({ model: m, trade: t });
    return out.sort((a, b) => (a.trade.created_at < b.trade.created_at ? 1 : -1));
  }, [trades]);

  const paths = useMemo(
    () =>
      items
        .filter((i) => i.model.kind === "file" && i.model.path)
        .map((i) => i.model.path as string),
    [items],
  );
  const pathKey = paths.join("|");
  useEffect(() => {
    let active = true;
    if (paths.length === 0) {
      setUrls({});
      return;
    }
    void signedUrlMap(paths).then((m) => {
      if (active) setUrls(m);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Table2 className="h-5 w-5 text-accent" />
        <h2 className="text-base font-semibold">Models</h2>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-sm text-muted">
          No models yet. Attach an Excel model or Google Sheet when logging a trade.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map(({ model, trade }, i) => {
            const href = model.kind === "sheet" ? model.url ?? undefined : urls[model.path ?? ""];
            const Icon = model.kind === "sheet" ? Sheet : FileSpreadsheet;
            return (
              <li
                key={`${trade.id}-${i}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm"
              >
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center gap-2"
                  aria-disabled={!href}
                >
                  <Icon className="h-4 w-4 shrink-0 text-accent" />
                  <span className="truncate">{model.name}</span>
                  {href && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" />}
                </a>
                <Link
                  to={`/shares/${trade.id}`}
                  className="flex shrink-0 flex-col items-end text-right text-[11px] text-muted/80"
                >
                  <span className="whitespace-nowrap capitalize text-muted">
                    {trade.side} · {formatDateTime(trade.created_at)}
                  </span>
                  {who && <span className="max-w-[150px] truncate">{who}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
