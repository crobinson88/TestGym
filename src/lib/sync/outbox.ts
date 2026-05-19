import type { GymDB, LocalSet, LocalExercise, LocalCategory } from "../db";
import type { Client, DrainResult, Logger, SyncTable } from "./types";
import { SYNC_TABLES } from "./types";

const STRIP_KEYS = [
  "sync_status",
  "sync_attempts",
  "sync_last_error",
  "volume",
  "created_at",
  "user_id",
] as const;

function toPayload(row: LocalSet | LocalExercise | LocalCategory): Record<string, unknown> {
  const copy = { ...row } as Record<string, unknown>;
  for (const k of STRIP_KEYS) delete copy[k];
  return copy;
}

async function loadPending(db: GymDB, table: SyncTable, limit: number) {
  if (table === "sets") {
    return db.sets.where("sync_status").equals("pending").limit(limit).toArray();
  }
  if (table === "exercises") {
    return db.exercises.where("sync_status").equals("pending").limit(limit).toArray();
  }
  return db.categories.where("sync_status").equals("pending").limit(limit).toArray();
}

async function markSynced(
  db: GymDB,
  table: SyncTable,
  rows: ReadonlyArray<LocalSet | LocalExercise | LocalCategory>,
) {
  const ids = rows.map((r) => r.id);
  await db.table(table).where("id").anyOf(ids).modify({
    sync_status: "synced",
    sync_attempts: 0,
    sync_last_error: null,
  });
}

async function markError(
  db: GymDB,
  table: SyncTable,
  row: LocalSet | LocalExercise | LocalCategory,
  message: string,
) {
  if (table === "sets") {
    await db.sets.update(row.id, {
      sync_status: "error",
      sync_attempts: (row as LocalSet).sync_attempts + 1,
      sync_last_error: message,
    });
  } else {
    await db.table(table).update(row.id, {
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
      const payload = (batch as Array<LocalSet | LocalExercise | LocalCategory>).map(toPayload);
      const { error } = await (client.from(table) as ReturnType<Client["from"]>).upsert(
        payload as never,
        { onConflict: "id" },
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
        db.table(t).where("sync_status").equals("pending").count(),
      ),
    );
    return counts.reduce((a, b) => a + b, 0);
  }

  return { drain, pendingCount };
}

export type Outbox = ReturnType<typeof createOutbox>;
