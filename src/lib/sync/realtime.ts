import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { GymDB } from "../db";
import type {
  CategoryRow,
  ExerciseRow,
  SetRow,
} from "../database.types";
import type { Client, Logger, SyncTable } from "./types";
import { SYNC_TABLES } from "./types";

type AnyRow = SetRow | ExerciseRow | CategoryRow;

export interface MergeResult {
  applied: boolean;
  reason: "applied" | "skipped-equal" | "skipped-stale" | "deleted";
}

export async function mergeRemote(
  db: GymDB,
  table: SyncTable,
  remote: AnyRow,
): Promise<MergeResult> {
  const t = db.table(table);
  const local = (await t.get(remote.id)) as AnyRow | undefined;

  if (!local) {
    await t.put({ ...remote, sync_status: "synced" });
    return { applied: true, reason: "applied" };
  }

  if (remote.updated_at === local.updated_at) {
    return { applied: false, reason: "skipped-equal" };
  }

  if (remote.updated_at > local.updated_at) {
    await t.put({ ...remote, sync_status: "synced" });
    return { applied: true, reason: "applied" };
  }

  await db.conflicts.add({
    id: crypto.randomUUID(),
    table_name: table,
    row_id: remote.id,
    local_row: local,
    remote_row: remote,
    resolved_to: "local",
    created_at: new Date().toISOString(),
  });
  return { applied: false, reason: "skipped-stale" };
}

export interface RealtimeDeps {
  client: Client;
  db: GymDB;
  log?: Logger;
}

export function createRealtime({ client, db, log }: RealtimeDeps) {
  const channels: RealtimeChannel[] = [];

  function start(onApplied?: (table: SyncTable) => void) {
    for (const table of SYNC_TABLES) {
      const ch = client
        .channel(`sync:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          (payload: RealtimePostgresChangesPayload<AnyRow>) => {
            const next =
              payload.eventType === "DELETE" ? (payload.old as AnyRow) : (payload.new as AnyRow);
            if (!next || !next.id) return;
            if (payload.eventType === "DELETE") {
              void db
                .table(table)
                .delete(next.id)
                .then(() => onApplied?.(table));
              return;
            }
            void mergeRemote(db, table, next).then((r) => {
              if (r.applied) onApplied?.(table);
            });
          },
        )
        .subscribe((status) => {
          log?.(`realtime ${table}: ${status}`);
        });
      channels.push(ch);
    }
  }

  async function stop() {
    await Promise.all(channels.map((ch) => client.removeChannel(ch)));
    channels.length = 0;
  }

  return { start, stop };
}

export type Realtime = ReturnType<typeof createRealtime>;
