import { v4 as uuid } from "uuid";
import type {
  GymDB,
  LocalCardioSession,
  LocalCategory,
  LocalExercise,
  LocalForecast,
  LocalSet,
  LocalShareTrade,
  LocalStock,
} from "../db";
import type {
  CardioSessionRow,
  CategoryRow,
  ExerciseRow,
  ForecastRow,
  SetRow,
  ShareTradeRow,
  StockRow,
  TradeCurrency,
  TradeModel,
  TradeSide,
  WeightUnit,
} from "../database.types";
import { todayIsoDate } from "../utils";

export interface AddSetInput {
  exercise_id: string;
  category_id: string;
  weight: number;
  reps: number;
  weight_unit?: WeightUnit;
  performed_at?: string;
  target_weight?: number | null;
  target_reps?: number | null;
  notes?: string | null;
}

export interface AddExerciseInput {
  name: string;
  category_id: string;
}

export interface AddCategoryInput {
  name: string;
  sort_order?: number;
}

export interface AddCardioSessionInput {
  activity_id: string;
  minutes: number;
  performed_at?: string;
  distance?: number | null;
  notes?: string | null;
}

export interface AddShareTradeInput {
  ticker: string;
  side: TradeSide;
  quantity: number;
  price: number;
  currency?: TradeCurrency;
  traded_at?: string;
  notes?: string | null;
  target_price?: number | null;
  target_date?: string | null;
  links?: string[];
  images?: string[];
  models?: TradeModel[];
}

export type UpdateShareTradeInput = Partial<AddShareTradeInput>;

export interface AddForecastInput {
  ticker: string;
  base_price: number;
  target_price: number;
  target_date: string;
  made_on?: string;
  currency?: TradeCurrency;
  notes?: string | null;
}

const nowIso = () => new Date().toISOString();

const baseRowDefaults = (now: string) => ({
  created_at: now,
  updated_at: now,
  deleted_at: null,
});

function pendingSet(row: SetRow): LocalSet {
  return { ...row, sync_status: "pending", sync_attempts: 0, sync_last_error: null };
}

function pendingExercise(row: ExerciseRow): LocalExercise {
  return { ...row, sync_status: "pending" };
}

function pendingCategory(row: CategoryRow): LocalCategory {
  return { ...row, sync_status: "pending" };
}

function pendingCardio(row: CardioSessionRow): LocalCardioSession {
  return { ...row, sync_status: "pending", sync_attempts: 0, sync_last_error: null };
}

function pendingShareTrade(row: ShareTradeRow): LocalShareTrade {
  return { ...row, sync_status: "pending", sync_attempts: 0, sync_last_error: null };
}

function pendingStock(row: StockRow): LocalStock {
  return { ...row, sync_status: "pending" };
}

function pendingForecast(row: ForecastRow): LocalForecast {
  return { ...row, sync_status: "pending" };
}

const normaliseTicker = (t: string) => t.trim().toUpperCase();

export interface MutationDeps {
  db: GymDB;
  now?: () => string;
  onChange?: () => void;
}

