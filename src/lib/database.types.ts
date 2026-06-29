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
  // Flags an exercise the user judges ready to move up in weight next session.
  ready_for_increase: boolean;
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
  // Priority rank: 1 (most important) … 10, or null when unranked. Ranks are
  // not unique — several items may share a number. Carried forward day to day.
  priority_rank: number | null;
  is_archived: boolean;
  snoozed_until: string | null;
  // Marks an item we don't want to do but still need to. The reason why lives
  // in `reluctance_reason`, surfaced under the detail panel's description.
  is_reluctant: boolean;
  reluctance_reason: string | null;
  notes: string | null;
  // Object paths in the private `share-images` bucket (tdl/ prefix). The detail
  // panel resolves them to signed URLs on demand.
  images: string[];
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
export type TradeModelKind = "sheet" | "file";

// A financial model attached to a trade: an uploaded spreadsheet (file, stored
// in the share-images bucket) or a linked Google Sheet (sheet).
export interface TradeModel {
  kind: TradeModelKind;
  name: string;
  url: string | null;
  path: string | null;
}

// A highlight or comment placed on a PDF document. Coordinates are normalised
// to [0..1] of the page box with a top-left origin, so they survive re-render at
// any device width. Stored on the document row so annotations are re-editable
// and a flattened copy can be regenerated from the clean base PDF.
export interface DocAnnotation {
  id: string;
  page: number; // 1-based
  type: "highlight" | "comment";
  // Highlighted region; a comment uses the single point in `x`/`y`.
  rect?: { x: number; y: number; w: number; h: number };
  x?: number;
  y?: number;
  color?: string; // hex, highlights only
  text?: string; // comment body
  addedAt: string;
  addedBy: string | null;
}

export interface StockDocument {
  path: string;
  name: string;
  mediaType: string;
  addedAt: string;
  addedBy: string | null;
  // Annotation support (additive — older rows omit these).
  // `path` always points at the clean base PDF; `annotations` is the editable
  // overlay; `flatPath` is a flattened copy with the marks burned in (portable,
  // opens in any viewer). Re-editing re-flattens from the base, never the flat.
  annotations?: DocAnnotation[];
  flatPath?: string;
  // Provenance of an annotated copy: the original library doc path, or
  // `ir:<url>` when the source was a remote investor-relations filing.
  annotatedFrom?: string;
}

export interface StockLink {
  url: string;
  addedAt: string;
  addedBy: string | null;
}

export interface StockRow {
  id: string;
  ticker: string;
  name: string | null;
  notes: string | null;
  links: StockLink[];
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
  target_price: number | null;
  target_date: string | null;
  links: string[];
  images: string[];
  models: TradeModel[];
  // An opening/existing holding recorded after the fact, not a logged buy
  // decision. Rolls into position math but is hidden from the trade log.
  is_opening: boolean;
  total: number | null;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// A standalone price forecast, not tied to a buy/sell. `base_price` is the
// reference price when the call was made; implied CAGR is derived client-side
// from base -> target over made_on -> target_date.
export interface ForecastRow {
  id: string;
  ticker: string;
  base_price: number;
  target_price: number;
  target_date: string;
  made_on: string;
  currency: TradeCurrency;
  notes: string | null;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type FrenchTestKind = "vocab" | "rules" | "conjug";

// One question's outcome inside a completed test, kept so the stats view can
// surface which items were missed without re-deriving them.
export interface FrenchAttemptDetail {
  questionId: string;
  prompt: string;
  correct: boolean;
}

// One completed French test. `correct`/`total` are the score; `details` is the
// per-question breakdown. Same sync / RLS / soft-delete rules as `sets`.
export interface FrenchAttemptRow {
  id: string;
  kind: FrenchTestKind;
  total: number;
  correct: number;
  duration_ms: number | null;
  details: FrenchAttemptDetail[];
  started_at: string;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// An article or podcast saved to read/listen to later. URL + title + a free-text
// description; `is_read` flags it done. Same sync / RLS / soft-delete rules as `sets`.
export interface ReadingItemRow {
  id: string;
  url: string;
  title: string;
  description: string | null;
  is_read: boolean;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TipStatus = "watching" | "dismissed";

// A stock a friend flagged to watch. One row per ticker tip: who sent it, a
// free-text note, when it came in, and whether it's still being watched or
// dismissed. Same sync / RLS / soft-delete rules as `sets`.
export interface TipRow {
  id: string;
  ticker: string;
  tipped_by: string;
  note: string | null;
  status: TipStatus;
  received_at: string;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// The market indices a note can be tagged against. Fixed client-side set (not a
// table) — stored as stable keys in the `indices` jsonb array.
export type MarketIndexKey = "sp500" | "asx200" | "nasdaq";

// A free-text note on the markets, tagged with one or more indices. Same sync /
// RLS / soft-delete rules as `sets`.
export interface MarketNoteRow {
  id: string;
  indices: MarketIndexKey[];
  body: string;
  noted_at: string;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// One day's smoking flag. `smoked` is true on a smoking day, false on a
// smoke-free day; the absence of a live row means the day is unmarked. One live
// row per `log_date` is kept (deduped client-side). Same sync / RLS /
// soft-delete rules as `sets`.
export interface SmokingLogRow {
  id: string;
  log_date: string;
  smoked: boolean;
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
      forecasts: {
        Row: ForecastRow;
        Insert: Omit<ForecastRow, "created_at" | "user_id"> & {
          created_at?: string;
          user_id?: string | null;
        };
        Update: Partial<ForecastRow>;
      };
      french_attempts: {
        Row: FrenchAttemptRow;
        Insert: Omit<FrenchAttemptRow, "created_at" | "user_id"> & {
          created_at?: string;
          user_id?: string | null;
        };
        Update: Partial<FrenchAttemptRow>;
      };
      reading_items: {
        Row: ReadingItemRow;
        Insert: Omit<ReadingItemRow, "created_at" | "user_id"> & {
          created_at?: string;
          user_id?: string | null;
        };
        Update: Partial<ReadingItemRow>;
      };
      tips: {
        Row: TipRow;
        Insert: Omit<TipRow, "created_at" | "user_id"> & {
          created_at?: string;
          user_id?: string | null;
        };
        Update: Partial<TipRow>;
      };
      market_notes: {
        Row: MarketNoteRow;
        Insert: Omit<MarketNoteRow, "created_at" | "user_id"> & {
          created_at?: string;
          user_id?: string | null;
        };
        Update: Partial<MarketNoteRow>;
      };
      smoking_logs: {
        Row: SmokingLogRow;
        Insert: Omit<SmokingLogRow, "created_at" | "user_id"> & {
          created_at?: string;
          user_id?: string | null;
        };
        Update: Partial<SmokingLogRow>;
      };
    };
  };
};
