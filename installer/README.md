# Auto-Coursera Installer

Cross-platform CLI tool that configures browser policies to force-install the Auto-Coursera Assistant extension. Written in Go with zero external dependencies at runtime.

---

## How It Works

The installer writes `ExtensionInstallForcelist` policy entries for Chromium-based browsers. This policy tells the browser to install the extension from a self-hosted update URL and keep it updated automatically.

```
Policy value: <extension-id>;<update-url>
Example:      alojpdnpiddmekflpagdblmaehbdfcge;https://cdn.autocr.nicx.app/updates.xml
```

After a browser restart, the browser reads the policy, fetches `updates.xml`, downloads the CRX, and installs the extension — all silently.

## Supported Browsers

| Browser | Windows | Linux | macOS |
|---|---|---|---|
| Google Chrome | ✓ | ✓ | ✓ |
| Microsoft Edge | ✓ | ✓ | ✓ |
| Brave | ✓ | ✓ | ✓ |
| Chromium | ✓ | ✓ | ✓ |

## Usage

```bash
# Install for all detected browsers
./installer

# Install for a specific browser
./installer --browser chrome

# Remove policies (uninstall)
./installer --uninstall

# Non-interactive mode
./installer --quiet

# Show help
./installer --help
```

### CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--browser` | `all` | Target a specific browser: `chrome`, `edge`, `brave`, `chromium`, or `all` |
| `--uninstall` | `false` | Remove extension policies instead of installing |
| `--quiet` | `false` | Minimal output, skip confirmation prompts |

## Building

### Prerequisites

- Go 1.22+

### Build for current platform

```bash
go build -o dist/installer .
```

### Build all platforms

```bash
make build-all
```

### Build targets

| Make Target | GOOS/GOARCH | Output |
|---|---|---|
| `build-windows` | windows/amd64 | `dist/installer-windows-amd64.exe` |
| `build-windows-arm` | windows/arm64 | `dist/installer-windows-arm64.exe` |
| `build-macos` | darwin/arm64 | `dist/installer-macos-arm64` |
| `build-macos-intel` | darwin/amd64 | `dist/installer-macos-amd64` |
| `build-linux` | linux/amd64 | `dist/installer-linux-amd64` |

All builds use `CGO_ENABLED=0` for fully static binaries with no C dependencies.

### Clean

```bash
make clean    # Removes dist/ directory
```

## Project Structure

```
installer/
├── main.go               # Entry point — flag parsing, orchestration
├── config.go             # Constants: extension ID, update URL, browser configs
├── detect.go             # OS detection (runtime.GOOS)
├── detect_unix.go        # Browser detection for Linux/macOS (exec.LookPath)
├── detect_windows.go     # Browser detection for Windows (registry scan)
├── browsers.go           # Browser configuration definitions
├── policy_windows.go     # Windows registry policy writer
├── policy_linux.go       # Linux JSON managed policy writer
├── policy_macos.go       # macOS defaults/plist policy writer
├── verify.go             # Policy verification after write
├── ui.go                 # Colored terminal output, banners, tables
├── go.mod                # Go module (requires golang.org/x/sys)
└── Makefile              # Cross-compilation targets
```

### Platform-specific files (build tags)

| File | Build Tag | Included When |
|---|---|---|
| `policy_windows.go` | `//go:build windows` | `GOOS=windows` |
| `policy_linux.go` | `//go:build linux` | `GOOS=linux` |
| `policy_macos.go` | `//go:build darwin` | `GOOS=darwin` |
| `detect_windows.go` | `//go:build windows` | `GOOS=windows` |
| `detect_unix.go` | `//go:build linux \|\| darwin` | `GOOS=linux` or `GOOS=darwin` |

## Policy Locations

### Windows — Registry

| Browser | Registry Path |
|---|---|
| Chrome | `HKLM\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist` |
| Edge | `HKLM\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist` |
| Brave | `HKLM\SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallForcelist` |
| Chromium | `HKLM\SOFTWARE\Policies\Chromium\ExtensionInstallForcelist` |

**Requires Administrator privileges.**

### Linux — Managed Policy JSON

| Browser | Policy Directory |
|---|---|
| Chrome | `/etc/opt/chrome/policies/managed/` |
| Edge | `/etc/opt/edge/policies/managed/` |
| Brave | `/etc/brave/policies/managed/` |
| Chromium | `/etc/chromium/policies/managed/` |

Writes `auto_coursera.json` with permissions `644`. **Requires root.**

### macOS — User Defaults (plist)

| Browser | Plist Domain |
|---|---|
| Chrome | `com.google.Chrome` |
| Edge | `com.microsoft.Edge` |
| Brave | `com.brave.Browser` |
| Chromium | `org.chromium.Chromium` |

Uses `defaults write`. **Does not require root.**

## Dependencies

| Module | Purpose |
|---|---|
| `golang.org/x/sys` | Windows registry access (`golang.org/x/sys/windows/registry`) |

No runtime dependencies on Linux or macOS — only the standard library.

## Related Documentation

- [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md#native-installer-go) — Full architecture overview
- [`docs/TROUBLESHOOTING.md`](../docs/TROUBLESHOOTING.md#13-go-installer-build-fails) — Build troubleshooting
- [`docs/SETUP.md`](../docs/SETUP.md) — First-time setup instructions
