# Extension Governance

> Current contributor guide for the cleaned extension architecture.
>
> Use this file with [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) and [`extension/README.md`](../extension/README.md).

---

## Table of Contents

- [Audience and scope](#audience-and-scope)
- [Normative sources](#normative-sources)
- [Extension module boundaries](#extension-module-boundaries)
  - [Background bootstrap vs background services](#background-bootstrap-vs-background-services)
  - [Shared runtime projection](#shared-runtime-projection)
  - [Canonical batch contract](#canonical-batch-contract)
  - [Shared settings workflow controller](#shared-settings-workflow-controller)
- [Release governance](#release-governance)
- [Historical vs current docs](#historical-vs-current-docs)
- [Change checklist for contributors](#change-checklist-for-contributors)

---

## Audience and scope

This guide is for contributors who change the browser extension in `extension/src/`.

It documents the current architectural boundaries. These boundaries are governance, not suggestions. If a change crosses one of them, update this document and the related architecture docs in the same pull request.

---

## Normative sources

Use these files in this order:

1. **[`docs/EXTENSION-GOVERNANCE.md`](./EXTENSION-GOVERNANCE.md)** — contributor rules and invariants
2. **[`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)** — repository and platform architecture
3. **[`extension/README.md`](../extension/README.md)** — extension-focused setup and module map
4. **[`CHANGELOG.md`](../CHANGELOG.md)** — release history

---

## Extension module boundaries

### Background bootstrap vs background services

`extension/src/background/background.ts` is the **bootstrap and wiring layer only**.

It may:

- create shared service instances
- register message routes
- register Chrome event listeners
- expose test helpers through `__testing`

It must not become the place where new business logic accumulates.

Current service boundaries:

| Path | Responsibility |
|---|---|
| `background/background.ts` | Compose dependencies and wire routes/listeners |
| `background/message-handlers.ts` | Message routing, payload validation, sender authorization, and per-type handler logic |
| `background/lifecycle.ts` | install/startup/alarm/storage/command/tab lifecycle orchestration |
| `background/provider-service.ts` | live provider initialization, reload, and staged test-context creation |
| `background/runtime-state.ts` | mutable runtime write model, scope resolution, registration helpers, and cancellation/recovery state |

**Contributor rule:** when adding behavior, put it in the narrowest existing module that already owns that concern. If no module owns it, add a focused module instead of growing `background.ts`.

### Shared runtime projection

`extension/src/background/runtime-state.ts` is the **write authority** for runtime state.

`extension/src/runtime/projection.ts` is the **read-model layer** for UI semantics.

Today, popup and widget state interpretation must flow through `projectRuntimeReadModel()`. That function owns the shared meaning of:

- disabled vs enabled
- stale active state collapsing back to `idle`
- default counters and display-safe fallbacks
- scoped runtime lookup via `resolveRuntimeStateForScope()`

**Contributor rule:** do not re-derive runtime UI semantics separately in popup, widget, or future surfaces. Reuse the projection layer or extend it first.

### Canonical batch contract

The batch solve/apply flow uses `selectionMode` as the canonical answer-modality field.

Allowed values:

| Value | Meaning |
|---|---|
| `single` | exactly one choice |
| `multiple` | select all that apply |
| `text-input` | free-form/text entry |
| `unknown` | fallback when the modality cannot be determined yet |

Current ownership by layer:

| Path | Responsibility |
|---|---|
| `content/question-contract.ts` | derive `selectionMode` and media presence from DOM signals |
| `content/extractor.ts` | own the live solve/apply `selectionMode` derivation path and carry it forward |
| `content/detector.ts` | detect candidate question containers only; do not become a second modality classifier |
| `content/content.ts` | send batch payloads with `selectionMode` |
| `background/message-handlers.ts` | reject invalid batch payloads before runtime-state mutation |
| `services/prompt-engine.ts` | translate `selectionMode` into prompt instructions |
| `services/response-parser.ts` | stay decoupled from legacy taxonomy assumptions |

Images are a separate concern. Do not encode image presence by inventing a fake question type.

**Contributor rule:** for batch solve/apply work, treat `selectionMode` as canonical. Do not reintroduce `questionType` as the primary batch contract, and do not split live modality derivation back across both detection and extraction layers.

### Shared settings workflow controller

`extension/src/settings/domain.ts` owns the shared settings-domain behavior.

It currently provides:

- provider metadata and model catalogs
- masked API-key placeholder logic
- onboarding state and provider availability derivation
- staged save payload builders
- staged `TEST_CONNECTION` payload builders
- `createSettingsWorkflowController()` for load/save/test orchestration

UI surfaces are thin hosts:

| Path | Role |
|---|---|
| `ui/settings-overlay.ts` | sole in-page settings surface |
| `ui/widget-panel.ts` | consumes derived onboarding state |

The background remains the live runtime authority:

| Path | Role |
|---|---|
| `background/provider-service.ts` | live provider manager and reload path |
| `background/message-handlers.ts` | `TEST_CONNECTION` boundary and request execution |

`TEST_CONNECTION` now exercises the same provider **batch** execution contract as live solving by sending a one-question staged batch through the background-owned provider manager. There is no separate single-question provider contract in the extension core anymore.

**Contributor rule:** do not duplicate provider catalogs, onboarding logic, or staged save/test logic in UI code. Do not move live provider authority out of the background service path, and do not reintroduce a separate single-question provider surface for connection testing.

---

## Release governance

Release and deploy rules live in `.github/workflows/deploy.yml` and are part of the architecture.

Current invariants:

1. `version-check` runs before both website and tag-release paths.
2. A `v*` tag reruns the same extension quality gates used in PR validation: `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
3. The tagged installer path reruns `go vet ./...` before cross-platform builds.
4. `create-release` must finish before `deploy-website-release` publishes the website.
5. `deploy-website-main` only publishes Pages when the current `version.json` already has a matching published GitHub Release with the expected assets.

**Contributor rule:** do not weaken tagged-release validation below PR validation without an explicit documented decision.

---

## Historical vs current docs

Use the docs directories this way:

| Location | Status | Purpose |
|---|---|---|
| `docs/ARCHITECTURE.md` | Current | repository and platform reference |
| `docs/SETUP.md` | Current | operator setup and release walkthrough |
| `docs/EXTENSION-GOVERNANCE.md` | Current | contributor guardrails for extension changes |

---

## Change checklist for contributors

Before merging an extension architecture change:

- Update `docs/EXTENSION-GOVERNANCE.md` if a boundary changed
- Update `docs/ARCHITECTURE.md` if the repository-level story changed
- Update `extension/README.md` if the module map or developer workflow changed
- Update `CHANGELOG.md` when the change is release-relevant
- Keep historical docs historical; do not silently treat them as the new source of truth

That is the contributor contract.
