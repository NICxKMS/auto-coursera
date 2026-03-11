# Cloudflare Setup

> Complete Cloudflare configuration for the Auto-Coursera Assistant distribution platform.

---

## Table of Contents

- [Account Setup](#1-account-setup)
- [Cloudflare Pages Setup](#2-cloudflare-pages-setup)
- [DNS Configuration](#3-dns-configuration)
- [Cache Rules](#4-cache-rules)
- [WAF Rate Limiting](#5-waf-rate-limiting)
- [SSL/TLS Configuration](#6-ssltls-configuration)
- [API Token Permissions](#7-api-token-permissions)

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

If you deploy Pages via Wrangler/CI instead of the Git integration, target the production branch explicitly so the deployment binds to the `master` environment and custom domain:

```bash
wrangler pages deploy website/dist --project-name=auto-coursera --branch=master
```

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

## 3. DNS Configuration

All DNS records should be in Cloudflare DNS for `nicx.me`. The following records are needed:

| Type | Name | Target | Proxy | Notes |
|---|---|---|---|---|
| CNAME | `autocr` | `auto-coursera.pages.dev` | ☁️ Proxied | Cloudflare Pages custom domain (auto-created) |

### How the subdomain resolves

**`autocr.nicx.me`** → Cloudflare Pages

- Pages custom domain creates a CNAME from `autocr.nicx.me` to `auto-coursera.pages.dev`
- Cloudflare proxy handles SSL termination and caching
- Serves the static website, install scripts, releases page, and `updates.xml` update manifest

### Verify DNS resolution

```bash
dig autocr.nicx.me CNAME +short
curl -I https://autocr.nicx.me/updates.xml
```

---

## 4. Cache Rules

Proper caching ensures fast delivery while allowing timely updates.

### updates.xml — Short cache

The `updates.xml` file is a static file served by Cloudflare Pages. Browsers poll it to discover new extension versions. A short cache TTL ensures updates propagate quickly.

| Setting | Value |
|---|---|
| **Rule name** | updates.xml short cache |
| **When** | Hostname equals `autocr.nicx.me` AND URI Path equals `/updates.xml` |
| **Then** | Eligible for cache: Yes |
| **Edge TTL** | 5 minutes (300 seconds) |
| **Browser TTL** | 5 minutes (300 seconds) |

**Rationale:** Browsers poll `updates.xml` to discover new extension versions. A 5-minute TTL balances freshness against the fact that this file only changes on new releases.

### How to create cache rules in the Dashboard

1. Go to **Cloudflare Dashboard** → your domain → **Caching** → **Cache Rules**
2. Click **Create rule**
3. Name the rule (e.g., "CDN updates.xml short cache")
4. Under **When incoming requests match...**, add field conditions:
   - Field: **Hostname** → Operator: **equals** → Value: `autocr.nicx.me`
   - AND Field: **URI Path** → Operator: **equals** → Value: `/updates.xml`
5. Under **Then...**, set:
   - **Eligible for cache**: Check
   - **Edge TTL**: Override → 300 seconds
   - **Browser TTL**: Override → 300 seconds
6. Click **Deploy**

---

## 5. WAF Rate Limiting

Protect download endpoints from abuse.

### Configure rate limiting rules

Go to **Cloudflare Dashboard** → your domain → **Security** → **WAF** → **Rate limiting rules**.

#### Rule 1: Static assets

| Setting | Value |
|---|---|
| **Rule name** | Rate limit static assets |
| **When** | Hostname equals `autocr.nicx.me` AND URI Path starts with `/scripts/` |
| **Characteristics** | IP address |
| **Rate** | 30 requests per 1 minute |
| **Action** | Block (returns 429) |
| **Duration** | 1 minute |

**Rationale:** Install script downloads should be infrequent. 30 per minute per IP is generous for legitimate use.

### How to create rate limiting rules

1. Go to **Security** → **WAF** → **Rate limiting rules**
2. Click **Create rule**
3. Configure the expression using the Builder:
   - Field: **Hostname** → Operator: **equals** → Value: `autocr.nicx.me`
   - AND Field: **URI Path** → Operator: **starts with** → Value: `/scripts/`
4. Set **Counting expression characteristics**: IP address
5. Set **Rate**: 30 requests per 1 minute
6. Set **Action**: Block
7. Set **Mitigation timeout**: 60 seconds
8. Click **Deploy**

---

## 6. SSL/TLS Configuration

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
- Since Pages uses Cloudflare-issued certificates, Full (strict) works out of the box

### Certificate coverage

| Domain | Certificate Source |
|---|---|
| `autocr.nicx.me` | Cloudflare Pages (automatic) |

All certificates are managed by Cloudflare — no manual certificate configuration needed.

---

## 7. API Token Permissions

The CI/CD pipeline uses a single Cloudflare API token with these permissions:

### Required permissions

| Scope | Resource | Permission | Used for |
|---|---|---|---|
| Account | Cloudflare Pages | Edit | Deploying the website |

### Create the token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Click **Get started** under "Custom token"
4. Token name: `auto-coursera-ci` (or similar)
5. **Permissions** (click "Add more" to add multiple):
   - Account → Cloudflare Pages → Edit
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
