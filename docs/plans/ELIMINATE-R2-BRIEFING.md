> ✅ **IMPLEMENTED** — This plan was fully implemented on 2026-03-10. See CHANGELOG.md for details.
>
> ⚠️ **SUPERSEDED** — The Cloudflare Worker described here was itself eliminated in a later migration. All infrastructure now runs on static Cloudflare Pages at `autocr.nicx.me`. Domain references below are historical.

# Odin Briefing: Eliminate R2 — Option E Implementation

> **Prepared by**: Thoth (Research Agent)
> **Date**: 2026-03-10
> **Priority**: Implementation ready — user approved

---

## TL;DR

Eliminate both R2 buckets. Move all binaries to GitHub Releases. Worker generates `updates.xml` dynamically and redirects downloads to GitHub. Zero storage infrastructure.

## Key Documents

1. **Full Implementation Plan**: `docs/plans/ELIMINATE-R2.md` — contains complete code for every file change, phase-by-phase steps, validation checklists, rollback plan, risk assessment
2. **Research Report**: `docs/research/GITHUB-RELEASES-VS-R2.md` — full comparison of all options (A-F) with evidence

## What to Implement

### Phase 1 — Move Installers to GitHub Releases
1. Add `softprops/action-gh-release@v2` step to CI
2. Replace R2 streaming in `download.ts` with 302 redirects to GitHub
3. Add `GITHUB_REPO` var to `wrangler.toml`
4. Remove `RELEASES_BUCKET` R2 binding
5. Delete `releases-bucket` after validation

### Phase 2 — Eliminate R2 Entirely
1. Create `workers/src/routes/cdn.ts` — `handleUpdatesXml()` + `handleCdnRelease()`
2. Create `workers/src/utils/github.ts` — `fetchGitHubReleases()` with Cache API
3. Rewrite `index.ts` — dual-domain routing (API + CDN)
4. Rewrite `releases.ts`, `stats.ts`, `version.ts` — GitHub API backed
5. Add CDN route to `wrangler.toml`
6. Remove all R2 bindings and CI upload steps
7. Delete `workers/src/utils/r2.ts`
8. DNS: Remove R2 custom domain, Worker route takes over

## Files That Change

See `docs/plans/ELIMINATE-R2.md` → [File Change Inventory] section for the complete matrix.

## Critical Constraints

- `autocr-cdn.nicx.me/updates.xml` URL MUST remain accessible — it's hardcoded in every installed browser policy
- All API response shapes (`/api/releases`, `/api/stats`, `/api/latest-version`) must remain backwards-compatible
- CRX signing still happens in CI (unchanged)
- `GITHUB_REPO` var is set to `NICxKMS/auto-coursera`

## GitHub Repo Name

The `GITHUB_REPO` variable is set to `NICxKMS/auto-coursera`.
