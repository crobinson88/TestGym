export type WeightUnit = "lbs" | "kg";

export interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ExerciseRow {
  id: string;
  name: string;
  category_id: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SetRow {
  id: string;
  exercise_id: string;
  category_id: string;
  weight: number;
  reps: number;
  weight_unit: WeightUnit;
  performed_at: string;
  target_weight: number | null;
  target_reps: number | null;
  notes: string | null;
  volume: number | null;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ConflictRow {
  id: string;
  table_name: string;
  row_id: string;
  local_row: unknown;
  remote_row: unknown;
  resolved_to: "local" | "remote";
  created_at: string;
}

export type MetActivityKind = "cardio" | "lifting";

export interface MetActivityRow {
  id: string;
  name: string;
  met_value: number;
  kind: MetActivityKind;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CardioSessionRow {
  id: string;
  activity_id: string;
  performed_at: string;
  minutes: number;
  distance: number | null;
  notes: string | null;
  met_value_snapshot: number;
  met_minutes: number | null;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Categories are user-managed rows (see tdl_categories); a section is just the
// category `key` an item belongs to. The strings below are the seeded defaults;
// `(string & {})` keeps the literals as autocomplete hints while allowing any
// user-created key.
export type TdlSection =
  | "weekly_goals"
  | "follow_ups"
  | "product"
  | "tgm_tasks"
  | "meeting_action_items"
  | "personal_other"
  | (string & {});

export interface TdlCategoryRow {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  has_due_date: boolean;
  has_time_estimate: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TdlStatus =
  | "open"
  | "worked_today"
  | "ready_for_testing"
  | "done"
  | "cancelled";

export interface TdlItemRow {
  id: string;
  snapshot_date: string;
  section: TdlSection;
  is_recurring: boolean;
  position: number;
  title: string;
  due_date: string | null;
  time_estimate_min: number | null;
  status: TdlStatus;
  is_priority: boolean;
  is_archived: boolean;
  snoozed_until: string | null;
  notes: string | null;
  origin_item_id: string | null;
  origin_snapshot_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TdlDayRow {
  snapshot_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TimeTaskRow {
  id: string;
  name: string;
  color: string;
  is_work: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TimeAllocationRow {
  id: string;
  date: string;
  slot: number;
  task_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TradeSide = "buy" | "sell";
export type TradeCurrency = "USD" | "GBP" | "EUR" | "AUD";

export interface StockDocument {
  path: string;
  name: string;
  mediaType: string;
}

export interface StockRow {
  id: string;
  ticker: string;
  name: string | null;
  notes: string | null;
  links: string[];
  documents: StockDocument[];
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ShareTradeRow {
  id: string;
  ticker: string;
  side: TradeSide;
  quantity: number;
  price: number;
  currency: TradeCurrency;
  traded_at: string;
  notes: string | null;
  links: string[];
  images: string[];
  total: number | null;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: CategoryRow;
        Insert: Partial<CategoryRow> & { id: string; name: string };
        Update: Partial<CategoryRow>;
      };
      exercises: {
        Row: ExerciseRow;
        Insert: Partial<ExerciseRow> & {
          id: string;
          name: string;
          category_id: string;
        };
        Update: Partial<ExerciseRow>;
      };
      sets: {
        Row: SetRow;
        Insert: Omit<SetRow, "volume" | "created_at" | "user_id"> & {
          created_at?: string;
          user_id?: string | null;
        };
        Update: Partial<Omit<SetRow, "volume">>;
      };
      conflicts: {
        Row: ConflictRow;
        Insert: Partial<ConflictRow> &
          Pick<ConflictRow, "table_name" | "row_id" | "local_row" | "remote_row" | "resolved_to">;
        Update: Partial<ConflictRow>;
      };
      met_activities: {
        Row: MetActivityRow;
        Insert: Partial<MetActivityRow> &
          Pick<MetActivityRow, "id" | "name" | "met_value" | "kind">;
        Update: Partial<MetActivityRow>;
      };
      cardio_sessions: {
        Row: CardioSessionRow;
        Insert: Omit<CardioSessionRow, "met_minutes" | "created_at" | "user_id"> & {
          created_at?: string;
          user_id?: string | null;
        };
        Update: Partial<Omit<CardioSessionRow, "met_minutes">>;
      };
      tdl_items: {
        Row: TdlItemRow;
        Insert: Partial<TdlItemRow> & {
          id: string;
          snapshot_date: string;
          section: TdlSection;
          title: string;
        };
        Update: Partial<TdlItemRow>;
      };
      tdl_days: {
        Row: TdlDayRow;
        Insert: Partial<TdlDayRow> & { snapshot_date: string };
        Update: Partial<TdlDayRow>;
      };
      tdl_categories: {
        Row: TdlCategoryRow;
        Insert: Partial<TdlCategoryRow> & { id: string; key: string; label: string };
        Update: Partial<TdlCategoryRow>;
      };
      time_tasks: {
        Row: TimeTaskRow;
        Insert: Partial<TimeTaskRow> & { id: string; name: string; color: string };
        Update: Partial<TimeTaskRow>;
      };
      time_allocations: {
        Row: TimeAllocationRow;
        Insert: Partial<TimeAllocationRow> & {
          id: string;
          date: string;
          slot: number;
          task_id: string;
        };
        Update: Partial<TimeAllocationRow>;
      };
      share_trades: {
        Row: ShareTradeRow;
        Insert: Omit<ShareTradeRow, "total" | "created_at" | "user_id"> & {
          created_at?: string;
          user_id?: string | null;
        };
        Update: Partial<Omit<ShareTradeRow, "total">>;
      };
      stocks: {
        Row: StockRow;
        Insert: Omit<StockRow, "created_at" | "user_id"> & {
          created_at?: string;
          user_id?: string | null;
        };
        Update: Partial<StockRow>;
      };
    };
  };
};
