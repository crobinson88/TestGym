import { describe, expect, it } from "vitest";
import type { WorkstreamRow } from "@/lib/database.types";
import {
  STALE_AFTER_MS,
  displayTitle,
  isStale,
  subtitle,
  workstreamLabel,
  relativeTime,
  sortWorkstreams,
  summaryMetrics,
  visibleWorkstreams,
} from "./compute";

const NOW = Date.parse("2026-08-17T12:00:00.000Z");

function row(over: Partial<WorkstreamRow> = {}): WorkstreamRow {
  return {
    id: over.id ?? "id-1",
    title: "gym-tracker",
    type: "code_cli",
    status: "in_progress",
    source_id: "sess-1",
    last_action: null,
    metadata: {},
    client_id: null,
    user_id: null,
    created_at: "2026-08-17T11:00:00.000Z",
    updated_at: "2026-08-17T11:59:00.000Z",
    deleted_at: null,
    ...over,
  };
}

describe("summaryMetrics", () => {
  it("counts only in-flight rows per card", () => {
    const rows = [
      row({ id: "a", status: "in_progress", type: "code_cli" }),
      row({ id: "b", status: "waiting_input", type: "code_cli" }),
      row({ id: "c", status: "completed", type: "code_cli" }),
      row({ id: "d", status: "in_progress", type: "email_task" }),
      row({ id: "e", status: "completed", type: "email_task" }),
      row({ id: "f", status: "failed", type: "web_chat" }),
    ];
    expect(summaryMetrics(rows)).toEqual({
      totalActive: 3,
      waitingInput: 1,
      codeSessions: 2,
      pendingEmail: 1,
    });
  });

  it("is zeroed on an empty board", () => {
    expect(summaryMetrics([])).toEqual({
      totalActive: 0,
      waitingInput: 0,
      codeSessions: 0,
      pendingEmail: 0,
    });
  });
});

describe("isStale", () => {
  it("flags an in-flight row untouched past the window", () => {
    const old = new Date(NOW - STALE_AFTER_MS - 1000).toISOString();
    expect(isStale(row({ updated_at: old }), NOW)).toBe(true);
  });

  it("leaves recent rows alone", () => {
    expect(isStale(row({ updated_at: new Date(NOW - 60_000).toISOString() }), NOW)).toBe(false);
  });

  it("never flags a finished row, however old", () => {
    const old = new Date(NOW - STALE_AFTER_MS * 10).toISOString();
    expect(isStale(row({ status: "completed", updated_at: old }), NOW)).toBe(false);
  });
});

describe("sortWorkstreams", () => {
  it("puts waiting-on-you first, then running, then finished", () => {
    const rows = [
      row({ id: "done", status: "completed" }),
      row({ id: "running", status: "in_progress" }),
      row({ id: "waiting", status: "waiting_input" }),
      row({ id: "failed", status: "failed" }),
    ];
    expect(sortWorkstreams(rows).map((r) => r.id)).toEqual([
      "waiting",
      "running",
      "failed",
      "done",
    ]);
  });

  it("breaks ties on most-recently-updated", () => {
    const rows = [
      row({ id: "older", updated_at: "2026-08-17T10:00:00.000Z" }),
      row({ id: "newer", updated_at: "2026-08-17T11:00:00.000Z" }),
    ];
    expect(sortWorkstreams(rows).map((r) => r.id)).toEqual(["newer", "older"]);
  });

  it("does not mutate the input", () => {
    const rows = [row({ id: "done", status: "completed" }), row({ id: "waiting", status: "waiting_input" })];
    sortWorkstreams(rows);
    expect(rows.map((r) => r.id)).toEqual(["done", "waiting"]);
  });
});

