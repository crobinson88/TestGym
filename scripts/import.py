#!/usr/bin/env python3
"""Placeholder for re-importing rows from the spreadsheet.

The 1,456 historical sets are already loaded. This script exists so future
imports go through the same code path. Call `public.bulk_load_sets(payload jsonb)`
via PostgREST RPC; it's idempotent on (exercise_id, performed_at, weight, reps).

Each payload element:
  {
    "category": "Back",
    "exercise": "Wide Grip Cable Lat Pull Down",
    "performed_at": "2026-04-28",
    "weight": 225,
    "reps": 10,
    "target_weight": 240,   # optional
    "target_reps": 15        # optional
  }

Not wired by default. Implement when needed.
"""

raise SystemExit(
    "scripts/import.py is a placeholder. Implement when the spreadsheet "
    "gains rows the app didn't generate."
)
