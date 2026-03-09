<#
.SYNOPSIS
    Auto-Coursera Assistant — Windows Browser Extension Policy Installer
.DESCRIPTION
    Configures Windows registry policies to force-install the Auto-Coursera Assistant
    browser extension for Chrome, Edge, and/or Brave browsers.
    Supports both install and uninstall operations.
.PARAMETER Browser
    Target browser: chrome, edge, brave, or all (default: all)
.PARAMETER Uninstall
    Switch to remove the extension policy instead of installing it
.EXAMPLE
    .\install.ps1
    .\install.ps1 -Browser chrome
    .\install.ps1 -Uninstall
    .\install.ps1 -Browser edge -Uninstall
.NOTES
    Author: nicx
    Project: Auto-Coursera Assistant
    Website: https://autocr.nicx.app
    Requires: Administrator privileges
#>

[CmdletBinding()]
param(
    [ValidateSet("chrome", "edge", "brave", "all")]
    [string]$Browser = "all",

    [switch]$Uninstall
)

# ── Configuration ─────────────────────────────────────────────────────────────

$EXTENSION_NAME = "Auto-Coursera Assistant"
$EXTENSION_ID   = "EXTENSION_ID_PLACEHOLDER"
$UPDATE_URL     = "https://cdn.autocr.nicx.app/updates.xml"
$POLICY_VALUE   = "${EXTENSION_ID};${UPDATE_URL}"

# ── Browser Definitions ──────────────────────────────────────────────────────

$BrowserDefs = @{
    chrome = @{
        Name        = "Google Chrome"
        DetectPaths = @(
            "HKLM:\SOFTWARE\Google\Chrome",
            "HKLM:\SOFTWARE\WOW6432Node\Google\Chrome"
        )
        PolicyPath  = "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist"
    }
    edge = @{
        Name        = "Microsoft Edge"
        DetectPaths = @(
            "HKLM:\SOFTWARE\Microsoft\Edge"
        )
        PolicyPath  = "HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist"
    }
    brave = @{
        Name        = "Brave Browser"
        DetectPaths = @(
            "HKLM:\SOFTWARE\BraveSoftware\Brave-Browser"
        )
        PolicyPath  = "HKLM:\SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallForcelist"
    }
}

# ── Helper Functions ─────────────────────────────────────────────────────────

function Write-Banner {
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║         Auto-Coursera Assistant Installer        ║" -ForegroundColor Cyan
    Write-Host "  ║           Browser Extension Policy Tool          ║" -ForegroundColor Cyan
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
    Write-Host "  .\install.ps1 [-Browser <chrome|edge|brave|all>] [-Uninstall]" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor White
    Write-Host "  .\install.ps1                       # Install for all detected browsers" -ForegroundColor Gray
    Write-Host "  .\install.ps1 -Browser chrome        # Install for Chrome only" -ForegroundColor Gray
    Write-Host "  .\install.ps1 -Uninstall             # Remove from all browsers" -ForegroundColor Gray
    Write-Host "  .\install.ps1 -Browser edge -Uninstall  # Remove from Edge only" -ForegroundColor Gray
    Write-Host ""
}

