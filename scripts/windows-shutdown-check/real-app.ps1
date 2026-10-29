# TEMP (#97): runs the packaged app (win-unpacked) on a test chain and checks
# that geth stops cleanly when the app quits (main window closed) and when the
# main process is killed (the watcher stops geth). Verdicts from geth.log:
# "Got interrupt" after a quit, and no "Unclean shutdown detected" on the start
# after each stop.
# usage: real-app.ps1 <CointMU.exe> <deadEnodePubkey> <evidenceDir>
param([string]$AppExe, [string]$EnodeKey, [string]$Evidence)
$ErrorActionPreference = "Stop"
$env:GETH_NETWORK_ID = "19129"
$userData = Join-Path $env:APPDATA "CointMU"
$gethLog = Join-Path $userData "logs\geth.log"
New-Item -ItemType Directory -Force $userData, $Evidence | Out-Null
$config = @{ network = @{ bootnodes = @("enode://$EnodeKey@127.0.0.1:30399") } }
$config | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8NoBOM (Join-Path $userData "config.json")

function LogText { if (Test-Path $gethLog) { Get-Content -Raw $gethLog } else { "" } }
function Since([int]$from) { $t = LogText; if ($t.Length -gt $from) { $t.Substring($from) } else { "" } }
function Count([string]$text, [string]$what) { ([regex]::Matches($text, [regex]::Escape($what))).Count }
function WaitFor([scriptblock]$cond, [string]$what, [int]$seconds = 180) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while (-not (& $cond)) {
    if ((Get-Date) -gt $deadline) { throw "timed out: $what" }
    Start-Sleep -Milliseconds 250
  }
}
function GethRunning { [bool](Get-Process geth -ErrorAction SilentlyContinue) }
function StartApp {
  $from = (LogText).Length
  $app = Start-Process $AppExe -PassThru
  WaitFor { (Since $from) -match "Started P2P networking" } "geth ready"
  return @{ App = $app; From = $from }
}
function QuitApp($run) {
  $app = $run.App
  WaitFor { $app.Refresh(); $app.MainWindowHandle -ne 0 } "main window"
  $started = Get-Date
  [void]$app.CloseMainWindow()
  WaitFor { $app.HasExited -and -not (GethRunning) } "app and geth to exit" 60
  return [int]((Get-Date) - $started).TotalMilliseconds
}

Add-Type -Namespace W -Name J -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool IsProcessInJob(IntPtr p, IntPtr j, out bool r);'
function InJob($p) { $r = $false; [void][W.J]::IsProcessInJob($p.Handle, [IntPtr]::Zero, [ref]$r); $r }
function Supervisor { Get-Process geth-supervisor -ErrorAction SilentlyContinue | Select-Object -First 1 }

$results = @()

$a = StartApp
$quitMs = QuitApp $a
$quitLog = Since $a.From
$b = StartApp
$results += @{ scenario = "quit (CloseMainWindow)"; interrupted = (Count $quitLog "Got interrupt, shutting down") -gt 0;
  uncleanOnNextStart = Count (Since $b.From) "Unclean shutdown detected"; stopMs = $quitMs }

# Info only: the runner puts every process in a job of its own.
$jobs = @{ main = InJob $b.App; supervisor = InJob (Supervisor); geth = InJob (Get-Process geth) }
$started = Get-Date
Stop-Process -Id $b.App.Id -Force
WaitFor { -not (GethRunning) } "geth to exit after the main process was killed" 60
$killMs = [int]((Get-Date) - $started).TotalMilliseconds
$c = StartApp
# The main process wrote geth's log, so the shutdown lines after its death
# are lost; the next start is the verdict.
$results += @{ scenario = "main process killed (watcher)"; interrupted = $null;
  uncleanOnNextStart = Count (Since $c.From) "Unclean shutdown detected"; stopMs = $killMs }
# Measured only: a tree kill terminates geth itself.
$started = Get-Date
taskkill /T /F /PID $c.App.Id | Out-Null
WaitFor { -not (GethRunning) -and -not (Supervisor) } "geth to exit after the tree kill" 60
$treeMs = [int]((Get-Date) - $started).TotalMilliseconds
$d = StartApp
$results += @{ scenario = "main process tree killed (measured only)"; interrupted = $null;
  uncleanOnNextStart = Count (Since $d.From) "Unclean shutdown detected"; stopMs = $treeMs }
[void](QuitApp $d)

$all = LogText
$peers = [regex]::Matches($all, "peercount=(\d+)") | ForEach-Object { [int]$_.Groups[1].Value }
$maxPeers = ($peers | Measure-Object -Maximum).Maximum
Copy-Item $gethLog, (Join-Path $userData "logs\main.log") $Evidence -ErrorAction SilentlyContinue
@{ results = $results; maxPeerCount = $maxPeers; inJob = $jobs } | ConvertTo-Json -Depth 4 | Tee-Object (Join-Path $Evidence "real-app.json")

if ($maxPeers -gt 0) { throw "geth found peers" }
if ($results[0].interrupted -ne $true) { throw "quit: no interrupt in geth.log" }
foreach ($r in $results[0..1]) { if ($r.uncleanOnNextStart -ne 0) { throw "$($r.scenario): unclean shutdown" } }
