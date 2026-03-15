# CRX Signing & Extension Identity

> How the Auto-Coursera Assistant extension is signed, packaged, and identified.

---

## Table of Contents

- [How CRX Signing Works](#how-crx-signing-works)
- [Key Types](#key-types)
- [How Extension ID Is Derived](#how-extension-id-is-derived)
- [Generating a Key](#generating-a-key)
- [Deriving Extension ID](#deriving-extension-id)
- [Update URL and updates.xml](#update-url-and-updatesxml)
- [CRX3 File Format](#crx3-file-format)
- [Key Security](#key-security)
- [What Happens If the Key Is Lost](#what-happens-if-the-key-is-lost)

---

## How CRX Signing Works

Chrome extensions distributed outside the Chrome Web Store must be packaged as **CRX3** files — signed ZIP archives that the browser can verify.

The signing process:

1. The extension's source directory is compressed into a ZIP archive
2. The ZIP payload is signed with an RSA 2048-bit private key
3. A CRX3 header is prepended to the signed ZIP, containing:
   - Magic bytes identifying the format
   - A protobuf-encoded header with the signature and public key
4. The browser uses the public key embedded in the header to:
   - Verify the ZIP has not been tampered with
   - **Derive the extension ID** (the key deterministically maps to an ID)
   - Ensure that updates to an already-installed extension come from the same key

This is the same process Chrome Web Store uses internally. Self-hosted extensions use the same trust model — the private key is the single root of trust.

---

## Key Types

| Property | Value |
|---|---|
| Algorithm | RSA |
| Key size | 2048 bits |
| Format | PEM (PKCS#8) |
| File | `extension-key.pem` |

The PEM file looks like:

```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
(base64-encoded key data)
...
-----END PRIVATE KEY-----
```

Only the **private key** is stored. The public key is derived from it when needed (`openssl rsa -in key.pem -pubout`).

---

## How Extension ID Is Derived

The 32-character extension ID (e.g., `abcdefghijklmnopabcdefghijklmnop`) is derived deterministically from the public key. The same key always produces the same ID.

### Algorithm

```mermaid
flowchart TD
    A["Private Key (PEM)"] --> B["Extract public key in DER format\nopenssl rsa -in key.pem -pubout -outform DER"]
    B --> C["Compute SHA-256 hash\nopenssl dgst -sha256 -binary"]
    C --> D["Take first 32 hex characters\nxxd -p | head -c 32"]
    D --> E["Convert hex → a–p encoding\n0→a, 1→b, 2→c, ... 9→j, a→k, b→l, ... f→p"]
    E --> F["32-character Extension ID"]
```

### Example

Given a hex prefix of `3a7f02...`:

| Hex | 3 | a | 7 | f | 0 | 2 | ... |
|---|---|---|---|---|---|---|---|
| Decimal | 3 | 10 | 7 | 15 | 0 | 2 | ... |
| a–p letter | d | k | h | p | a | c | ... |

Result: `dkhpac...` (continues for 32 characters total).

### Why a–p encoding?

Chrome extension IDs use only the lowercase letters `a` through `p` — a 16-letter alphabet that maps directly to hexadecimal. This makes them visually distinct from other identifiers and avoids ambiguity with base64 or hex strings.

---

## Generating a Key

Use the provided script:

```bash
bash scripts/generate-key.sh
```

Options:

```bash
bash scripts/generate-key.sh -o custom-key.pem   # Custom output path
bash scripts/generate-key.sh -h                    # Show help
```

The script:

1. Checks that `openssl` is available
2. Generates an RSA 2048 private key: `openssl genrsa -out extension-key.pem 2048`
3. Sets file permissions to `600` (owner read/write only)
4. Derives and prints the extension ID
5. If a key already exists, prompts before overwriting

Output:

```
Generating RSA 2048 private key...
✓ Private key generated: /path/to/auto-coursera/extension-key.pem
✓ Extension ID: abcdefghijklmnopabcdefghijklmnop
```

You can also generate a key manually without the script:

```bash
openssl genrsa -out extension-key.pem 2048
chmod 600 extension-key.pem
```

---

## Deriving Extension ID

To derive the ID from an existing key without generating a new one, run `generate-key.sh` — it detects the existing key, displays the current extension ID, and asks before overwriting:

```bash
bash scripts/generate-key.sh
```

The script:

1. Validates the key file exists and is readable
2. Checks for `openssl` and `xxd` availability
3. Extracts the public key in DER format
4. Computes SHA-256
5. Takes the first 32 hex characters
6. Converts to a–p encoding
7. Prints the ID

You can also derive it manually:

```bash
openssl rsa -in extension-key.pem -pubout -outform DER 2>/dev/null \
  | openssl dgst -sha256 -binary \
  | xxd -p \
  | tr -d '\n' \
  | head -c 32 \
  | sed 'y/0123456789abcdef/abcdefghijklmnop/'
```

---

## Update URL and updates.xml

When an extension is installed via browser policy, the policy URL bootstraps the first install check. Subsequent updates rely on the packaged extension manifest's `update_url` unless browser-specific management policy overrides it. This repo keeps both set to the same canonical `https://autocr.nicx.me/updates.xml` endpoint.

### How it connects

1. The installer writes a policy value: `<extension-id>;<update-url>`
2. `extension/manifest.json` also includes `"update_url": "https://autocr.nicx.me/updates.xml"`
3. The browser uses that URL for ongoing update checks (approximately every few hours)
4. The XML tells the browser which version is available and where to download the CRX

The project does **not** currently use an `ExtensionSettings` / `override_update_url` policy override, so keeping the policy URL and manifest `update_url` identical is part of the release contract.

### updates.xml format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="abcdefghijklmnopabcdefghijklmnop">
    <updatecheck
      codebase="https://github.com/NICxKMS/auto-coursera/releases/download/vX.Y.Z/auto_coursera_X.Y.Z.crx"
      version="X.Y.Z"/>
  </app>
</gupdate>
```

| Field | Value |
|---|---|
| `appid` | The 32-character extension ID (must match the signing key) |
| `codebase` | Full URL to the CRX file |
| `version` | Semver version of the CRX at that URL |

### Generating updates.xml for local/manual testing

The canonical `updates.xml` is generated by `sync-constants.sh` from `version.json` and served as a static file at `https://autocr.nicx.me/updates.xml` via Cloudflare Pages.

To generate a local test fixture manually:

```bash
VERSION=$(jq -r .version version.json)
EXT_ID=$(jq -r .extensionId version.json)

cat > updates.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${EXT_ID}">
    <updatecheck codebase="https://github.com/NICxKMS/auto-coursera/releases/download/v${VERSION}/auto_coursera_${VERSION}.crx" version="${VERSION}"/>
  </app>
</gupdate>
EOF
```

### Update check behavior

- Browsers check the update URL approximately every few hours
- If `updates.xml` is unreachable, the browser retries later (extension stays at current version)
- If the version in `updates.xml` is **higher** than installed, the browser downloads the CRX
- If the version is the **same or lower**, no download occurs
- The browser verifies the CRX signature matches the extension ID before installing

---

## CRX3 File Format

A CRX3 file is a binary container. The format is:

```mermaid
block-beta
    columns 1
    A["Magic number: 'Cr24' — 4 bytes"]
    B["Version: 3 — 4 bytes, little-endian"]
    C["Header length — 4 bytes, little-endian"]
    D["Protobuf header — variable length\n(RSA signature, Public key DER, Signature algorithm ID)"]
    E["ZIP payload — remainder of file\n(manifest.json, background.js, content.js, popup.html, assets/)"]
```

| Section | Size | Description |
|---|---|---|
| Magic number | 4 bytes | `Cr24` — identifies this as a CRX file |
| Version | 4 bytes (LE) | CRX format version (3) |
| Header length | 4 bytes (LE) | Size of the protobuf header |
| Protobuf header | Variable | RSA signature + Public key (DER) + Algorithm ID |
| ZIP payload | Remainder | Standard ZIP archive of extension source |

### Verification

The `verify-crx.sh` script checks a CRX file:

```bash
bash scripts/verify-crx.sh auto_coursera_1.9.1.crx
```

It verifies:

1. File exists and is readable
2. Starts with `Cr24` magic bytes
3. CRX version is 3
4. Extracts and displays the manifest version
5. Reports file size
6. Computes and displays SHA-256 checksum

### Packaging

The `package-crx.sh` script creates a CRX3 file:

```bash
bash scripts/package-crx.sh -v 1.9.1 -k extension-key.pem
```

It uses `npx crx3` to:

1. Read the extension source from `extension/dist/`
2. Update the version in `manifest.json` to the specified version
3. Create a ZIP of the source directory
4. Sign the ZIP with the private key
5. Package into CRX3 format
6. Generate a SHA-256 checksum file

Output files:

```
auto_coursera_1.9.1.crx         # Signed CRX3 file
auto_coursera_1.9.1.crx.sha256  # SHA-256 checksum
```

---

## Key Security

The private key is the single root of trust for the extension. Whoever holds the key can publish updates that all users will automatically install.

### Rules

| ✅ Do | ❌ Do Not |
|---|---|
| Store the PEM content in GitHub Secrets as `EXTENSION_PRIVATE_KEY` | Commit the `.pem` file to the repository |
| Keep a local backup in a password manager or encrypted vault | Share the key over unencrypted channels |
| Set file permissions to `600` on any machine where the key exists | Store the key in plaintext on shared drives |
| Rotate the key if you suspect it has been compromised | Leave the key on CI/CD runners after builds |

### .gitignore

The repository's `.gitignore` already excludes private keys:

```
*.pem
extension-key.pem
```

### CI/CD handling

In GitHub Actions, the key content is written to a temporary file, used for signing, and deleted in an `always` cleanup step:

```yaml
- name: Write signing key
  run: echo "${{ secrets.EXTENSION_PRIVATE_KEY }}" > extension-key.pem

# ... signing steps ...

- name: Cleanup signing key
  if: always()
  run: rm -f extension-key.pem
```

---

## What Happens If the Key Is Lost

If the private key is lost (deleted, corrupted, or the backup is unreachable):

1. **A new key must be generated** — `bash scripts/generate-key.sh`
2. **The new key produces a different extension ID** — because the ID is derived from the key
3. **All browser policies become invalid** — they reference the old extension ID
4. **Users must reinstall** — every machine with the old policy needs:
   - Old policy removed (via uninstall script or manually)
   - New policy applied with the new extension ID
5. **All configuration must be updated** — the new extension ID must replace the old one in every file, GitHub Secrets, `wrangler.toml`, and any local/manual `updates.xml` fixtures

In short: **losing the key breaks the entire deployment for all existing users.** Back it up.

### Recovery checklist (if key is lost)

1. Generate new key: `bash scripts/generate-key.sh`
2. Note the new extension ID from the output
3. Replace old ID with new ID in all files (see [SETUP.md](./SETUP.md#4-configure-extension-id))
4. Update `EXTENSION_ID` and `EXTENSION_PRIVATE_KEY` GitHub Secrets
5. Rebuild and release: `git tag v<next-version> && git push auto-coursera v<next-version>`
6. Notify users to run the install script/installer again
7. Users should run the uninstall script first to clear the old policy, then reinstall