function Test-AdminPrivileges {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-BrowserInstalled {
    param([hashtable]$BrowserDef)

    foreach ($path in $BrowserDef.DetectPaths) {
        if (Test-Path $path) {
            return $true
        }
    }
    return $false
}

function Get-ExistingPolicyValues {
    param([string]$PolicyPath)

    $values = @{}

    if (-not (Test-Path $PolicyPath)) {
        return $values
    }

    try {
        $key = Get-Item -Path $PolicyPath -ErrorAction Stop
        foreach ($name in $key.GetValueNames()) {
            if ($name -match '^\d+$') {
                $val = $key.GetValue($name)
                $values[$name] = $val
            }
        }
    } catch {
        # Key might exist but be unreadable
    }

    return $values
}

function Test-ExtensionInPolicy {
    param([hashtable]$ExistingValues)

    foreach ($entry in $ExistingValues.GetEnumerator()) {
        if ($entry.Value -like "*${EXTENSION_ID}*") {
            return $true
        }
    }
    return $false
}

function Get-NextAvailableSlot {
    param([hashtable]$ExistingValues)

    $slot = 1
    while ($ExistingValues.ContainsKey($slot.ToString())) {
        $slot++
    }
    return $slot
}

function Install-ExtensionPolicy {
    param(
        [string]$BrowserKey,
        [hashtable]$BrowserDef
    )

    $browserName = $BrowserDef.Name
    $policyPath  = $BrowserDef.PolicyPath

    # Check if browser is installed
    if (-not (Test-BrowserInstalled -BrowserDef $BrowserDef)) {
        Write-Warn "${browserName} is not installed — skipping"
        return @{ Status = "skipped"; Reason = "not installed" }
    }

    Write-Info "Configuring ${browserName}..."

    # Ensure policy registry key exists
    if (-not (Test-Path $policyPath)) {
        try {
            New-Item -Path $policyPath -Force | Out-Null
            Write-Info "  Created policy key: $policyPath"
        } catch {
            Write-Err "  Failed to create policy key: $_"
            return @{ Status = "failed"; Reason = "cannot create key" }
        }
    }

    # Get current policy values
    $existing = Get-ExistingPolicyValues -PolicyPath $policyPath

    # Check if already configured
    if (Test-ExtensionInPolicy -ExistingValues $existing) {
        Write-Warn "  ${EXTENSION_NAME} is already in ${browserName} policy — skipping"
        return @{ Status = "skipped"; Reason = "already configured" }
    }

    # Find next available slot
    $slot = Get-NextAvailableSlot -ExistingValues $existing

    # Write the policy value
    try {
        Set-ItemProperty -Path $policyPath -Name $slot.ToString() -Value $POLICY_VALUE -Type String -Force
        Write-Success "${browserName} — policy entry added (slot ${slot})"
        return @{ Status = "installed" }
    } catch {
        Write-Err "  Failed to write policy for ${browserName}: $_"
        return @{ Status = "failed"; Reason = $_.Exception.Message }
    }
}

function Uninstall-ExtensionPolicy {
    param(
        [string]$BrowserKey,
        [hashtable]$BrowserDef
    )

    $browserName = $BrowserDef.Name
    $policyPath  = $BrowserDef.PolicyPath

    Write-Info "Checking ${browserName}..."

    if (-not (Test-Path $policyPath)) {
        Write-Warn "  No policy key found for ${browserName} — skipping"
        return @{ Status = "skipped"; Reason = "no policy key" }
    }

    $existing = Get-ExistingPolicyValues -PolicyPath $policyPath
    $removed  = $false

    foreach ($entry in $existing.GetEnumerator()) {
        if ($entry.Value -like "*${EXTENSION_ID}*") {
            try {
                Remove-ItemProperty -Path $policyPath -Name $entry.Key -Force
                Write-Success "${browserName} — removed policy entry (slot $($entry.Key))"
                $removed = $true
            } catch {
                Write-Err "  Failed to remove entry from ${browserName}: $_"
                return @{ Status = "failed"; Reason = $_.Exception.Message }
            }
        }
    }

    if (-not $removed) {
        Write-Warn "  ${EXTENSION_NAME} not found in ${browserName} policy"
        return @{ Status = "skipped"; Reason = "not found" }
    }

    # Clean up empty policy key
    $remaining = Get-ExistingPolicyValues -PolicyPath $policyPath
    if ($remaining.Count -eq 0) {
        try {
            Remove-Item -Path $policyPath -Force -ErrorAction SilentlyContinue
            Write-Info "  Cleaned up empty policy key for ${browserName}"
        } catch {
            # Not critical — ignore
        }
    }

    return @{ Status = "removed" }
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

# Determine which browsers to process
if ($Browser -eq "all") {
    $targetBrowsers = $BrowserDefs.Keys
} else {
    $targetBrowsers = @($Browser)
}

$mode = if ($Uninstall) { "Uninstall" } else { "Install" }
Write-Info "Mode: ${mode}"
Write-Info "Target: $(if ($Browser -eq 'all') { 'All detected browsers' } else { $BrowserDefs[$Browser].Name })"
Write-Host ""

# Process each browser
$results = @{}

foreach ($key in $targetBrowsers) {
    $def = $BrowserDefs[$key]
    if ($Uninstall) {
        $results[$key] = Uninstall-ExtensionPolicy -BrowserKey $key -BrowserDef $def
    } else {
        $results[$key] = Install-ExtensionPolicy -BrowserKey $key -BrowserDef $def
    }
}

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ── Summary ──────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""

$anyAction = $false

foreach ($entry in $results.GetEnumerator()) {
    $browserName = $BrowserDefs[$entry.Key].Name
    $status = $entry.Value.Status

    switch ($status) {
        "installed" {
            Write-Host "    ✓ " -ForegroundColor Green -NoNewline
            Write-Host "${browserName}: Extension policy installed"
            $anyAction = $true
        }
        "removed" {
            Write-Host "    ✓ " -ForegroundColor Green -NoNewline
            Write-Host "${browserName}: Extension policy removed"
            $anyAction = $true
        }
        "skipped" {
            Write-Host "    - " -ForegroundColor Yellow -NoNewline
            Write-Host "${browserName}: Skipped ($($entry.Value.Reason))"
        }
        "failed" {
            Write-Host "    ✗ " -ForegroundColor Red -NoNewline
            Write-Host "${browserName}: Failed ($($entry.Value.Reason))"
        }
    }
}

Write-Host ""

if ($anyAction) {
    Write-Host "  ┌──────────────────────────────────────────────────┐" -ForegroundColor Yellow
    Write-Host "  │  Please restart your browser(s) for changes to   │" -ForegroundColor Yellow
    Write-Host "  │  take effect.                                    │" -ForegroundColor Yellow
    Write-Host "  └──────────────────────────────────────────────────┘" -ForegroundColor Yellow
} else {
    Write-Info "No changes were made."
}

Write-Host ""
