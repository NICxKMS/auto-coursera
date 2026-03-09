<#
.SYNOPSIS
    Auto-Coursera Assistant — Windows Browser Extension Policy Uninstaller
.DESCRIPTION
    Removes the Auto-Coursera Assistant extension from the ExtensionInstallForcelist
    registry policy for all Chromium-based browsers (Chrome, Edge, Brave).
.EXAMPLE
    .\uninstall.ps1
.NOTES
    Author: nicx
    Project: Auto-Coursera Assistant
    Website: https://autocr.nicx.app
    Requires: Administrator privileges
#>

[CmdletBinding()]
param()

# ── Configuration ─────────────────────────────────────────────────────────────

$EXTENSION_NAME = "Auto-Coursera Assistant"
$EXTENSION_ID   = "alojpdnpiddmekflpagdblmaehbdfcge"

# ── Browser Policy Paths ─────────────────────────────────────────────────────

$BrowserPolicies = @{
    "Google Chrome"  = "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist"
    "Microsoft Edge" = "HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist"
    "Brave Browser"  = "HKLM:\SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallForcelist"
}

# ── Helper Functions ─────────────────────────────────────────────────────────

function Write-Banner {
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║       Auto-Coursera Assistant Uninstaller        ║" -ForegroundColor Cyan
    Write-Host "  ║      Windows Browser Extension Policy Tool       ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Info {
    param([string]$Message)
    Write-Host "  [INFO] " -ForegroundColor Cyan -NoNewline
    Write-Host $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "  [OK]   " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  [WARN] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-Err {
    param([string]$Message)
    Write-Host "  [ERR]  " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

function Show-Usage {
    Write-Host "Usage:" -ForegroundColor White
    Write-Host "  .\uninstall.ps1" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Removes the ${EXTENSION_NAME} from all browser policies." -ForegroundColor Gray
    Write-Host "Requires Administrator privileges." -ForegroundColor Gray
    Write-Host ""
}

function Test-AdminPrivileges {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ── Main Execution ───────────────────────────────────────────────────────────

Write-Banner

# Check administrator privileges
if (-not (Test-AdminPrivileges)) {
    Write-Err "This script must be run as Administrator."
    Write-Host ""
    Write-Host "  Right-click PowerShell and select 'Run as Administrator'," -ForegroundColor Gray
    Write-Host "  or run from an elevated terminal." -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Info "Scanning browser policies for ${EXTENSION_NAME}..."
Write-Host ""

$totalFound   = 0
$totalRemoved = 0
$results = @{}

foreach ($entry in $BrowserPolicies.GetEnumerator()) {
    $browserName = $entry.Key
    $policyPath  = $entry.Value

    Write-Info "Checking ${browserName}..."

    if (-not (Test-Path $policyPath)) {
        Write-Warn "  No policy key found — skipping"
        $results[$browserName] = "no_policy"
        continue
    }

    # Enumerate all values in the policy key
    $foundInBrowser = $false

    try {
        $key = Get-Item -Path $policyPath -ErrorAction Stop
        $valueNames = $key.GetValueNames() | Where-Object { $_ -match '^\d+$' } | Sort-Object { [int]$_ }

        foreach ($name in $valueNames) {
            $value = $key.GetValue($name)

            if ($value -like "*${EXTENSION_ID}*") {
                $totalFound++
                $foundInBrowser = $true

                try {
                    Remove-ItemProperty -Path $policyPath -Name $name -Force
                    Write-Success "  Removed entry: slot ${name} = ${value}"
                    $totalRemoved++
                } catch {
                    Write-Err "  Failed to remove slot ${name}: $_"
                }
            }
        }
    } catch {
        Write-Err "  Failed to read policy key: $_"
        $results[$browserName] = "error"
        continue
    }

    if ($foundInBrowser) {
        $results[$browserName] = "removed"

        # Clean up empty key
        try {
            $remaining = (Get-Item -Path $policyPath -ErrorAction SilentlyContinue).GetValueNames() |
                         Where-Object { $_ -match '^\d+$' }
            if (-not $remaining -or $remaining.Count -eq 0) {
                Remove-Item -Path $policyPath -Force -ErrorAction SilentlyContinue
                Write-Info "  Cleaned up empty policy key"
            }
        } catch {
            # Not critical
        }
    } else {
        Write-Warn "  ${EXTENSION_NAME} not found in policy"
        $results[$browserName] = "not_found"
    }
}

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ── Summary ──────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""

foreach ($entry in $results.GetEnumerator()) {
    $browserName = $entry.Key
    $status = $entry.Value

    switch ($status) {
        "removed" {
            Write-Host "    ✓ " -ForegroundColor Green -NoNewline
            Write-Host "${browserName}: Extension policy removed"
        }
        "not_found" {
            Write-Host "    - " -ForegroundColor Yellow -NoNewline
            Write-Host "${browserName}: Extension not found in policy"
        }
        "no_policy" {
            Write-Host "    - " -ForegroundColor Yellow -NoNewline
            Write-Host "${browserName}: No policy key exists"
        }
        "error" {
            Write-Host "    ✗ " -ForegroundColor Red -NoNewline
            Write-Host "${browserName}: Error reading policy"
        }
    }
}

Write-Host ""
Write-Info "Found ${totalFound} entr$(if ($totalFound -eq 1) {'y'} else {'ies'}), removed ${totalRemoved}."

if ($totalRemoved -gt 0) {
    Write-Host ""
    Write-Host "  ┌──────────────────────────────────────────────────┐" -ForegroundColor Yellow
    Write-Host "  │  Please restart your browser(s) for changes to   │" -ForegroundColor Yellow
    Write-Host "  │  take effect.                                    │" -ForegroundColor Yellow
    Write-Host "  └──────────────────────────────────────────────────┘" -ForegroundColor Yellow
} else {
    Write-Info "No changes were made — extension was not found in any browser policy."
}

Write-Host ""
