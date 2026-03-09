## ROLE

You are a senior full-stack developer building a complete browser extension distribution platform. You will build every component from scratch, following the architecture exactly. You write production-quality code. You do not skip steps. You do not leave placeholders. You build complete, working files.

>**Important**: You can modify plan details if you find any issues or improvements, but do not change the overall architecture or requirements. Always ask before making significant changes.
> **Important:** The browser extension source code is already built and lives in the `extension/` directory. Your job is to build everything else around it: website, installer, API, packaging scripts, CI/CD, documentation.

> Domain is `nicx.me` and `nicx.app`.

---

## CONTEXT

I have a **Chrome/Edge browser extension already built**. It is located in a folder called `extension/`. I will provide it to you. Do not modify the extension source code unless explicitly asked.

Your job is to build **everything else** around it:

- Website (Cloudflare Pages)
- Native helper installer (Go)
- Terminal install scripts (PowerShell + Bash)
- Uninstall scripts
- Cloudflare Workers API
- CRX packaging and signing scripts
- CI/CD pipeline (GitHub Actions)
- Cloudflare R2 bucket configuration
- updates.xml generation
- Documentation

---

## CONFIGURATION VARIABLES

Use these variables throughout the entire project. Replace them consistently in every file:

```
PROJECT_NAME         = "extension-platform"
EXTENSION_NAME       = "Example Extension"
EXTENSION_ID         = "EXTENSION_ID_PLACEHOLDER"
DOMAIN_WEBSITE       = "install.example.com"
DOMAIN_EXTENSIONS    = "extensions.example.com"
DOMAIN_API           = "api.example.com"
CLOUDFLARE_PAGES_PROJECT = "extension-platform"
R2_EXTENSIONS_BUCKET = "extensions-bucket"
R2_RELEASES_BUCKET   = "releases-bucket"
GITHUB_REPO          = "org/extension-platform"
```

I will replace these placeholders with real values after you generate the code.

---

## OUTPUT STRUCTURE

Generate every file listed below. Output each file with its **full path** and **complete contents**. Do not truncate. Do not summarize. Do not say "add similar code here". Write every line.

---

## REPOSITORY STRUCTURE TO BUILD

```
extension-platform/
│
├── website/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.astro
│   │   │   ├── install.astro
│   │   │   ├── downloads.astro
│   │   │   ├── releases.astro
│   │   │   ├── support.astro
│   │   │   ├── privacy.astro
│   │   │   └── docs/
│   │   │       ├── index.astro
│   │   │       ├── manual.astro
│   │   │       └── troubleshoot.astro
│   │   ├── components/
│   │   │   ├── Header.astro
│   │   │   ├── Footer.astro
│   │   │   ├── InstallButton.astro
│   │   │   ├── ScriptBlock.astro
│   │   │   ├── OSDetector.astro
│   │   │   ├── ReleaseCard.astro
│   │   │   └── VersionBadge.astro
│   │   ├── layouts/
│   │   │   └── Base.astro
│   │   └── styles/
│   │       └── global.css
│   ├── public/
│   │   ├── scripts/
│   │   │   ├── install.ps1
│   │   │   ├── install.sh
│   │   │   ├── install-mac.sh
│   │   │   ├── uninstall.ps1
│   │   │   └── uninstall.sh
│   │   ├── favicon.svg
│   │   └── og-image.png
│   ├── _headers
│   ├── _redirects
│   ├── astro.config.mjs
│   ├── tailwind.config.mjs
│   ├── tsconfig.json
│   └── package.json
│
├── installer/
│   ├── main.go
│   ├── detect.go
│   ├── policy_windows.go
│   ├── policy_linux.go
│   ├── policy_macos.go
│   ├── browsers.go
│   ├── verify.go
│   ├── ui.go
│   ├── config.go
│   ├── go.mod
│   └── Makefile
│
├── workers/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── version.ts
│   │   │   ├── releases.ts
│   │   │   ├── download.ts
│   │   │   └── stats.ts
│   │   └── utils/
│   │       ├── r2.ts
│   │       ├── cors.ts
│   │       └── response.ts
│   ├── wrangler.toml
│   ├── tsconfig.json
│   └── package.json
│
├── scripts/
│   ├── package-crx.sh
│   ├── generate-updates-xml.sh
│   ├── derive-extension-id.sh
│   ├── generate-key.sh
│   └── verify-crx.sh
│
├── .github/
│   └── workflows/
│       ├── deploy.yml
│       ├── build-extension.yml
│       ├── build-installers.yml
│       └── deploy-worker.yml
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SETUP.md
│   ├── SIGNING.md
│   ├── CLOUDFLARE-SETUP.md
│   └── TROUBLESHOOTING.md
│
├── .gitignore
├── README.md
└── LICENSE
```

