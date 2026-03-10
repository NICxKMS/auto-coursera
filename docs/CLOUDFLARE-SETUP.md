# Cloudflare Setup

> Complete Cloudflare configuration for the Auto-Coursera Assistant distribution platform.

---

## Table of Contents

- [Account Setup](#1-account-setup)
- [Cloudflare Pages Setup](#2-cloudflare-pages-setup)
- [Worker Deployment](#3-worker-deployment)
- [DNS Configuration](#4-dns-configuration)
- [Cache Rules](#5-cache-rules)
- [WAF Rate Limiting](#6-waf-rate-limiting)
- [SSL/TLS Configuration](#7-ssltls-configuration)
- [API Token Permissions](#8-api-token-permissions)

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

## 2. Cloudflare Pages Setup

### Create project (GitHub integration)

1. Go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select the GitHub repository: `NICxKMS/auto-coursera`
3. Configure:

| Setting | Value |
|---|---|
| **Project name** | `auto-coursera` |
| **Production branch** | `master` |
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

- `website/public/_headers` — security headers (HSTS, CSP, X-Frame-Options)
- `website/public/_redirects` — shortcut URLs (e.g., `/download/windows` → API redirect)

These files are deployed to the build output and processed by Cloudflare Pages natively.

---

## 3. Worker Deployment

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
compatibility_date = "2025-06-01"
compatibility_flags = ["nodejs_compat"]

[vars]
EXTENSION_ID = "alojpdnpiddmekflpagdblmaehbdfcge"
CURRENT_VERSION = "1.8.0"
ALLOWED_ORIGIN = "https://autocr.nicx.me"
CDN_BASE_URL = "https://autocr-cdn.nicx.me"
GITHUB_REPO = "NICxKMS/auto-coursera"

[env.production]
routes = [
  { pattern = "autocr-api.nicx.me/*", zone_name = "nicx.me" },
  { pattern = "autocr-cdn.nicx.me/*", zone_name = "nicx.me" }
]
```

### Route setup

The `[env.production]` block maps both `autocr-api.nicx.me/*` and `autocr-cdn.nicx.me/*` to the Worker. When deploying with `--env production`, Wrangler creates the routes automatically.

If you need to add or verify routes manually:

1. Go to **Workers & Pages** → **auto-coursera-api** → **Settings** → **Triggers**
2. Under **Routes**, verify both:
  - `autocr-api.nicx.me/*` → zone `nicx.me`
  - `autocr-cdn.nicx.me/*` → zone `nicx.me`

### Verify endpoints

```bash
curl -s https://autocr-api.nicx.me/api/latest-version | jq .
curl -s https://autocr-api.nicx.me/api/releases | jq .
curl -s https://autocr-api.nicx.me/api/stats | jq .

# Test CORS preflight
curl -s -X OPTIONS \
  -H "Origin: https://autocr.nicx.me" \
  -H "Access-Control-Request-Method: GET" \
  -I https://autocr-api.nicx.me/api/latest-version
# Should include Access-Control-Allow-Origin: https://autocr.nicx.me
```

---

## 4. DNS Configuration

All DNS records should be in Cloudflare DNS for `nicx.me`. The following records are needed:

| Type | Name | Target | Proxy | Notes |
|---|---|---|---|---|
| CNAME | `autocr` | `auto-coursera.pages.dev` | ☁️ Proxied | Cloudflare Pages custom domain (auto-created) |
| — | `autocr-cdn` | *(Worker route, no separate DNS record needed)* | — | Worker route handles this via zone routing |
| — | `autocr-api` | *(Worker route, no DNS record needed)* | — | Worker route handles this via zone routing |

### How each subdomain resolves

**`autocr.nicx.me`** → Cloudflare Pages

- Pages custom domain creates a CNAME from `autocr.nicx.me` to `auto-coursera.pages.dev`
- Cloudflare proxy handles SSL termination and caching

**`autocr-cdn.nicx.me`** → Cloudflare Worker

- Worker route maps `autocr-cdn.nicx.me/*` to the `auto-coursera-api` Worker
- The Worker generates `updates.xml` dynamically and redirects CRX downloads to GitHub Releases
- SSL is handled by Cloudflare

**`autocr-api.nicx.me`** → Cloudflare Worker

- Worker routes map `autocr-api.nicx.me/*` to the `auto-coursera-api` Worker
- The Worker responds to requests matching this pattern
- A DNS record for the zone root is required (the `nicx.me` A/AAAA record or a proxied placeholder); no separate `api` CNAME is needed when using Worker routes on a zone already in Cloudflare

### Verify DNS resolution

```bash
dig autocr.nicx.me CNAME +short
curl -I https://autocr-cdn.nicx.me/updates.xml

# API verification (should respond with JSON)
curl -s https://autocr-api.nicx.me/api/stats
```

---

## 5. Cache Rules

Proper caching ensures fast delivery while allowing timely updates.

### CDN responses (autocr-cdn.nicx.me)

The CDN domain is now served by the Worker, which generates `updates.xml` dynamically and redirects CRX downloads to GitHub Releases. Cache rules for the CDN domain are simpler:

#### Rule 1: updates.xml — Short cache

| Setting | Value |
|---|---|
| **Rule name** | CDN updates.xml short cache |
| **When** | Hostname equals `autocr-cdn.nicx.me` AND URI Path equals `/updates.xml` |
| **Then** | Eligible for cache: Yes |
| **Edge TTL** | 5 minutes (300 seconds) |
| **Browser TTL** | 5 minutes (300 seconds) |

**Rationale:** Browsers poll `updates.xml` to discover new extension versions. A 5-minute TTL balances freshness against origin load. The Worker generates this response dynamically from environment variables.

> CRX download requests (`/releases/*.crx`) result in 302 redirects to GitHub Releases. GitHub's own CDN handles caching of the actual binary.

### API responses (autocr-api.nicx.me)

The Worker sets appropriate `Cache-Control` headers. If you want to add edge caching for API responses, add a Cache Rule:

| Setting | Value |
|---|---|
| **When** | Hostname equals `autocr-api.nicx.me` AND URI Path starts with `/api/` |
| **Edge TTL** | 5 minutes |
| **Browser TTL** | 1 minute |

### How to create cache rules in the Dashboard

1. Go to **Cloudflare Dashboard** → your domain → **Caching** → **Cache Rules**
2. Click **Create rule**
3. Name the rule (e.g., "CDN updates.xml short cache")
4. Under **When incoming requests match...**, add field conditions:
   - Field: **Hostname** → Operator: **equals** → Value: `autocr-cdn.nicx.me`
   - AND Field: **URI Path** → Operator: **equals** → Value: `/updates.xml`
5. Under **Then...**, set:
   - **Eligible for cache**: Check
   - **Edge TTL**: Override → 300 seconds
   - **Browser TTL**: Override → 300 seconds
6. Click **Deploy**

---

## 6. WAF Rate Limiting

Protect the API and download endpoints from abuse.

### Configure rate limiting rules

Go to **Cloudflare Dashboard** → your domain → **Security** → **WAF** → **Rate limiting rules**.

#### Rule 1: Download endpoint

| Setting | Value |
|---|---|
| **Rule name** | Rate limit downloads |
| **When** | Hostname equals `autocr-api.nicx.me` AND URI Path starts with `/api/download/` |
| **Characteristics** | IP address |
| **Rate** | 10 requests per 1 minute |
| **Action** | Block (returns 429) |
| **Duration** | 1 minute |

**Rationale:** Installer downloads are large binary files. 10 per minute per IP is generous for legitimate use and prevents bandwidth abuse.

#### Rule 2: General API

| Setting | Value |
|---|---|
| **Rule name** | Rate limit API |
| **When** | Hostname equals `autocr-api.nicx.me` AND URI Path starts with `/api/` |
| **Characteristics** | IP address |
| **Rate** | 60 requests per 1 minute |
| **Action** | Block (returns 429) |
| **Duration** | 1 minute |

**Rationale:** The website makes a few API calls per page load. 60/min covers normal browsing and provides headroom.

### How to create rate limiting rules

1. Go to **Security** → **WAF** → **Rate limiting rules**
2. Click **Create rule**
3. Configure the expression using the Builder:
   - Field: **Hostname** → Operator: **equals** → Value: `autocr-api.nicx.me`
   - AND Field: **URI Path** → Operator: **starts with** → Value: `/api/download/`
4. Set **Counting expression characteristics**: IP address
5. Set **Rate**: 10 requests per 1 minute
6. Set **Action**: Block
7. Set **Mitigation timeout**: 60 seconds
8. Click **Deploy**

---

## 7. SSL/TLS Configuration

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
- Since Pages and Workers all use Cloudflare-issued certificates, Full (strict) works out of the box

### Certificate coverage

| Domain | Certificate Source |
|---|---|
| `autocr.nicx.me` | Cloudflare Pages (automatic) |
| `autocr-cdn.nicx.me` | Worker route on proxied zone (automatic) |
| `autocr-api.nicx.me` | Worker route on proxied zone (automatic) |

All certificates are managed by Cloudflare — no manual certificate configuration needed.

---

## 8. API Token Permissions

The CI/CD pipeline uses a single Cloudflare API token with these permissions:

### Required permissions

| Scope | Resource | Permission | Used for |
|---|---|---|---|
| Account | Cloudflare Pages | Edit | Deploying the website |
| Account | Workers Scripts | Edit | Deploying the Workers API |

### Create the token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Click **Get started** under "Custom token"
4. Token name: `auto-coursera-ci` (or similar)
5. **Permissions** (click "Add more" to add multiple):
   - Account → Cloudflare Pages → Edit
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
