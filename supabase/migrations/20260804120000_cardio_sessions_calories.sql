-- Cardio sessions: let the user log the calories burned directly (e.g. the
-- readout off a treadmill or watch) alongside time and distance. Nullable —
-- when null the food-diary balance falls back to the MET-based estimate
-- (met_minutes × body-weight-kg × 0.0175). When set, that logged value is the
-- exercise burn used in the daily energy balance.
alter table public.cardio_sessions
  add column calories integer check (calories is null or calories >= 0);