---

## BUILD INSTRUCTIONS — COMPONENT BY COMPONENT

---

### COMPONENT 1: WEBSITE

**Framework:** Astro with Tailwind CSS

**Requirements:**

1. Initialize Astro project in `website/` directory
2. Use Tailwind CSS for styling
3. Use `@astrojs/cloudflare` adapter for Cloudflare Pages compatibility
4. All pages must be static (no SSR)
5. Design must be clean, modern, professional
6. Color scheme: dark theme with accent color (blue or green)
7. Fully responsive (mobile + desktop)

**package.json must include:**

```
astro
@astrojs/tailwind
@astrojs/cloudflare
tailwindcss
```

**Page specifications:**

#### index.astro (Landing Page)

- Hero section with extension name and one-line description
- "Install Now" call-to-action button linking to /install
- Features section (3-4 feature cards with icons)
- How It Works section (3 steps: Download → Install → Done)
- Supported browsers section (Chrome, Edge, Brave, Chromium icons)
- Footer with links

#### install.astro (Install Page) — MOST IMPORTANT PAGE

- Must auto-detect user OS using JavaScript (navigator.userAgent)
- Show TWO install methods clearly separated

**Method 1 — Recommended: Helper Installer**

- Large prominent section labeled "★ Recommended"
- Three download buttons: Windows (.exe), macOS (.dmg), Linux (.AppImage)
- Auto-highlight the button matching detected OS
- Each button links to: `https://DOMAIN_API/api/download/windows` (etc.)
- Show file size and checksum link next to each button

**Method 2 — Advanced: Terminal Script**

- Collapsible or secondary section labeled "Advanced: Terminal Script"
- Show one-liner commands with copy buttons:
  - Windows: `irm https://DOMAIN_WEBSITE/scripts/install.ps1 | iex`
  - Linux: `curl -fsSL https://DOMAIN_WEBSITE/scripts/install.sh | sudo bash`
  - macOS: `curl -fsSL https://DOMAIN_WEBSITE/scripts/install-mac.sh | bash`
- Each command block must have a "Copy" button that copies to clipboard
- Show warning: "Requires administrator/sudo privileges"

#### downloads.astro

- List all available downloads: installers + scripts
- Show version, file size, SHA256 checksum for each
- Fetch latest version from `https://DOMAIN_API/api/latest-version`

#### releases.astro

- Show release history
- Fetch from `https://DOMAIN_API/api/releases`
- Display version number, date, download link for each release
- Use the ReleaseCard component

#### support.astro

- FAQ section with common questions
- Link to GitHub issues
- Contact information

#### privacy.astro

- Privacy policy page
- State what data the extension collects (if any)
- State what data the website collects

#### docs/index.astro

- Documentation overview
- Links to manual install and troubleshooting

#### docs/manual.astro

- Step-by-step manual installation guide
- Explain registry keys (Windows) and policy files (Linux/macOS)
- Show exact paths and values
- Include screenshots placeholders

#### docs/troubleshoot.astro

- Common issues and solutions:
  - Extension not appearing after install
  - Script blocked by antivirus
  - Permission errors
  - Browser not detecting policy
  - How to check if policy is applied

**Component specifications:**

#### Header.astro

- Logo/extension name on left
- Navigation links: Home, Install, Docs, Releases, Support
- Mobile hamburger menu

#### Footer.astro

- Links: Privacy, Docs, GitHub, Support
- Copyright notice
- Version badge

#### InstallButton.astro

- Props: os (string), label (string), href (string), recommended (boolean)
- Styled button with OS icon
- If recommended=true, add a badge/highlight

#### ScriptBlock.astro

- Props: command (string), label (string)
- Monospace code block with the command
- Copy to clipboard button
- Visual feedback on copy (checkmark icon briefly)

#### OSDetector.astro

- Client-side script that detects OS
- Exports detected OS to other components
- Reorders install buttons to show matching OS first
- Adds "Detected: Windows" (or macOS/Linux) label

#### ReleaseCard.astro

- Props: version, date, downloadUrl, size
- Card showing release info
- Download button

