import type { Mutations } from "./mutations";
import { createMutations } from "./mutations";
import { createOutbox } from "./outbox";
import { createPull } from "./pull";
import { createRealtime } from "./realtime";
import type { Client, SyncDeps, SyncStatusEvent, SyncTable } from "./types";
import type { GymDB } from "../db";

type Listener = (e: SyncStatusEvent) => void;

export interface SyncEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  drain(): Promise<{ pushed: number; failed: number }>;
  pull(): Promise<void>;
  pendingCount(): Promise<number>;
  mutations: Mutations;
  on(listener: Listener): () => void;
  db: GymDB;
  client: Client;
}

export function createSyncEngine(deps: SyncDeps): SyncEngine {
  const { client, db, log } = deps;
  const listeners = new Set<Listener>();
  const emit = (e: SyncStatusEvent) => listeners.forEach((fn) => fn(e));

  const outbox = createOutbox({ client, db, log });
  const pullEngine = createPull({ client, db, log });
  const mutations = createMutations({
    db,
    now: deps.now,
    onChange: () => {
      if (typeof navigator === "undefined" || navigator.onLine) {
        void runDrain();
      }
    },
  });
  const realtime = createRealtime({ client, db, log });

  let running = false;
  let onlineHandler: (() => void) | null = null;

  async function runDrain() {
    const pending = await outbox.pendingCount();
    if (pending === 0) {
      emit({ kind: "idle" });
      return;
    }
    emit({ kind: "pushing", pending });
    try {
      await outbox.drain();
    } catch (err) {
      emit({ kind: "error", message: (err as Error).message });
      return;
    }
    const left = await outbox.pendingCount();
    emit(left === 0 ? { kind: "idle" } : { kind: "pushing", pending: left });
  }

  async function runPull() {
    emit({ kind: "pulling" });
    try {
      await pullEngine.pull();
    } catch (err) {
      emit({ kind: "error", message: (err as Error).message });
      throw err;
    }
    emit({ kind: "idle" });
  }

  async function start() {
    if (running) return;
    running = true;
    realtime.start((_t: SyncTable) => {
      void runDrain();
    });
    await outbox.requeueErrors();
    await runPull();
    await runDrain();
    if (typeof window !== "undefined") {
      onlineHandler = () => void runDrain();
      window.addEventListener("online", onlineHandler);
    }
  }

  async function stop() {
    if (!running) return;
    running = false;
    if (onlineHandler && typeof window !== "undefined") {
      window.removeEventListener("online", onlineHandler);
      onlineHandler = null;
    }
    await realtime.stop();
  }

  return {
    start,
    stop,
    drain: () => outbox.drain(),
    pull: runPull,
    pendingCount: () => outbox.pendingCount(),
    mutations,
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    db,
    client,
  };
}

export type { SyncStatusEvent, Logger } from "./types";
