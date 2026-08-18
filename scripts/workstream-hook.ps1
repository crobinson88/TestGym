# Claude Code hook -> Workstream Command Center (native Windows / PowerShell).
#
# PowerShell port of workstream-hook.sh, for running `claude` directly in
# PowerShell rather than WSL or Git Bash. No curl or jq needed — Invoke-RestMethod
# and ConvertFrom-Json are built in.
#
# Wired into %USERPROFILE%\.claude\settings.json on SessionStart / Notification /
# Stop / SessionEnd (see README). Claude Code pipes the hook payload as JSON on
# stdin; this maps it to a `workstreams` row and posts it to Supabase.
#
# Never fails a CLI turn: everything is wrapped in try/catch and the script always
# exits 0. Unlike the bash version this call is synchronous (PowerShell background
# jobs cost more to start than the request itself), so it adds roughly 100-300ms
# per hook fire, capped at 5s by the timeout.
#
# Setup:
#   Copy-Item scripts\workstream-hook.ps1 "$HOME\.claude\workstream-hook.ps1"
#   then create "$HOME\.claude\workstream.env" with SUPABASE_URL and
#   SUPABASE_SERVICE_ROLE_KEY (see README).

$ErrorActionPreference = 'Stop'

# Set WORKSTREAM_DEBUG=1 to surface errors instead of swallowing them.
$debug = $env:WORKSTREAM_DEBUG -eq '1'

try {
    # Two different callers, two different stdin. Claude Code spawns this as a
    # child process and writes to real stdin ([Console]::In); a human testing it
    # with `'...' | & hook.ps1` sends the text down the PowerShell pipeline
    # ($input) and leaves [Console]::In attached to the console, where
    # ReadToEnd() blocks or returns nothing. Read whichever one has the payload.
    $raw = (@($input) | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) { $raw = [Console]::In.ReadToEnd() }
    if ([string]::IsNullOrWhiteSpace($raw)) { if ($debug) { Write-Host "no stdin payload" }; exit 0 }
    if ($debug) { Write-Host "payload: $raw" }
    $payload = $raw | ConvertFrom-Json

    $envFile = if ($env:WORKSTREAM_ENV_FILE) { $env:WORKSTREAM_ENV_FILE }
               else { Join-Path $HOME '.claude\workstream.env' }
    if (-not (Test-Path $envFile)) { if ($debug) { Write-Host "no env file at $envFile" }; exit 0 }

    $cfg = @{}
    foreach ($line in (Get-Content $envFile)) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $cfg[$matches[1]] = $matches[2].Trim()
        }
    }
    $supabaseUrl = $cfg['SUPABASE_URL']
    $serviceKey  = $cfg['SUPABASE_SERVICE_ROLE_KEY']
    if (-not $supabaseUrl -or -not $serviceKey) { if ($debug) { Write-Host "env file missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }; exit 0 }

    $session = $payload.session_id
    if (-not $session) { if ($debug) { Write-Host "payload has no session_id" }; exit 0 }

    $cwd = if ($payload.cwd) { $payload.cwd } else { (Get-Location).Path }

    # SessionEnd counts as completed too: a session that ends without a Stop
    # (crash, Ctrl-C, closed window) would otherwise sit on the board as
    # "running" until the 30-minute stale window catches it.
    switch ($payload.hook_event_name) {
        'SessionStart' { $status = 'in_progress';  $action = 'Session started' }
        'Notification' { $status = 'waiting_input'
                         $action = if ($payload.message) { $payload.message } else { 'Waiting for your input' } }
        'Stop'         { $status = 'completed';    $action = 'Turn finished' }
        'SessionEnd'   { $status = 'completed';    $action = 'Session ended' }
        default        { $status = 'in_progress'
                         $action = if ($payload.message) { $payload.message } else { [string]$payload.hook_event_name } }
    }

    $project = Split-Path $cwd -Leaf
    $branch = ''
    try {
        $branch = (& git -C $cwd rev-parse --abbrev-ref HEAD 2>$null)
        if ($branch) { $branch = ([string]$branch).Trim() }
    } catch {
        $branch = ''
    }
    $title = if ($branch) { "$project ($branch)" } else { $project }

    $body = @{
        p_type        = 'code_cli'
        p_source_id   = $session
        p_title       = $title
        p_status      = $status
        p_last_action = $action
        p_metadata    = @{ cwd = $cwd; branch = $branch }
    } | ConvertTo-Json -Depth 5 -Compress

    # Windows PowerShell 5.1 can still default to TLS 1.0, which Supabase rejects.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # -UserAgent is not optional. PowerShell's default UA starts with
    # "Mozilla/5.0 (Windows NT ...)", and Supabase refuses an sb_secret_ key on
    # any request whose UA looks like a browser ("Forbidden use of secret API key
    # in browser"). Identify as a script and the same request succeeds.
    Invoke-RestMethod -Method Post `
        -Uri "$supabaseUrl/rest/v1/rpc/workstream_upsert" `
        -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } `
        -ContentType 'application/json' `
        -UserAgent 'workstream-hook/1.0' `
        -Body $body `
        -TimeoutSec 5 | Out-Null

    if ($debug) { Write-Host "posted ok: $title / $status" }
} catch {
    # Swallow everything. A hook must never break a CLI turn.
    if ($debug) { Write-Host "FAILED: $($_.Exception.Message)" }
}

exit 0