#### VersionBadge.astro

- Props: version (string)
- Small badge showing current version
- Fetches from API if version not provided

**Static files:**

#### _headers

```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://DOMAIN_API; img-src 'self' data:
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/scripts/*
  Content-Type: text/plain
  Cache-Control: public, max-age=3600
```

#### _redirects

```
/download/windows  https://DOMAIN_API/api/download/windows  302
/download/macos    https://DOMAIN_API/api/download/macos     302
/download/linux    https://DOMAIN_API/api/download/linux     302
/ps                /scripts/install.ps1                      200
/sh                /scripts/install.sh                       200
```

#### favicon.svg

- Generate a simple SVG favicon (puzzle piece or extension icon shape)

---

### COMPONENT 2: TERMINAL INSTALL SCRIPTS

Build complete, production-quality scripts. Include error handling, colored output, and user feedback.

#### install.ps1 (Windows PowerShell)

**Requirements:**

1. Must check if running as Administrator — exit with message if not
2. Accept parameter: `-Browser` (default: "all")
3. Supported browsers: chrome, edge, brave, all
4. For each browser:
   - Check if browser is installed (check registry for install path)
   - If installed, write extension force-install policy to registry
   - Registry path per browser:
     - Chrome: `HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist`
     - Edge: `HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist`
     - Brave: `HKLM:\SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallForcelist`
   - Value: `EXTENSION_ID;https://DOMAIN_EXTENSIONS/updates.xml`
   - Find next available numeric property name (1, 2, 3...)
   - Check if extension already exists in policy before adding
5. Print colored status messages (green for success, red for error, yellow for warning)
6. Print summary at end showing which browsers were configured
7. Tell user to restart browsers
8. Include `-Uninstall` switch that removes the policy instead

#### install.sh (Linux Bash)

**Requirements:**

1. Must check if running as root — exit with message if not
2. Use `set -euo pipefail`
3. Accept argument: browser name (default: "all")
4. Detect which browsers are installed using `which` or `command -v`:
   - google-chrome / google-chrome-stable
   - microsoft-edge / microsoft-edge-stable
   - brave-browser
   - chromium / chromium-browser
5. For each installed browser, write policy JSON file:
   - Chrome: `/etc/opt/chrome/policies/managed/extension-policy.json`
   - Edge: `/etc/opt/edge/policies/managed/extension-policy.json`
   - Brave: `/etc/brave/policies/managed/extension-policy.json`
   - Chromium: `/etc/chromium/policies/managed/extension-policy.json`
