# Cloudflare Setup

> Complete Cloudflare configuration for the Auto-Coursera Assistant distribution platform.

---

## Table of Contents

- [Account Setup](#1-account-setup)
- [R2 Bucket Creation](#2-r2-bucket-creation)
- [R2 Custom Domain Setup](#3-r2-custom-domain-setup)
- [R2 CORS Configuration](#4-r2-cors-configuration)
- [Cloudflare Pages Setup](#5-cloudflare-pages-setup)
- [Worker Deployment](#6-worker-deployment)
- [DNS Configuration](#7-dns-configuration)
- [Cache Rules](#8-cache-rules)
- [WAF Rate Limiting](#9-waf-rate-limiting)
- [SSL/TLS Configuration](#10-ssltls-configuration)
- [API Token Permissions](#11-api-token-permissions)

---

## 1. Account Setup

### Create account

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. Sign up with email and password
3. Free plan is sufficient for this project

### Add domain

1. Go to **Websites** → **Add a site**
2. Enter your domain: `nicx.me`
3. Select the **Free** plan
4. Cloudflare scans existing DNS records — review and confirm
5. Cloudflare provides two nameservers (e.g., `ivy.ns.cloudflare.com`, `noah.ns.cloudflare.com`)
6. Go to your domain registrar and replace the existing nameservers with Cloudflare's
7. Return to Cloudflare and click **Check nameservers**
8. Wait for propagation — status changes from "Pending" to "Active"

---

## 2. R2 Bucket Creation

### Via Wrangler CLI

```bash
# Login to Cloudflare (opens browser)
wrangler login

# Create the extensions bucket (CRX files + updates.xml)
wrangler r2 bucket create extensions-bucket

# Create the releases bucket (installer binaries)
wrangler r2 bucket create releases-bucket

# Verify
wrangler r2 bucket list
```

### Via Dashboard

1. Go to **Cloudflare Dashboard** → **R2 Object Storage**
2. Click **Create bucket**
3. Bucket name: `extensions-bucket`
4. Location: **Automatic** (or choose a region close to your users)
5. Click **Create bucket**
6. Repeat for `releases-bucket`

### Bucket purposes

| Bucket | Contents | Access |
|---|---|---|
| `extensions-bucket` | `updates.xml`, `releases/*.crx`, `releases/*.crx.sha256` | Public via custom domain (`cdn.autocr.nicx.me`) |
| `releases-bucket` | `installer-windows-amd64.exe`, `installer-macos-arm64`, `installer-linux-amd64`, checksums | Private — accessed only via Workers R2 binding |

---

## 3. R2 Custom Domain Setup

The `extensions-bucket` needs a public custom domain so browsers can fetch `updates.xml` and CRX files directly.

### Steps

1. Go to **R2 Object Storage** → **extensions-bucket** → **Settings**
2. Scroll to **Custom Domains**
3. Click **Connect Domain**
4. Enter: `cdn.autocr.nicx.me`
5. Click **Continue**
6. Cloudflare automatically:
   - Creates a CNAME DNS record for `cdn.autocr.nicx.me`
   - Provisions an SSL certificate
   - Enables public access to the bucket via this domain
7. Wait for status to show **Active** (usually under 2 minutes)

### Verify

```bash
# Should resolve to Cloudflare
dig cdn.autocr.nicx.me CNAME

# Should return a Cloudflare response (403 or 404 is normal for empty bucket)
curl -I https://cdn.autocr.nicx.me/
```

### Upload test file

```bash
echo "test" | wrangler r2 object put extensions-bucket/test.txt --pipe

# Should return 200 with "test"
curl https://cdn.autocr.nicx.me/test.txt

# Clean up
wrangler r2 object delete extensions-bucket/test.txt
```

> The `releases-bucket` does **not** need a custom domain. The Workers API reads from it via its R2 binding and streams files to clients.

---

## 4. R2 CORS Configuration

CORS must be configured on the `extensions-bucket` so the website at `autocr.nicx.me` can make cross-origin requests (e.g., to check if `updates.xml` exists or fetch CRX metadata).

### Via Dashboard

1. Go to **R2** → **extensions-bucket** → **Settings**
2. Scroll to **CORS Policy**
3. Click **Add CORS policy** (or **Edit**)
4. Paste this JSON:

```json
[
  {
    "AllowedOrigins": ["https://autocr.nicx.me"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

5. Click **Save**

### Via Wrangler (if available)

```bash
cat > /tmp/cors.json << 'EOF'
[
  {
    "AllowedOrigins": ["https://autocr.nicx.me"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
EOF

wrangler r2 bucket cors put extensions-bucket --file /tmp/cors.json
```

### What this allows

- `GET` and `HEAD` requests from `https://autocr.nicx.me`
- All request headers
- Preflight response cached for 24 hours

### What about the browser's direct CRX fetch?

When the browser downloads a CRX from `updates.xml`, it is **not** a cross-origin XHR — the browser fetches it directly as a binary download. CORS does not apply to this. CORS is only needed for JavaScript `fetch()` calls from the website.

---

## 5. Cloudflare Pages Setup

### Create project (GitHub integration)

1. Go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select the GitHub repository: `nicx/auto-coursera`
3. Configure:

| Setting | Value |
|---|---|
| **Project name** | `auto-coursera` |
| **Production branch** | `main` |
| **Framework preset** | Astro |
| **Build command** | `cd website && pnpm install && pnpm build` |
| **Build output directory** | `website/dist` |
| **Root directory** | *(leave empty — not `website/`)* |
| **Node.js version** | 20 (set via environment variable `NODE_VERSION=20`) |

4. Under **Environment variables**, add:

| Variable | Value |
|---|---|
| `NODE_VERSION` | `20` |
| `PNPM_VERSION` | `9` |

5. Click **Save and Deploy**

### Custom domain

1. After project is created, go to project **Settings** → **Custom domains**
2. Click **Set up a custom domain**
3. Enter: `autocr.nicx.me`
4. Cloudflare creates the DNS record and provisions SSL
5. Status should show **Active** within a few minutes

### Headers and redirects

The website includes `_headers` and `_redirects` files that Cloudflare Pages reads automatically:

- `website/_headers` — security headers (HSTS, CSP, X-Frame-Options)
- `website/_redirects` — shortcut URLs (e.g., `/download/windows` → API redirect)

These files are deployed to the build output and processed by Cloudflare Pages natively.

---

## 6. Worker Deployment

### Deploy via Wrangler

```bash
cd workers
pnpm install
wrangler deploy
```

For production with the configured route:

```bash
wrangler deploy --env production
```

### wrangler.toml configuration

The Worker's configuration is in `workers/wrangler.toml`:

```toml
name = "auto-coursera-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
EXTENSION_ID = "alojpdnpiddmekflpagdblmaehbdfcge"
CURRENT_VERSION = "1.7.5"
ALLOWED_ORIGIN = "https://autocr.nicx.me"

[[r2_buckets]]
binding = "EXTENSIONS_BUCKET"
bucket_name = "extensions-bucket"

[[r2_buckets]]
binding = "RELEASES_BUCKET"
bucket_name = "releases-bucket"

[env.production]
routes = [
  { pattern = "api.autocr.nicx.me/*", zone_name = "nicx.me" }
]
```

### Route setup

The `[env.production]` block maps `api.autocr.nicx.me/*` to the Worker. When deploying with `--env production`, Wrangler creates the route automatically.

If you need to add or verify routes manually:

1. Go to **Workers & Pages** → **auto-coursera-api** → **Settings** → **Triggers**
2. Under **Routes**, verify: `api.autocr.nicx.me/*` → zone `nicx.me`

### Verify endpoints

```bash
curl -s https://api.autocr.nicx.me/api/latest-version | jq .
curl -s https://api.autocr.nicx.me/api/releases | jq .
curl -s https://api.autocr.nicx.me/api/stats | jq .

# Test CORS preflight
curl -s -X OPTIONS \
  -H "Origin: https://autocr.nicx.me" \
  -H "Access-Control-Request-Method: GET" \
  -I https://api.autocr.nicx.me/api/latest-version
# Should include Access-Control-Allow-Origin: https://autocr.nicx.me
```

---

## 7. DNS Configuration

All DNS records should be in Cloudflare DNS for `nicx.me`. The following records are needed:

| Type | Name | Target | Proxy | Notes |
|---|---|---|---|---|
| CNAME | `autocr` | `auto-coursera.pages.dev` | ☁️ Proxied | Cloudflare Pages custom domain (auto-created) |
| CNAME | `cdn.autocr` | *(R2 custom domain target)* | ☁️ Proxied | R2 bucket custom domain (auto-created) |
| — | `api.autocr` | *(Worker route, no DNS record needed)* | — | Worker route handles this via zone routing |

### How each subdomain resolves

**`autocr.nicx.me`** → Cloudflare Pages

- Pages custom domain creates a CNAME from `autocr.nicx.me` to `auto-coursera.pages.dev`
- Cloudflare proxy handles SSL termination and caching

**`cdn.autocr.nicx.me`** → R2 Bucket

- R2 custom domain creates a CNAME record automatically
- Cloudflare proxy serves objects from the `extensions-bucket` R2 bucket
- SSL is handled by Cloudflare

**`api.autocr.nicx.me`** → Cloudflare Worker

- Worker routes map `api.autocr.nicx.me/*` to the `auto-coursera-api` Worker
- The Worker responds to requests matching this pattern
- A DNS record for the zone root is required (the `nicx.me` A/AAAA record or a proxied placeholder); no separate `api` CNAME is needed when using Worker routes on a zone already in Cloudflare

### Verify DNS resolution

```bash
dig autocr.nicx.me CNAME +short
dig cdn.autocr.nicx.me CNAME +short

# API verification (should respond with JSON)
curl -s https://api.autocr.nicx.me/api/stats
```

---

## 8. Cache Rules

Proper caching ensures fast delivery while allowing timely updates.

### R2 objects (cdn.autocr.nicx.me)

Configure cache rules for the `cdn.autocr.nicx.me` hostname in **Cloudflare Dashboard** → **Caching** → **Cache Rules**:

#### Rule 1: updates.xml — Short cache

| Setting | Value |
|---|---|
| **Rule name** | R2 updates.xml short cache |
| **When** | Hostname equals `cdn.autocr.nicx.me` AND URI Path equals `/updates.xml` |
| **Then** | Eligible for cache: Yes |
| **Edge TTL** | 5 minutes (300 seconds) |
| **Browser TTL** | 5 minutes (300 seconds) |

**Rationale:** Browsers poll `updates.xml` to discover new extension versions. A 5-minute TTL balances freshness (new versions propagate quickly) against origin load.

#### Rule 2: CRX files — Long cache

| Setting | Value |
|---|---|
| **Rule name** | R2 CRX long cache |
| **When** | Hostname equals `cdn.autocr.nicx.me` AND URI Path contains `.crx` |
| **Then** | Eligible for cache: Yes |
| **Edge TTL** | 24 hours (86400 seconds) |
| **Browser TTL** | 24 hours (86400 seconds) |

**Rationale:** CRX files are immutable — each version has a unique filename (`auto_coursera_1.7.5.crx`). They never change after upload, so long caching is safe.

### API responses (api.autocr.nicx.me)

The Worker does not set `Cache-Control` headers by default, so responses are not cached at Cloudflare's edge. This is correct for the API — it always reads live data from R2.

If you want to cache API responses, add a Cache Rule:

| Setting | Value |
|---|---|
| **When** | Hostname equals `api.autocr.nicx.me` AND URI Path starts with `/api/` |
| **Edge TTL** | 5 minutes |
| **Browser TTL** | 1 minute |

### How to create cache rules in the Dashboard

1. Go to **Cloudflare Dashboard** → your domain → **Caching** → **Cache Rules**
2. Click **Create rule**
3. Name the rule (e.g., "R2 updates.xml short cache")
4. Under **When incoming requests match...**, add field conditions:
   - Field: **Hostname** → Operator: **equals** → Value: `cdn.autocr.nicx.me`
   - AND Field: **URI Path** → Operator: **equals** → Value: `/updates.xml`
5. Under **Then...**, set:
   - **Eligible for cache**: Check
   - **Edge TTL**: Override → 300 seconds
   - **Browser TTL**: Override → 300 seconds
6. Click **Deploy**
7. Repeat for the CRX file rule

---

## 9. WAF Rate Limiting

Protect the API and download endpoints from abuse.

### Configure rate limiting rules

Go to **Cloudflare Dashboard** → your domain → **Security** → **WAF** → **Rate limiting rules**.

#### Rule 1: Download endpoint

| Setting | Value |
|---|---|
| **Rule name** | Rate limit downloads |
| **When** | Hostname equals `api.autocr.nicx.me` AND URI Path starts with `/api/download/` |
| **Characteristics** | IP address |
| **Rate** | 10 requests per 1 minute |
| **Action** | Block (returns 429) |
| **Duration** | 1 minute |

**Rationale:** Installer downloads are large binary files. 10 per minute per IP is generous for legitimate use and prevents bandwidth abuse.

#### Rule 2: General API

| Setting | Value |
|---|---|
| **Rule name** | Rate limit API |
| **When** | Hostname equals `api.autocr.nicx.me` AND URI Path starts with `/api/` |
| **Characteristics** | IP address |
| **Rate** | 60 requests per 1 minute |
| **Action** | Block (returns 429) |
| **Duration** | 1 minute |

**Rationale:** The website makes a few API calls per page load. 60/min covers normal browsing and provides headroom.

### How to create rate limiting rules

1. Go to **Security** → **WAF** → **Rate limiting rules**
2. Click **Create rule**
3. Configure the expression using the Builder:
   - Field: **Hostname** → Operator: **equals** → Value: `api.autocr.nicx.me`
   - AND Field: **URI Path** → Operator: **starts with** → Value: `/api/download/`
4. Set **Counting expression characteristics**: IP address
5. Set **Rate**: 10 requests per 1 minute
6. Set **Action**: Block
7. Set **Mitigation timeout**: 60 seconds
8. Click **Deploy**

---

## 10. SSL/TLS Configuration

### Recommended settings

Go to **Cloudflare Dashboard** → your domain → **SSL/TLS**.

| Setting | Location | Value |
|---|---|---|
| **Encryption mode** | SSL/TLS → Overview | Full (strict) |
| **Always Use HTTPS** | SSL/TLS → Edge Certificates | Enabled |
| **Minimum TLS Version** | SSL/TLS → Edge Certificates | TLS 1.2 |
| **TLS 1.3** | SSL/TLS → Edge Certificates | Enabled |
| **Automatic HTTPS Rewrites** | SSL/TLS → Edge Certificates | Enabled |
| **HSTS** | SSL/TLS → Edge Certificates | Enabled (max-age: 12 months, include subdomains, preload) |

### Why Full (strict)?

- **Full** mode encrypts traffic between the client and Cloudflare, and between Cloudflare and the origin
- **Strict** mode additionally validates the origin certificate
- Since Pages, Workers, and R2 custom domains all use Cloudflare-issued certificates, Full (strict) works out of the box

### Certificate coverage

| Domain | Certificate Source |
|---|---|
| `autocr.nicx.me` | Cloudflare Pages (automatic) |
| `cdn.autocr.nicx.me` | R2 custom domain (automatic) |
| `api.autocr.nicx.me` | Worker route on proxied zone (automatic) |

All certificates are managed by Cloudflare — no manual certificate configuration needed.

---

## 11. API Token Permissions

The CI/CD pipeline uses a single Cloudflare API token with these permissions:

### Required permissions

| Scope | Resource | Permission | Used for |
|---|---|---|---|
| Account | Cloudflare Pages | Edit | Deploying the website |
| Account | Workers R2 Storage | Edit | Uploading CRX files and installers to R2 |
| Account | Workers Scripts | Edit | Deploying the Workers API |

### Create the token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Click **Get started** under "Custom token"
4. Token name: `auto-coursera-ci` (or similar)
5. **Permissions** (click "Add more" to add multiple):
   - Account → Cloudflare Pages → Edit
   - Account → Workers R2 Storage → Edit
   - Account → Workers Scripts → Edit
6. **Account Resources**: Include → your account
7. **Zone Resources**: Include → Specific zone → `nicx.me`
8. **Client IP Address Filtering**: *(optional — leave empty unless you restrict CI runners)*
9. **TTL**: *(optional — set an expiration if desired)*
10. Click **Continue to summary**
11. Review and click **Create Token**
12. **Copy the token immediately** — it is displayed only once
13. Store it as the `CF_API_TOKEN` GitHub Secret

### Verify the token

```bash
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Expected response:

```json
{
  "result": { "status": "active" },
  "success": true
}
```

### Token rotation

Rotate the token periodically (every 90 days is a reasonable interval):

1. Create a new token with the same permissions
2. Update the `CF_API_TOKEN` GitHub Secret
3. Revoke the old token in the Cloudflare dashboard
