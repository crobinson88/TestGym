import { afterEach, describe, expect, it } from "vitest";
import type { GymDB } from "../db";
import { createOutbox } from "./outbox";
import { mergeRemote } from "./realtime";
import {
  makeMockClient,
  makeTimeAllocation,
  makeTimeTask,
  newTestDb,
} from "./test-helpers";

let db: GymDB;
afterEach(async () => {
  if (db) await db.delete();
});

describe("time tracking sync wiring", () => {
  it("drains pending time tasks and allocations to supabase", async () => {
    db = await newTestDb();
    const task = makeTimeTask();
    await db.timeTasks.put({ ...task, sync_status: "pending" });
    await db.timeAllocations.put({
      ...makeTimeAllocation(task.id),
      sync_status: "pending",
    });

    const { client, calls } = makeMockClient();
    const outbox = createOutbox({ client: client as never, db });

    const result = await outbox.drain();
    expect(result.pushed).toBe(2);
    expect(result.failed).toBe(0);

    const taskCall = calls.find((c) => c.table === "time_tasks");
    const allocCall = calls.find((c) => c.table === "time_allocations");
    expect(taskCall?.payload).toHaveLength(1);
    expect(allocCall?.payload).toHaveLength(1);
    // server-owned / local-only fields are stripped before upsert
    expect((taskCall?.payload[0] as Record<string, unknown>).sync_status).toBeUndefined();
    expect((taskCall?.payload[0] as Record<string, unknown>).created_at).toBeUndefined();
    expect((allocCall?.payload[0] as Record<string, unknown>).sync_status).toBeUndefined();

    expect(await db.timeTasks.where("sync_status").equals("pending").count()).toBe(0);
    expect(await db.timeAllocations.where("sync_status").equals("pending").count()).toBe(0);
    expect(await db.timeTasks.where("sync_status").equals("synced").count()).toBe(1);
    expect(await db.timeAllocations.where("sync_status").equals("synced").count()).toBe(1);
  });

  it("merges a remote time allocation into the camelCase Dexie store", async () => {
    db = await newTestDb();
    const task = makeTimeTask();
    const alloc = makeTimeAllocation(task.id);

    const r = await mergeRemote(db, "time_allocations", alloc);
    expect(r.applied).toBe(true);
    const stored = await db.timeAllocations.get(alloc.id);
    expect(stored?.sync_status).toBe("synced");
    expect(stored?.task_id).toBe(task.id);
  });

  it("propagates a remote soft-delete via LWW", async () => {
    db = await newTestDb();
    const task = makeTimeTask();
    const alloc = makeTimeAllocation(task.id, { updated_at: "2026-05-19T12:00:00.000Z" });
    await db.timeAllocations.put({ ...alloc, sync_status: "synced" });

    const remote = {
      ...alloc,
      updated_at: "2026-05-19T12:05:00.000Z",
      deleted_at: "2026-05-19T12:05:00.000Z",
    };
    const r = await mergeRemote(db, "time_allocations", remote);
    expect(r.applied).toBe(true);
    expect((await db.timeAllocations.get(alloc.id))?.deleted_at).not.toBeNull();
  });
});
