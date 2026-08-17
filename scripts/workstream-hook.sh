#!/usr/bin/env bash
# Claude Code hook → Workstream Command Center.
#
# Wired into ~/.claude/settings.json on SessionStart / Notification / Stop /
# SessionEnd (see README). Claude Code pipes the hook payload as JSON on stdin;
# this maps it to a `workstreams` row and posts it to Supabase.
#
# Writes straight to PostgREST rather than through a Vercel function: api/ is at
# the Hobby-plan 12-function cap, and a hook that fires on every turn should not
# be paying a cold start. The service-role key already lives on this laptop and
# never leaves it.
#
# Never blocks or fails the CLI: all work happens in a detached subshell and the
# script always exits 0.
#
# Setup:
#   cp scripts/workstream-hook.sh ~/.claude/workstream-hook.sh
#   chmod +x ~/.claude/workstream-hook.sh
#   printf 'SUPABASE_URL=https://rgslyxzeyjiypzilpxpf.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=...\n' > ~/.claude/workstream.env
#   chmod 600 ~/.claude/workstream.env

set -uo pipefail

CONFIG="${WORKSTREAM_ENV_FILE:-$HOME/.claude/workstream.env}"
[ -f "$CONFIG" ] && . "$CONFIG"

: "${SUPABASE_URL:=}"
: "${SUPABASE_SERVICE_ROLE_KEY:=}"

payload="$(cat)"

# Missing config, curl or jq is not an error worth interrupting a session over.
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then exit 0; fi
command -v curl >/dev/null 2>&1 || exit 0
command -v jq   >/dev/null 2>&1 || exit 0

field() { printf '%s' "$payload" | jq -r "$1 // empty" 2>/dev/null; }

event="$(field '.hook_event_name')"
session="$(field '.session_id')"
cwd="$(field '.cwd')"
message="$(field '.message')"

[ -n "$session" ] || exit 0
[ -n "$cwd" ] || cwd="$PWD"

# SessionEnd is treated as completed too: a session that ends without a Stop
# (crash, ctrl-C, closed terminal) would otherwise sit on the board as "running"
# until the 30-minute stale window catches it.
case "$event" in
  SessionStart)  status="in_progress";  action="Session started" ;;
  Notification)  status="waiting_input"; action="${message:-Waiting for your input}" ;;
  Stop)          status="completed";    action="Turn finished" ;;
  SessionEnd)    status="completed";    action="Session ended" ;;
  *)             status="in_progress";  action="${message:-$event}" ;;
esac

project="$(basename "$cwd")"
branch="$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
title="$project"
[ -n "$branch" ] && title="$project ($branch)"

body="$(jq -n \
  --arg type "code_cli" \
  --arg source "$session" \
  --arg title "$title" \
  --arg status "$status" \
  --arg action "$action" \
  --arg cwd "$cwd" \
  --arg branch "${branch:-}" \
  '{p_type:$type, p_source_id:$source, p_title:$title, p_status:$status,
    p_last_action:$action, p_metadata:{cwd:$cwd, branch:$branch}}')"

# Detached + silent: the CLI never waits on the network, and a Supabase blip
# never shows up as hook output.
(
  curl -sS -m 5 -X POST "$SUPABASE_URL/rest/v1/rpc/workstream_upsert" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "$body" >/dev/null 2>&1
) &

exit 0