6. Create directories if they don't exist
7. If policy file already exists, merge with existing policies (don't overwrite)
8. Use `jq` for JSON manipulation if available, fall back to direct write
9. Print colored output using ANSI codes
10. Print summary and restart instruction
11. Support `--uninstall` flag

#### install-mac.sh (macOS Bash)

**Requirements:**

1. Detect installed browsers
2. Use `defaults write` for Chrome and Edge:
   - `com.google.Chrome ExtensionInstallForcelist`
   - `com.microsoft.Edge ExtensionInstallForcelist`
   - `com.brave.Browser ExtensionInstallForcelist`
3. Check if extension already in policy before adding
4. Print colored output
5. Support `--uninstall` flag using `defaults delete`

#### uninstall.ps1 (Windows)

1. Remove extension from all browser force-install policies
2. Search all registry entries for EXTENSION_ID
3. Remove matching entries
4. Print what was removed

#### uninstall.sh (Linux/macOS)

1. Detect OS (Linux vs macOS)
2. Linux: remove extension from policy JSON files
3. macOS: use `defaults delete` to remove from preferences
4. Print what was removed

---

### COMPONENT 3: NATIVE HELPER INSTALLER (Go)

Build a complete Go application that provides a terminal UI for installing the extension.

#### config.go

```go
// Configuration constants
// Extension ID, update URL, supported browsers, policy paths
```

Define all constants:

```
ExtensionID  = "EXTENSION_ID_PLACEHOLDER"
UpdateURL    = "https://DOMAIN_EXTENSIONS/updates.xml"
ExtensionName = "EXTENSION_NAME"
PolicyValue  = ExtensionID + ";" + UpdateURL
```

Define browser configurations as a struct:

```go
type BrowserConfig struct {
    Name            string
    DisplayName     string
    WindowsRegPath  string
    LinuxPolicyDir  string
    MacOSPlistDomain string
    DetectCommands  []string    // commands to check if installed
    WindowsRegCheck string     // registry key to check if installed on Windows
}
```

Define all supported browsers:

- Google Chrome
- Microsoft Edge
- Brave
- Chromium

#### detect.go

**Functions:**

- `DetectOS() string` — returns "windows", "linux", "darwin"
- `DetectInstalledBrowsers() []BrowserConfig` — returns list of browsers found on the system

**Windows detection:** Check registry keys for browser install paths
**Linux detection:** Use `exec.LookPath` for browser commands
**macOS detection:** Check `/Applications/` for browser .app bundles and use `exec.LookPath`

#### browsers.go

**Functions:**

- `ListBrowsers(browsers []BrowserConfig)` — print detected browsers
- `SelectBrowser(browsers []BrowserConfig) []BrowserConfig` — let user select which browsers to configure (default: all)
- `IsPolicyAlreadySet(browser BrowserConfig) bool` — check if extension policy already exists

#### policy_windows.go

**Build constraint:** `//go:build windows`

**Functions:**

- `WritePolicyWindows(browser BrowserConfig) error`
  - Open registry key (create if not exists)
  - Find next available index
  - Check if extension already in policy
  - Write value
  - Return error if failed

- `RemovePolicyWindows(browser BrowserConfig) error`
  - Find and remove extension from registry

Uses `golang.org/x/sys/windows/registry` package.

#### policy_linux.go

**Build constraint:** `//go:build linux`

**Functions:**

- `WritePolicyLinux(browser BrowserConfig) error`
  - Create policy directory if not exists
  - Read existing policy file if exists
  - Add extension to force-install list (avoid duplicates)
  - Write JSON file with proper permissions (644)

- `RemovePolicyLinux(browser BrowserConfig) error`

#### policy_macos.go

**Build constraint:** `//go:build darwin`

**Functions:**

- `WritePolicyMacOS(browser BrowserConfig) error`
  - Use `exec.Command("defaults", "write", ...)` to set policy
  - Verify policy was written

- `RemovePolicyMacOS(browser BrowserConfig) error`

#### verify.go

**Functions:**

- `VerifyInstallation(browser BrowserConfig) bool`
  - Check if policy was written correctly
  - Windows: read registry and verify value exists
  - Linux: read JSON file and verify extension is in list
  - macOS: use `defaults read` to verify

#### ui.go

**Functions:**

- `PrintBanner()` — print extension name and version banner
- `PrintSuccess(msg string)` — green colored output
- `PrintError(msg string)` — red colored output
- `PrintWarning(msg string)` — yellow colored output
- `PrintInfo(msg string)` — blue colored output
- `PrintStep(step int, total int, msg string)` — "[1/5] Detecting OS..."
- `PromptYesNo(question string) bool` — ask yes/no question
- `PrintSummary(results []InstallResult)` — print final summary table

Use ANSI color codes. Detect if terminal supports colors.

#### main.go

**Main flow:**

```
1. PrintBanner()
2. PrintStep(1, 5, "Detecting operating system...")
   os := DetectOS()
3. PrintStep(2, 5, "Scanning for installed browsers...")
   browsers := DetectInstalledBrowsers()
   if none found → PrintError and exit
4. PrintStep(3, 5, "Configuring browser policies...")
   ListBrowsers(browsers)
   selected := SelectBrowser(browsers)  // or default all
5. For each selected browser:
   - Check if already installed
   - Write policy
   - Verify policy
   - Record result
6. PrintStep(4, 5, "Verifying installation...")
   Verify all policies
7. PrintStep(5, 5, "Done!")
   PrintSummary(results)
   Print "Please restart your browser(s) to activate the extension"
```

**Command line flags:**

```
--browser     Target specific browser (chrome, edge, brave, all)
--uninstall   Remove extension policy
--quiet       Minimal output
--help        Show help
```

Use standard `flag` package.

#### go.mod

```
module github.com/GITHUB_REPO/installer

go 1.22

require (
    golang.org/x/sys v0.x.x   // for Windows registry
)
```

#### Makefile

```makefile
Build targets:
  make build-all         Build for all platforms
  make build-windows     GOOS=windows GOARCH=amd64
  make build-windows-arm GOOS=windows GOARCH=arm64
  make build-macos       GOOS=darwin GOARCH=arm64
  make build-macos-intel GOOS=darwin GOARCH=amd64
  make build-linux       GOOS=linux GOARCH=amd64
  make clean             Remove build artifacts
```

Output binaries to `dist/` directory with proper naming:

```
dist/installer-windows-amd64.exe
dist/installer-windows-arm64.exe
dist/installer-macos-arm64
dist/installer-macos-amd64
dist/installer-linux-amd64
```

---

### COMPONENT 4: CLOUDFLARE WORKERS API

Build a complete Cloudflare Worker with routing and R2 integration.

#### wrangler.toml

```toml
name = "extension-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
EXTENSION_ID = "EXTENSION_ID_PLACEHOLDER"
CURRENT_VERSION = "1.0.0"
ALLOWED_ORIGIN = "https://DOMAIN_WEBSITE"

[[r2_buckets]]
binding = "EXTENSIONS_BUCKET"
bucket_name = "extensions-bucket"

[[r2_buckets]]
binding = "RELEASES_BUCKET"
bucket_name = "releases-bucket"

[env.production]
routes = [
  { pattern = "DOMAIN_API/*", zone_name = "example.com" }
]
```

#### src/utils/cors.ts

- Export function `corsHeaders(origin: string, allowedOrigin: string): Headers`
- Handle preflight OPTIONS requests
- Allow GET from the website domain
- Return proper CORS headers

#### src/utils/response.ts

- Export function `jsonResponse(data: any, status?: number, corsHeaders?: Headers): Response`
- Export function `errorResponse(message: string, status: number, corsHeaders?: Headers): Response`
- Export function `redirectResponse(url: string): Response`

#### src/utils/r2.ts

- Export function `getObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null>`
- Export function `listObjects(bucket: R2Bucket, prefix: string): Promise<R2Objects>`

#### src/routes/version.ts

**Endpoint:** `GET /api/latest-version`

**Response:**

```json
{
  "version": "1.0.0",
  "extensionId": "EXTENSION_ID",
  "updateUrl": "https://DOMAIN_EXTENSIONS/updates.xml",
  "downloadUrl": "https://DOMAIN_EXTENSIONS/releases/extension_1.0.0.crx"
}
```

#### src/routes/releases.ts

**Endpoint:** `GET /api/releases`

- List all CRX files in R2 extensions bucket under `releases/` prefix
- Parse version from filename
- Sort by version descending
- Return array of releases

**Response:**

```json
{
  "releases": [
    {
      "version": "1.2.0",
      "file": "extension_1.2.0.crx",
      "size": 245760,
      "date": "2024-01-15T10:30:00Z",
      "url": "https://DOMAIN_EXTENSIONS/releases/extension_1.2.0.crx"
    }
  ]
}
```

#### src/routes/download.ts

**Endpoint:** `GET /api/download/:os`

- Accept os parameter: `windows`, `macos`, `linux`
- Map to installer filename in R2 releases bucket
- Stream the file from R2 with proper Content-Disposition header
- If file not found, return 404

**File mapping:**

```
windows → installer-windows-amd64.exe
macos   → installer-macos-arm64
linux   → installer-linux-amd64
```

#### src/routes/stats.ts

**Endpoint:** `GET /api/stats`

- Return basic stats: total releases count, latest version, last updated date
- Pull from R2 bucket listing

#### src/index.ts

**Main router:**

- Parse request URL
- Match routes:
  - `GET /api/latest-version` → version handler
  - `GET /api/releases` → releases handler
  - `GET /api/download/:os` → download handler
  - `GET /api/stats` → stats handler
  - `OPTIONS /*` → CORS preflight
  - Everything else → 404
- Apply CORS headers to all responses
- Handle errors gracefully

**Env interface:**

```typescript
export interface Env {
  EXTENSIONS_BUCKET: R2Bucket
  RELEASES_BUCKET: R2Bucket
  CURRENT_VERSION: string
  EXTENSION_ID: string
  ALLOWED_ORIGIN: string
}
```

#### package.json

Include:

```
wrangler
typescript
@cloudflare/workers-types
```

Include scripts:

```
dev → wrangler dev
deploy → wrangler deploy
```

#### tsconfig.json

Configure for Cloudflare Workers with proper types.

---

### COMPONENT 5: CRX PACKAGING SCRIPTS

#### scripts/generate-key.sh

1. Generate RSA 2048 private key using openssl
2. Save to `extension-key.pem`
3. Extract and display the extension ID derived from the public key
4. Print instructions to save key to GitHub Secrets

#### scripts/derive-extension-id.sh

1. Accept private key file path as argument
2. Extract public key from private key
3. Compute SHA256 hash
4. Take first 32 bytes
5. Convert to extension ID format (a-p encoding)
6. Print the extension ID

#### scripts/package-crx.sh

1. Accept arguments: version, key file path, source directory
2. Validate inputs
3. Update version in manifest.json
4. Create ZIP of extension directory (exclude hidden files, .git, etc.)
5. Package as CRX3 format using `crx3` npm tool
6. Generate SHA256 checksum
7. Output: `extension_VERSION.crx` and `extension_VERSION.crx.sha256`

#### scripts/generate-updates-xml.sh

1. Accept arguments: extension ID, version, CRX URL
2. Generate valid updates.xml file
3. Output to stdout or file

Template:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="EXTENSION_ID">
    <updatecheck
      codebase="CRX_URL"
      version="VERSION"/>
  </app>
</gupdate>
```

#### scripts/verify-crx.sh

1. Accept CRX file path
2. Verify the CRX file is valid
3. Extract and display version from manifest
4. Display file size
5. Display SHA256 checksum
6. Verify signature if possible

---

### COMPONENT 6: CI/CD PIPELINE

#### .github/workflows/deploy.yml

**Main orchestration workflow.**

**Triggers:**

- Push to `main` branch → deploy website only
- Push tag `v*` → full release (build extension + installers + deploy everything)

**Required GitHub Secrets:**

```
CF_ACCOUNT_ID          — Cloudflare account ID
CF_API_TOKEN           — Cloudflare API token (with Pages, R2, Workers permissions)
EXTENSION_PRIVATE_KEY  — PEM private key for CRX signing
EXTENSION_ID           — The extension ID
```

**Jobs:**

##### Job: build-extension

- Triggers only on tag push
- Checkout code
- Extract version from tag (strip `v` prefix)
- Setup Node.js 20
- Install crx3 tool
- Update manifest.json version
- Write private key from secret to temp file
- Run package-crx.sh
- Generate updates.xml
- Upload CRX to R2 bucket `extensions-bucket/releases/`
- Upload updates.xml to R2 bucket `extensions-bucket/`
- Upload checksums to R2
- Clean up private key file (always step)
- Upload CRX as workflow artifact

##### Job: build-installers

- Triggers only on tag push
- Checkout code
- Setup Go 1.22
- Run `make build-all` in installer directory
- Upload all binaries to R2 bucket `releases-bucket/`
- Generate checksums for all binaries
- Upload checksums to R2
- Upload binaries as workflow artifacts

##### Job: deploy-website

- Triggers on main push AND after tag jobs
- Checkout code
- Setup Node.js 20
- Install website dependencies
- Build website
- Deploy to Cloudflare Pages using wrangler

##### Job: deploy-worker

- Triggers only on tag push
- Checkout code
- Deploy worker using wrangler

**Use `cloudflare/wrangler-action@v3` for all Cloudflare operations.**

**Set proper `needs` and `if` conditions:**

- deploy-website needs build-extension and build-installers (on tags)
- deploy-website runs independently (on main push)
- deploy-worker needs build-extension

---

### COMPONENT 7: DOCUMENTATION

#### README.md

Complete README with:

1. Project title and description
2. Architecture diagram (text-based)
3. Quick start guide
4. Prerequisites list
5. Setup instructions
6. Development guide
7. Deployment guide
8. Configuration reference
9. License

#### docs/ARCHITECTURE.md

- System architecture overview
- Component descriptions
- Data flow diagrams
- Domain structure

#### docs/SETUP.md

Step-by-step setup guide:

1. Fork/clone repository
2. Generate extension signing key
3. Derive extension ID
4. Create Cloudflare account
5. Create R2 buckets (extensions-bucket, releases-bucket)
6. Configure R2 custom domains
7. Create Cloudflare Pages project
8. Configure custom domain for Pages
9. Deploy Worker
10. Configure GitHub Secrets
11. Update configuration variables in all files
12. First deployment
13. Verification steps

#### docs/SIGNING.md

- How CRX signing works
- How to generate a key
- How extension ID is derived
- Key backup and security
- What happens if key is lost

#### docs/CLOUDFLARE-SETUP.md

- R2 bucket creation
- R2 custom domain setup
- R2 CORS configuration
- Pages project setup
- Worker deployment
- DNS configuration
- Cache rules setup:
  - updates.xml → 5 minute cache
  - *.crx → 24 hour cache
- WAF rate limiting rules
- SSL/TLS configuration

#### docs/TROUBLESHOOTING.md

Common issues:

1. Extension not installing after script runs
2. CRX download fails
3. updates.xml returns 404
4. CORS errors on API
5. Worker deployment fails
6. R2 access denied
7. GitHub Actions fails
8. Extension ID mismatch
9. Browser not reading policy
10. PowerShell execution policy blocking script

---

### COMPONENT 8: PROJECT FILES

#### .gitignore

```
node_modules/
dist/
*.pem
*.crx
*.zip
.wrangler/
.env
.DS_Store
extension-key.pem
website/.astro/
installer/dist/
```

#### LICENSE

MIT License with current year and placeholder author name.

---

## IMPORTANT RULES

1. **Every file must be complete.** No `// ... rest of code` or `// similar to above`. Write every line.

2. **Use the configuration variables** listed above consistently. I will find-and-replace them.

3. **The extension source code is already built.** It lives in `extension/`. Do not create extension source files (background.js, content.js, popup, etc.). Only reference the `extension/` directory in build scripts and CI. You may create a SAMPLE manifest.json showing the required `update_url` field if needed for documentation.

4. **All scripts must have proper error handling.** No script should fail silently.

5. **All Go code must compile.** Use proper build constraints for OS-specific files. Use proper error handling (no ignored errors).

6. **The Worker must handle all edge cases:** missing files, invalid routes, CORS preflight, empty buckets.

7. **The website must look professional.** Use Tailwind CSS utility classes. Dark theme. Responsive. Real content, not lorem ipsum.

8. **Security headers must be configured** in the `_headers` file.

9. **Caching must be documented** in CLOUDFLARE-SETUP.md with exact rules.

10. **The CI/CD pipeline must be complete and working.** All jobs, all steps, proper conditionals.

---

## EXECUTION ORDER

Build the files in this order:

```
1.  .gitignore
2.  README.md
3.  LICENSE
4.  scripts/generate-key.sh
5.  scripts/derive-extension-id.sh
6.  scripts/package-crx.sh
7.  scripts/generate-updates-xml.sh
8.  scripts/verify-crx.sh
9.  installer/config.go
10. installer/detect.go
11. installer/browsers.go
12. installer/ui.go
13. installer/policy_windows.go
14. installer/policy_linux.go
15. installer/policy_macos.go
16. installer/verify.go
17. installer/main.go
18. installer/go.mod
19. installer/Makefile
20. workers/package.json
21. workers/tsconfig.json
22. workers/wrangler.toml
23. workers/src/utils/cors.ts
24. workers/src/utils/response.ts
25. workers/src/utils/r2.ts
26. workers/src/routes/version.ts
27. workers/src/routes/releases.ts
28. workers/src/routes/download.ts
29. workers/src/routes/stats.ts
30. workers/src/index.ts
31. website/package.json
32. website/astro.config.mjs
33. website/tailwind.config.mjs
34. website/tsconfig.json
35. website/_headers
36. website/_redirects
37. website/public/favicon.svg
38. website/public/scripts/install.ps1
39. website/public/scripts/install.sh
40. website/public/scripts/install-mac.sh
41. website/public/scripts/uninstall.ps1
42. website/public/scripts/uninstall.sh
43. website/src/styles/global.css
44. website/src/layouts/Base.astro
45. website/src/components/Header.astro
46. website/src/components/Footer.astro
47. website/src/components/InstallButton.astro
48. website/src/components/ScriptBlock.astro
49. website/src/components/OSDetector.astro
50. website/src/components/ReleaseCard.astro
51. website/src/components/VersionBadge.astro
52. website/src/pages/index.astro
53. website/src/pages/install.astro
54. website/src/pages/downloads.astro
55. website/src/pages/releases.astro
56. website/src/pages/support.astro
57. website/src/pages/privacy.astro
58. website/src/pages/docs/index.astro
59. website/src/pages/docs/manual.astro
60. website/src/pages/docs/troubleshoot.astro
61. .github/workflows/deploy.yml
62. docs/ARCHITECTURE.md
63. docs/SETUP.md
64. docs/SIGNING.md
65. docs/CLOUDFLARE-SETUP.md
66. docs/TROUBLESHOOTING.md
```

---

## START

Begin building now. Output each file with its full path as a header and complete file contents. Do not stop until all 66 files are generated.

---