export function createMutations({ db, now = nowIso, onChange }: MutationDeps) {
  const notify = () => onChange?.();

  async function addSet(input: AddSetInput): Promise<LocalSet> {
    const id = uuid();
    const ts = now();
    const row: SetRow = {
      id,
      exercise_id: input.exercise_id,
      category_id: input.category_id,
      weight: input.weight,
      reps: input.reps,
      weight_unit: input.weight_unit ?? "lbs",
      performed_at: input.performed_at ?? todayIsoDate(),
      target_weight: input.target_weight ?? null,
      target_reps: input.target_reps ?? null,
      notes: input.notes ?? null,
      volume: null,
      client_id: id,
      user_id: null,
      ...baseRowDefaults(ts),
    };
    const local = pendingSet(row);
    await db.sets.put(local);
    notify();
    return local;
  }

  async function updateSet(
    id: string,
    patch: Partial<AddSetInput>,
  ): Promise<LocalSet | null> {
    const existing = await db.sets.get(id);
    if (!existing) return null;
    const ts = now();
    const updated: LocalSet = {
      ...existing,
      ...patch,
      updated_at: ts,
      sync_status: "pending",
      sync_attempts: 0,
      sync_last_error: null,
    };
    await db.sets.put(updated);
    notify();
    return updated;
  }

  async function deleteSet(id: string): Promise<void> {
    const existing = await db.sets.get(id);
    if (!existing || existing.deleted_at) return;
    const ts = now();
    const updated: LocalSet = {
      ...existing,
      deleted_at: ts,
      updated_at: ts,
      sync_status: "pending",
      sync_attempts: 0,
      sync_last_error: null,
    };
    await db.sets.put(updated);
    notify();
  }

  async function addExercise(input: AddExerciseInput): Promise<LocalExercise> {
    const id = uuid();
    const ts = now();
    const row: ExerciseRow = {
      id,
      name: input.name,
      category_id: input.category_id,
      is_archived: false,
      ...baseRowDefaults(ts),
    };
    const local = pendingExercise(row);
    await db.exercises.put(local);
    notify();
    return local;
  }

  async function setExerciseActive(
    id: string,
    active: boolean,
  ): Promise<LocalExercise | null> {
    const existing = await db.exercises.get(id);
    if (!existing) return null;
    const ts = now();
    const updated: LocalExercise = {
      ...existing,
      is_archived: !active,
      updated_at: ts,
      sync_status: "pending",
    };
    await db.exercises.put(updated);
    notify();
    return updated;
  }

  async function addCategory(input: AddCategoryInput): Promise<LocalCategory> {
    const id = uuid();
    const ts = now();
    const row: CategoryRow = {
      id,
      name: input.name,
      sort_order: input.sort_order ?? 0,
      ...baseRowDefaults(ts),
    };
    const local = pendingCategory(row);
    await db.categories.put(local);
    notify();
    return local;
  }

  async function addCardioSession(input: AddCardioSessionInput): Promise<LocalCardioSession> {
    const activity = await db.met_activities.get(input.activity_id);
    if (!activity || activity.deleted_at) {
      throw new Error(`unknown activity_id: ${input.activity_id}`);
    }
    const id = uuid();
    const ts = now();
    const row: CardioSessionRow = {
      id,
      activity_id: input.activity_id,
      performed_at: input.performed_at ?? todayIsoDate(),
      minutes: input.minutes,
      distance: input.distance ?? null,
      notes: input.notes ?? null,
      met_value_snapshot: activity.met_value,
      met_minutes: activity.met_value * input.minutes,
      client_id: id,
      user_id: null,
      ...baseRowDefaults(ts),
    };
    const local = pendingCardio(row);
    await db.cardio_sessions.put(local);
    notify();
    return local;
  }

  async function deleteCardioSession(id: string): Promise<void> {
    const existing = await db.cardio_sessions.get(id);
    if (!existing || existing.deleted_at) return;
    const ts = now();
    const updated: LocalCardioSession = {
      ...existing,
      deleted_at: ts,
      updated_at: ts,
      sync_status: "pending",
      sync_attempts: 0,
      sync_last_error: null,
    };
    await db.cardio_sessions.put(updated);
    notify();
  }

  async function addShareTrade(input: AddShareTradeInput): Promise<LocalShareTrade> {
    const id = uuid();
    const ts = now();
    const row: ShareTradeRow = {
      id,
      ticker: input.ticker.trim().toUpperCase(),
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      currency: input.currency ?? "USD",
      traded_at: input.traded_at ?? todayIsoDate(),
      notes: input.notes ?? null,
      target_price: input.target_price ?? null,
      target_date: input.target_date ?? null,
      links: input.links ?? [],
      images: input.images ?? [],
      models: input.models ?? [],
      total: null,
      client_id: id,
      user_id: null,
      ...baseRowDefaults(ts),
    };
    const local = pendingShareTrade(row);
    await db.share_trades.put(local);
    notify();
    return local;
  }

  async function updateShareTrade(
    id: string,
    patch: UpdateShareTradeInput,
  ): Promise<LocalShareTrade | null> {
    const existing = await db.share_trades.get(id);
    if (!existing) return null;
    const ts = now();
    const updated: LocalShareTrade = {
      ...existing,
      ...patch,
      ticker: patch.ticker ? patch.ticker.trim().toUpperCase() : existing.ticker,
      updated_at: ts,
      sync_status: "pending",
      sync_attempts: 0,
      sync_last_error: null,
    };
    await db.share_trades.put(updated);
    notify();
    return updated;
  }

  async function deleteShareTrade(id: string): Promise<void> {
    const existing = await db.share_trades.get(id);
    if (!existing || existing.deleted_at) return;
    const ts = now();
    const updated: LocalShareTrade = {
      ...existing,
      deleted_at: ts,
      updated_at: ts,
      sync_status: "pending",
      sync_attempts: 0,
      sync_last_error: null,
    };
    await db.share_trades.put(updated);
    notify();
  }

  // Stocks are keyed by ticker in the UI but by uuid in the DB. Find the live
  // row for a ticker or create one, so "general notes of the stock" has a home.
  async function ensureStock(ticker: string, name?: string | null): Promise<LocalStock> {
    const t = normaliseTicker(ticker);
    const all = await db.stocks.toArray();
    const existing = all.find((s) => s.ticker === t && !s.deleted_at);
    if (existing) {
      if (name && !existing.name) {
        return (await updateStock(existing.id, { name })) ?? existing;
      }
      return existing;
    }
    const id = uuid();
    const ts = now();
    const row: StockRow = {
      id,
      ticker: t,
      name: name ?? null,
      notes: null,
      links: [],
      documents: [],
      client_id: id,
      user_id: null,
      ...baseRowDefaults(ts),
    };
    const local = pendingStock(row);
    await db.stocks.put(local);
    notify();
    return local;
  }

  async function updateStock(
    id: string,
    patch: Partial<Pick<StockRow, "name" | "notes" | "links" | "documents">>,
  ): Promise<LocalStock | null> {
    const existing = await db.stocks.get(id);
    if (!existing) return null;
    const ts = now();
    const updated: LocalStock = {
      ...existing,
      ...patch,
      updated_at: ts,
      sync_status: "pending",
    };
    await db.stocks.put(updated);
    notify();
    return updated;
  }

  async function addForecast(input: AddForecastInput): Promise<LocalForecast> {
    const id = uuid();
    const ts = now();
    const row: ForecastRow = {
      id,
      ticker: normaliseTicker(input.ticker),
      base_price: input.base_price,
      target_price: input.target_price,
      target_date: input.target_date,
      made_on: input.made_on ?? todayIsoDate(),
      currency: input.currency ?? "USD",
      notes: input.notes ?? null,
      client_id: id,
      user_id: null,
      ...baseRowDefaults(ts),
    };
    const local = pendingForecast(row);
    await db.forecasts.put(local);
    notify();
    return local;
  }

  async function deleteForecast(id: string): Promise<void> {
    const existing = await db.forecasts.get(id);
    if (!existing || existing.deleted_at) return;
    const ts = now();
    await db.forecasts.put({ ...existing, deleted_at: ts, updated_at: ts, sync_status: "pending" });
    notify();
  }

  return {
    addSet,
    updateSet,
    deleteSet,
    addExercise,
    setExerciseActive,
    addCategory,
    addCardioSession,
    deleteCardioSession,
    addShareTrade,
    updateShareTrade,
    deleteShareTrade,
    ensureStock,
    updateStock,
    addForecast,
    deleteForecast,
  };
}

export type Mutations = ReturnType<typeof createMutations>;
