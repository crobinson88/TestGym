import type { GymDB } from "../db";
import type {
  CardioSessionRow,
  CategoryRow,
  ExerciseRow,
  FrenchAttemptRow,
  MarketNoteRow,
  MetActivityRow,
  ForecastRow,
  ReadingItemRow,
  SetRow,
  ShareTradeRow,
  SmokingLogRow,
  StockRow,
  TipRow,
  TdlCategoryRow,
  TdlDayRow,
  TdlItemRow,
  TimeAllocationRow,
  TimeTaskRow,
} from "../database.types";
import type { Client, Logger, PullResult, SyncTable } from "./types";
import { SYNC_TABLES } from "./types";

const PAGE_SIZE = 1000;

async function fetchSince<T>(client: Client, table: SyncTable, since: string | null): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    let q = client.from(table).select("*");
    if (since) q = q.gt("updated_at", since);
    q = q.order("updated_at", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data as T[]) ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function mergeSets(db: GymDB, rows: SetRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.sets, async () => {
    for (const remote of rows) {
      const local = await db.sets.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.sets.put({
          ...remote,
          sync_status: "synced",
          sync_attempts: 0,
          sync_last_error: null,
        });
      }
    }
  });
}

async function mergeExercises(db: GymDB, rows: ExerciseRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.exercises, async () => {
    for (const remote of rows) {
      const local = await db.exercises.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.exercises.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeCategories(db: GymDB, rows: CategoryRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.categories, async () => {
    for (const remote of rows) {
      const local = await db.categories.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.categories.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeMetActivities(db: GymDB, rows: MetActivityRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.met_activities, async () => {
    for (const remote of rows) {
      const local = await db.met_activities.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.met_activities.put({
          ...remote,
          met_value: Number(remote.met_value),
          sync_status: "synced",
        });
      }
    }
  });
}

async function mergeCardioSessions(db: GymDB, rows: CardioSessionRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.cardio_sessions, async () => {
    for (const remote of rows) {
      const local = await db.cardio_sessions.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.cardio_sessions.put({
          ...remote,
          minutes: Number(remote.minutes),
          met_value_snapshot: Number(remote.met_value_snapshot),
          met_minutes: remote.met_minutes === null ? null : Number(remote.met_minutes),
          distance: remote.distance === null ? null : Number(remote.distance),
          sync_status: "synced",
          sync_attempts: 0,
          sync_last_error: null,
        });
      }
    }
  });
}

async function mergeTdlItems(db: GymDB, rows: TdlItemRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.tdl_items, async () => {
    for (const remote of rows) {
      const local = await db.tdl_items.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.tdl_items.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeTdlDays(db: GymDB, rows: TdlDayRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.tdl_days, async () => {
    for (const remote of rows) {
      const local = await db.tdl_days.get(remote.snapshot_date);
      if (!local || remote.updated_at > local.updated_at) {
        await db.tdl_days.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeTdlCategories(db: GymDB, rows: TdlCategoryRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.tdl_categories, async () => {
    for (const remote of rows) {
      const local = await db.tdl_categories.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.tdl_categories.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeTimeTasks(db: GymDB, rows: TimeTaskRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.timeTasks, async () => {
    for (const remote of rows) {
      const local = await db.timeTasks.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.timeTasks.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeTimeAllocations(db: GymDB, rows: TimeAllocationRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.timeAllocations, async () => {
    for (const remote of rows) {
      const local = await db.timeAllocations.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.timeAllocations.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeShareTrades(db: GymDB, rows: ShareTradeRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.share_trades, async () => {
    for (const remote of rows) {
      const local = await db.share_trades.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.share_trades.put({
          ...remote,
          quantity: Number(remote.quantity),
          price: Number(remote.price),
          total: remote.total === null ? null : Number(remote.total),
          target_price: remote.target_price == null ? null : Number(remote.target_price),
          links: remote.links ?? [],
          images: remote.images ?? [],
          models: remote.models ?? [],
          sync_status: "synced",
          sync_attempts: 0,
          sync_last_error: null,
        });
      }
    }
  });
}

async function mergeStocks(db: GymDB, rows: StockRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.stocks, async () => {
    for (const remote of rows) {
      const local = await db.stocks.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.stocks.put({
          ...remote,
          links: remote.links ?? [],
          documents: remote.documents ?? [],
          sync_status: "synced",
        });
      }
    }
  });
}

async function mergeForecasts(db: GymDB, rows: ForecastRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.forecasts, async () => {
    for (const remote of rows) {
      const local = await db.forecasts.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.forecasts.put({
          ...remote,
          base_price: Number(remote.base_price),
          target_price: Number(remote.target_price),
          sync_status: "synced",
        });
      }
    }
  });
}

async function mergeFrenchAttempts(db: GymDB, rows: FrenchAttemptRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.french_attempts, async () => {
    for (const remote of rows) {
      const local = await db.french_attempts.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.french_attempts.put({
          ...remote,
          total: Number(remote.total),
          correct: Number(remote.correct),
          duration_ms: remote.duration_ms === null ? null : Number(remote.duration_ms),
          details: remote.details ?? [],
          sync_status: "synced",
        });
      }
    }
  });
}

async function mergeReadingItems(db: GymDB, rows: ReadingItemRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.reading_items, async () => {
    for (const remote of rows) {
      const local = await db.reading_items.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.reading_items.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeTips(db: GymDB, rows: TipRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.tips, async () => {
    for (const remote of rows) {
      const local = await db.tips.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.tips.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeMarketNotes(db: GymDB, rows: MarketNoteRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.market_notes, async () => {
    for (const remote of rows) {
      const local = await db.market_notes.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.market_notes.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeSmokingLogs(db: GymDB, rows: SmokingLogRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.smoking_logs, async () => {
    for (const remote of rows) {
      const local = await db.smoking_logs.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.smoking_logs.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

export interface PullDeps {
  client: Client;
  db: GymDB;
  log?: Logger;
}

const META_KEYS: Record<SyncTable, string> = {
  sets: "last_pull_sets",
  exercises: "last_pull_exercises",
  categories: "last_pull_categories",
  met_activities: "last_pull_met_activities",
  cardio_sessions: "last_pull_cardio_sessions",
  tdl_items: "last_pull_tdl_items",
  tdl_days: "last_pull_tdl_days",
  tdl_categories: "last_pull_tdl_categories",
  time_tasks: "last_pull_time_tasks",
  time_allocations: "last_pull_time_allocations",
  share_trades: "last_pull_share_trades",
  stocks: "last_pull_stocks",
  forecasts: "last_pull_forecasts",
  french_attempts: "last_pull_french_attempts",
  reading_items: "last_pull_reading_items",
  tips: "last_pull_tips",
  market_notes: "last_pull_market_notes",
  smoking_logs: "last_pull_smoking_logs",
};

export function createPull({ client, db, log }: PullDeps) {
  async function readMark(table: SyncTable): Promise<string | null> {
    const row = await db.meta.get(META_KEYS[table]);
    return row?.value ?? null;
  }

  async function writeMark(table: SyncTable, value: string) {
    await db.meta.put({ key: META_KEYS[table], value, updated_at: new Date().toISOString() });
  }

  async function pull(): Promise<PullResult> {
    const fetched: PullResult["fetched"] = {
      sets: 0,
      exercises: 0,
      categories: 0,
      met_activities: 0,
      cardio_sessions: 0,
      tdl_items: 0,
      tdl_days: 0,
      tdl_categories: 0,
      time_tasks: 0,
      time_allocations: 0,
      share_trades: 0,
      stocks: 0,
      forecasts: 0,
      french_attempts: 0,
      reading_items: 0,
      tips: 0,
      market_notes: 0,
      smoking_logs: 0,
    };

    for (const table of SYNC_TABLES) {
      const since = await readMark(table);
      log?.(`pull: ${table} since=${since ?? "<full>"}`);
      try {
        if (table === "sets") {
          const rows = await fetchSince<SetRow>(client, "sets", since);
          await mergeSets(db, rows);
          fetched.sets = rows.length;
          if (rows.length > 0) await writeMark("sets", rows[rows.length - 1].updated_at);
        } else if (table === "exercises") {
          const rows = await fetchSince<ExerciseRow>(client, "exercises", since);
          await mergeExercises(db, rows);
          fetched.exercises = rows.length;
          if (rows.length > 0) await writeMark("exercises", rows[rows.length - 1].updated_at);
        } else if (table === "categories") {
          const rows = await fetchSince<CategoryRow>(client, "categories", since);
          await mergeCategories(db, rows);
          fetched.categories = rows.length;
          if (rows.length > 0) await writeMark("categories", rows[rows.length - 1].updated_at);
        } else if (table === "met_activities") {
          const rows = await fetchSince<MetActivityRow>(client, "met_activities", since);
          await mergeMetActivities(db, rows);
          fetched.met_activities = rows.length;
          if (rows.length > 0) await writeMark("met_activities", rows[rows.length - 1].updated_at);
        } else if (table === "cardio_sessions") {
          const rows = await fetchSince<CardioSessionRow>(client, "cardio_sessions", since);
          await mergeCardioSessions(db, rows);
          fetched.cardio_sessions = rows.length;
          if (rows.length > 0) await writeMark("cardio_sessions", rows[rows.length - 1].updated_at);
        } else if (table === "tdl_items") {
          const rows = await fetchSince<TdlItemRow>(client, "tdl_items", since);
          await mergeTdlItems(db, rows);
          fetched.tdl_items = rows.length;
          if (rows.length > 0) await writeMark("tdl_items", rows[rows.length - 1].updated_at);
        } else if (table === "tdl_days") {
          const rows = await fetchSince<TdlDayRow>(client, "tdl_days", since);
          await mergeTdlDays(db, rows);
          fetched.tdl_days = rows.length;
          if (rows.length > 0) await writeMark("tdl_days", rows[rows.length - 1].updated_at);
        } else if (table === "tdl_categories") {
          const rows = await fetchSince<TdlCategoryRow>(client, "tdl_categories", since);
          await mergeTdlCategories(db, rows);
          fetched.tdl_categories = rows.length;
          if (rows.length > 0) await writeMark("tdl_categories", rows[rows.length - 1].updated_at);
        } else if (table === "time_tasks") {
          const rows = await fetchSince<TimeTaskRow>(client, "time_tasks", since);
          await mergeTimeTasks(db, rows);
          fetched.time_tasks = rows.length;
          if (rows.length > 0) await writeMark("time_tasks", rows[rows.length - 1].updated_at);
        } else if (table === "time_allocations") {
          const rows = await fetchSince<TimeAllocationRow>(client, "time_allocations", since);
          await mergeTimeAllocations(db, rows);
          fetched.time_allocations = rows.length;
          if (rows.length > 0) {
            await writeMark("time_allocations", rows[rows.length - 1].updated_at);
          }
        } else if (table === "share_trades") {
          const rows = await fetchSince<ShareTradeRow>(client, "share_trades", since);
          await mergeShareTrades(db, rows);
          fetched.share_trades = rows.length;
          if (rows.length > 0) {
            await writeMark("share_trades", rows[rows.length - 1].updated_at);
          }
        } else if (table === "stocks") {
          const rows = await fetchSince<StockRow>(client, "stocks", since);
          await mergeStocks(db, rows);
          fetched.stocks = rows.length;
          if (rows.length > 0) {
            await writeMark("stocks", rows[rows.length - 1].updated_at);
          }
        } else if (table === "forecasts") {
          const rows = await fetchSince<ForecastRow>(client, "forecasts", since);
          await mergeForecasts(db, rows);
          fetched.forecasts = rows.length;
          if (rows.length > 0) {
            await writeMark("forecasts", rows[rows.length - 1].updated_at);
          }
        } else if (table === "french_attempts") {
          const rows = await fetchSince<FrenchAttemptRow>(client, "french_attempts", since);
          await mergeFrenchAttempts(db, rows);
          fetched.french_attempts = rows.length;
          if (rows.length > 0) {
            await writeMark("french_attempts", rows[rows.length - 1].updated_at);
          }
        } else if (table === "reading_items") {
          const rows = await fetchSince<ReadingItemRow>(client, "reading_items", since);
          await mergeReadingItems(db, rows);
          fetched.reading_items = rows.length;
          if (rows.length > 0) {
            await writeMark("reading_items", rows[rows.length - 1].updated_at);
          }
        } else if (table === "tips") {
          const rows = await fetchSince<TipRow>(client, "tips", since);
          await mergeTips(db, rows);
          fetched.tips = rows.length;
          if (rows.length > 0) {
            await writeMark("tips", rows[rows.length - 1].updated_at);
          }
        } else if (table === "market_notes") {
          const rows = await fetchSince<MarketNoteRow>(client, "market_notes", since);
          await mergeMarketNotes(db, rows);
          fetched.market_notes = rows.length;
          if (rows.length > 0) {
            await writeMark("market_notes", rows[rows.length - 1].updated_at);
          }
        } else {
          const rows = await fetchSince<SmokingLogRow>(client, "smoking_logs", since);
          await mergeSmokingLogs(db, rows);
          fetched.smoking_logs = rows.length;
          if (rows.length > 0) {
            await writeMark("smoking_logs", rows[rows.length - 1].updated_at);
          }
        }
      } catch (err) {
        log?.(`pull: ${table} failed`, (err as Error).message);
        throw err;
      }
    }
    return { fetched };
  }

  return { pull };
}

export type Pull = ReturnType<typeof createPull>;