describe("visibleWorkstreams", () => {
  const rows = [
    row({ id: "a", title: "gym-tracker", status: "in_progress" }),
    row({ id: "b", title: "inspection-portal", status: "waiting_input" }),
    row({ id: "c", title: "gym-tracker docs", status: "completed" }),
  ];

  it("filters by tab", () => {
    expect(visibleWorkstreams(rows, "active", "").map((r) => r.id)).toEqual(["b", "a"]);
    expect(visibleWorkstreams(rows, "completed", "").map((r) => r.id)).toEqual(["c"]);
    expect(visibleWorkstreams(rows, "all", "")).toHaveLength(3);
  });

  it("searches title case-insensitively", () => {
    expect(visibleWorkstreams(rows, "all", "GYM").map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("searches last_action and status label too", () => {
    const withAction = [row({ id: "x", last_action: "Needs permission to run rm" })];
    expect(visibleWorkstreams(withAction, "all", "permission")).toHaveLength(1);
    expect(visibleWorkstreams(rows, "all", "waiting").map((r) => r.id)).toEqual(["b"]);
  });

  it("combines tab and search", () => {
    expect(visibleWorkstreams(rows, "active", "gym").map((r) => r.id)).toEqual(["a"]);
  });

  it("treats a whitespace-only query as no filter", () => {
    expect(visibleWorkstreams(rows, "all", "   ")).toHaveLength(3);
  });
});

describe("relativeTime", () => {
  it("renders each magnitude", () => {
    expect(relativeTime(new Date(NOW - 5_000).toISOString(), NOW)).toBe("just now");
    expect(relativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5m ago");
    expect(relativeTime(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("3h ago");
    expect(relativeTime(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe("2d ago");
  });

  it("does not render a future clock skew as a negative age", () => {
    expect(relativeTime(new Date(NOW + 10_000).toISOString(), NOW)).toBe("just now");
  });

  it("survives an unparseable timestamp", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("—");
  });
});

describe("workstreamLabel / displayTitle", () => {
  it("falls back to the system title when unnamed", () => {
    const r = row();
    expect(workstreamLabel(r)).toBeNull();
    expect(displayTitle(r)).toBe("gym-tracker");
  });

  it("prefers a typed name over the system title", () => {
    const r = row({ metadata: { label: "Fixing the food pie chart" } });
    expect(displayTitle(r)).toBe("Fixing the food pie chart");
  });

  it("ignores a blank or non-string label", () => {
    expect(workstreamLabel(row({ metadata: { label: "   " } }))).toBeNull();
    expect(workstreamLabel(row({ metadata: { label: 42 } }))).toBeNull();
    expect(displayTitle(row({ metadata: { label: "  " } }))).toBe("gym-tracker");
  });

  it("trims the stored name", () => {
    expect(workstreamLabel(row({ metadata: { label: "  Ocean Rd quote  " } }))).toBe(
      "Ocean Rd quote",
    );
  });
});

describe("subtitle", () => {
  it("shows cwd and branch for a CLI row", () => {
    const r = row({ metadata: { cwd: "~/code/TestGym", branch: "main" } });
    expect(subtitle(r)).toBe("~/code/TestGym · main");
  });

  it("keeps the system title visible once a name is typed", () => {
    const r = row({
      title: "gym-tracker (claude/food-pie)",
      metadata: { label: "Food pie chart", cwd: "~/code/gym-tracker", branch: "claude/food-pie" },
    });
    expect(subtitle(r)).toBe("gym-tracker (claude/food-pie) · ~/code/gym-tracker · claude/food-pie");
  });

  it("uses the sender for an email row", () => {
    const r = row({ type: "email_task", metadata: { from: "kyp@wallinnovations.com" } });
    expect(subtitle(r)).toBe("kyp@wallinnovations.com");
  });

  it("is null when there is nothing to show", () => {
    expect(subtitle(row({ type: "web_chat", metadata: {} }))).toBeNull();
  });

  it("drops an empty branch rather than rendering a dangling separator", () => {
    const r = row({ metadata: { cwd: "~/code/TestGym", branch: "" } });
    expect(subtitle(r)).toBe("~/code/TestGym");
  });
});

describe("search over a typed name", () => {
  it("finds a row by the name you gave it", () => {
    const rows = [
      row({ id: "a", title: "gym-tracker (claude/food-pie)", metadata: { label: "Food pie chart" } }),
      row({ id: "b", title: "inspection-portal" }),
    ];
    expect(visibleWorkstreams(rows, "all", "pie chart").map((r) => r.id)).toEqual(["a"]);
  });

  it("still finds it by the system title", () => {
    const rows = [
      row({ id: "a", title: "gym-tracker (claude/food-pie)", metadata: { label: "Food pie chart" } }),
    ];
    expect(visibleWorkstreams(rows, "all", "gym-tracker").map((r) => r.id)).toEqual(["a"]);
  });
});
