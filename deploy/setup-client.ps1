# ============================================================
# MAGBO Access Control — Client Terminal Setup (Windows 10/11)
# ============================================================
# Usage: Run as Administrator in PowerShell
#
#   .\setup-client.ps1 -Sector "BIBLIO" -ApiUrl "http://192.168.10.10:8080"
#
# Parameters:
#   -Sector   : Sector ID (PORT1, PORT2, PORT3, BIBLIO, ENFERM, REFEI1, REFEI2)
#   -ApiUrl   : Backend URL (e.g., http://magbo-access.local:8080)
#   -KioskPin : KEPT FOR CALL COMPATIBILITY, HAS NO EFFECT. There is no code
#               exit from kiosk mode at all - see step 4 at the end of this
#               script. Measured 2026-09-03.
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("PORT1","PORT2","PORT3","BIBLIO","ENFERM","REFEI1","REFEI2")]
    [string]$Sector,

    [Parameter(Mandatory=$true)]
    [string]$ApiUrl,

    [string]$KioskPin = "1234",

    [string]$InstallerPath = ".\MAGBO-Access-Control-Setup-2.1.0.exe"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  MAGBO Access Control — Client Setup"       -ForegroundColor Cyan
Write-Host "  Sector: $Sector"                           -ForegroundColor Yellow
Write-Host "  API:    $ApiUrl"                           -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ─── 1. Set Environment Variables (Machine level) ───
Write-Host "[1/5] Setting environment variables..." -ForegroundColor Green

[Environment]::SetEnvironmentVariable("MAGBO_API_URL", $ApiUrl, "Machine")
[Environment]::SetEnvironmentVariable("MAGBO_SECTOR", $Sector, "Machine")
# MAGBO_KIOSK_PIN IS NO LONGER SET, AND THAT IS DELIBERATE.
# Nothing on the interface side reads it. `preload.js:112-123` does expose
# verifyKioskPin / exitKiosk / onRequestAdminPin, but NO file under `js/` and
# not `index.html` ever calls them (measured 2026-09-03: `grep -rn magboIpc`
# over the repository returns preload.js and three documents, nothing else).
# Its only consumer is the orphan handler at main.js:394. Setting it made
# every installer believe in a PIN-protected exit that does not exist - and
# the summary block a few lines further down used to echo that PIN in clear
# text into the install console, i.e. into the PowerShell history and into
# every screenshot of the installation. That echo is gone too.
[Environment]::SetEnvironmentVariable("NODE_ENV", "production", "Machine")

Write-Host "  MAGBO_API_URL  = $ApiUrl"
Write-Host "  MAGBO_SECTOR   = $Sector"
Write-Host "  NODE_ENV       = production"

# ─── 2. Run Installer (if available) ───
Write-Host ""
Write-Host "[2/5] Installing application..." -ForegroundColor Green

if (Test-Path $InstallerPath) {
    Write-Host "  Running installer: $InstallerPath"
    Start-Process -FilePath $InstallerPath -ArgumentList "/S" -Wait
    Write-Host "  ✅ Installation complete."
} else {
    Write-Host "  ⚠️  Installer not found at: $InstallerPath" -ForegroundColor Yellow
    Write-Host "  Install manually, then re-run steps 3-5." -ForegroundColor Yellow
}

# ─── 3. Configure Auto-Start (Scheduled Task) ───
Write-Host ""
Write-Host "[3/5] Configuring auto-start on login..." -ForegroundColor Green

$appPath = "C:\Program Files\MAGBO Access Control\MAGBO Access Control.exe"
$taskName = "MAGBO Access Control"

# Remove existing task if present
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $appPath
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "MAGBO Access Control — Auto-start kiosk ($Sector)" | Out-Null

Write-Host "  ✅ Scheduled task '$taskName' created."

# ─── 4. Test Connectivity ───
Write-Host ""
Write-Host "[4/5] Testing connectivity to backend..." -ForegroundColor Green

try {
    $uri = [System.Uri]$ApiUrl
    $result = Test-NetConnection -ComputerName $uri.Host -Port $uri.Port -WarningAction SilentlyContinue
    
    if ($result.TcpTestSucceeded) {
        Write-Host "  ✅ TCP connection to $($uri.Host):$($uri.Port) succeeded." -ForegroundColor Green
    } else {
        Write-Host "  ❌ TCP connection to $($uri.Host):$($uri.Port) FAILED." -ForegroundColor Red
        Write-Host "  Check: Is the server running? Is the firewall open?" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Could not parse URL or test connection: $_" -ForegroundColor Red
}

# Test health endpoint
try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/api/health" -TimeoutSec 5
    Write-Host "  ✅ Health check: status=$($health.status), database=$($health.database)" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  Health endpoint not reachable (server may be starting)" -ForegroundColor Yellow
}

# ─── 5. Summary ───
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ✅ Client Setup Complete!"                  -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Sector:     $Sector"
Write-Host "  Backend:    $ApiUrl"
Write-Host "  Auto-start: Enabled (on login)"
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1. Restart the computer"
Write-Host "    2. Verify the app opens in fullscreen"
Write-Host "    3. Test Alt+F4 (should be blocked)"
Write-Host "    4. WARNING - there is NO code exit from kiosk mode." -ForegroundColor Yellow
Write-Host "       Ctrl+Shift+Alt+Q does nothing: the shortcut is registered" -ForegroundColor Yellow
Write-Host "       (main.js:383) but no screen listens, and a webContents.send" -ForegroundColor Yellow
Write-Host "       to a channel with no listener is a SILENT no-op." -ForegroundColor Yellow
Write-Host "       To close a locked terminal: Ctrl+Alt+Del -> Task Manager ->" -ForegroundColor Yellow
Write-Host "       MAGBO Access Control -> End task. Measured 2026-09-03." -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
