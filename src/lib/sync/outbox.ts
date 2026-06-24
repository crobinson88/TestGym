import type {
  GymDB,
  LocalCardioSession,
  LocalCategory,
  LocalExercise,
  LocalFrenchAttempt,
  LocalMetActivity,
  LocalForecast,
  LocalReadingItem,
  LocalSet,
  LocalShareTrade,
  LocalStock,
  LocalTdlCategory,
  LocalTdlDay,
  LocalTdlItem,
  LocalTimeAllocation,
  LocalTimeTask,
  LocalTip,
} from "../db";
import type { Client, DrainResult, Logger, SyncTable } from "./types";
import { DEXIE_TABLE, SYNC_TABLES } from "./types";

type PendingRow =
  | LocalSet
  | LocalExercise
  | LocalCategory
  | LocalMetActivity
  | LocalCardioSession
  | LocalTdlItem
  | LocalTdlDay
  | LocalTdlCategory
  | LocalTimeTask
  | LocalTimeAllocation
  | LocalShareTrade
  | LocalStock
  | LocalForecast
  | LocalFrenchAttempt
  | LocalReadingItem
  | LocalTip;

const STRIP_KEYS = [
  "sync_status",
  "sync_attempts",
  "sync_last_error",
  "volume",
  "met_minutes",
  "total",
  "created_at",
  "user_id",
] as const;

const PK_BY_TABLE: Record<SyncTable, string> = {
  sets: "id",
  exercises: "id",
  categories: "id",
  met_activities: "id",
  cardio_sessions: "id",
  tdl_items: "id",
  tdl_days: "snapshot_date",
  tdl_categories: "id",
  time_tasks: "id",
  time_allocations: "id",
  share_trades: "id",
  stocks: "id",
  forecasts: "id",
  french_attempts: "id",
  reading_items: "id",
  tips: "id",
};

function toPayload(row: PendingRow): Record<string, unknown> {
  const copy = { ...row } as Record<string, unknown>;
  for (const k of STRIP_KEYS) delete copy[k];
  return copy;
}

function pkOf(table: SyncTable, row: PendingRow): string {
  return table === "tdl_days"
    ? (row as LocalTdlDay).snapshot_date
    : (row as { id: string }).id;
}

async function loadPending(db: GymDB, table: SyncTable, limit: number): Promise<PendingRow[]> {
  if (table === "sets") {
    return db.sets.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "exercises") {
    return db.exercises.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "categories") {
    return db.categories.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "met_activities") {
    return db.met_activities.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "cardio_sessions") {
    return db.cardio_sessions.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "tdl_items") {
    return db.tdl_items.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "tdl_days") {
    return db.tdl_days.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "tdl_categories") {
    return db.tdl_categories.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "time_tasks") {
    return db.timeTasks.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "time_allocations") {
    return db.timeAllocations.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "share_trades") {
    return db.share_trades.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "stocks") {
    return db.stocks.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "forecasts") {
    return db.forecasts.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "french_attempts") {
    return db.french_attempts.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "reading_items") {
    return db.reading_items.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "tips") {
    return db.tips.where("sync_status").equals("pending").limit(limit).toArray();
  }
  return db.tdl_days.where("sync_status").equals("pending").limit(limit).toArray();
}

async function markSynced(
  db: GymDB,
  table: SyncTable,
  rows: ReadonlyArray<PendingRow>,
) {
  const keyField = PK_BY_TABLE[table];
  const keys = rows.map((r) => pkOf(table, r));
  await db.table(DEXIE_TABLE[table]).where(keyField).anyOf(keys).modify({
    sync_status: "synced",
    sync_attempts: 0,
    sync_last_error: null,
  });
}

async function markError(
  db: GymDB,
  table: SyncTable,
  row: PendingRow,
  message: string,
) {
  const pk = pkOf(table, row);
  if (table === "sets") {
    await db.sets.update(pk, {
      sync_status: "error",
      sync_attempts: (row as LocalSet).sync_attempts + 1,
      sync_last_error: message,
    });
  } else if (table === "cardio_sessions") {
    await db.cardio_sessions.update(pk, {
      sync_status: "error",
      sync_attempts: (row as LocalCardioSession).sync_attempts + 1,
      sync_last_error: message,
    });
  } else if (table === "share_trades") {
    await db.share_trades.update(pk, {
      sync_status: "error",
      sync_attempts: (row as LocalShareTrade).sync_attempts + 1,
      sync_last_error: message,
    });
  } else {
    await db.table(DEXIE_TABLE[table]).update(pk, {
      sync_status: "error",
      sync_last_error: message,
    });
  }
}

export interface OutboxDeps {
  client: Client;
  db: GymDB;
  log?: Logger;
  batchSize?: number;
}

export function createOutbox({ client, db, log, batchSize = 200 }: OutboxDeps) {
  let inflight: Promise<DrainResult> | null = null;

  async function drainTable(table: SyncTable): Promise<{ pushed: number; failed: number }> {
    let pushed = 0;
    let failed = 0;
    while (true) {
      const batch = await loadPending(db, table, batchSize);
      if (batch.length === 0) break;
      const payload = batch.map(toPayload);
      const { error } = await (client.from(table) as ReturnType<Client["from"]>).upsert(
        payload as never,
        { onConflict: PK_BY_TABLE[table] },
      );
      if (error) {
        log?.(`outbox: ${table} batch failed`, error.message);
        for (const row of batch) {
          await markError(db, table, row, error.message);
          failed += 1;
        }
        break;
      }
      await markSynced(db, table, batch);
      pushed += batch.length;
      if (batch.length < batchSize) break;
    }
    return { pushed, failed };
  }

  async function doDrain(): Promise<DrainResult> {
    let pushed = 0;
    let failed = 0;
    for (const table of SYNC_TABLES) {
      const r = await drainTable(table);
      pushed += r.pushed;
      failed += r.failed;
    }
    return { pushed, failed };
  }

  function drain(): Promise<DrainResult> {
    if (!inflight) {
      inflight = doDrain().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  async function pendingCount(): Promise<number> {
    const counts = await Promise.all(
      SYNC_TABLES.map((t) =>
        db.table(DEXIE_TABLE[t]).where("sync_status").equals("pending").count(),
      ),
    );
    return counts.reduce((a, b) => a + b, 0);
  }

  return { drain, pendingCount };
}

export type Outbox = ReturnType<typeof createOutbox>;
