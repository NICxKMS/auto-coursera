# Changelog — Auto-Coursera Extension

All notable changes to the browser extension are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.7.5] — 2026-03-09

### Added
- **Multi-provider AI support** — OpenRouter, NVIDIA NIM, Gemini, Groq, Cerebras
- Base provider abstraction (`base-provider.ts`) for unified AI interaction
- AI provider factory (`ai-provider.ts`) with automatic provider selection
- **Prompt engine** (`prompt-engine.ts`) — question-type-aware prompt construction
- **Response parser** (`response-parser.ts`) — structured answer extraction from LLM output
- **Image pipeline** (`image-pipeline.ts`) — captures and encodes question images for vision models
- **Content detection** — automatic quiz/assignment page detection on Coursera
- **Question extractor** — parses MCQ, checkbox, text, and dropdown question formats
- **Answer selector** (`selector.ts`) — programmatic answer selection in page DOM
- **Circuit breaker** (`circuit-breaker.ts`) — fault tolerance for API calls
- **Rate limiter** (`rate-limiter.ts`) — per-provider request throttling
- Background service worker with message router (`background.ts`, `router.ts`)
- Popup UI with provider status, scan controls, and keyboard shortcut hints
- Options page for API key configuration and provider selection
- Injected CSS for answer highlight styling (`inject.css`)
- Keyboard shortcuts: `Alt+Shift+C` (popup), `Alt+Shift+S` (scan page)
- Chrome storage wrapper (`storage.ts`) with typed settings
- Structured logging utility (`logger.ts`)
- Full unit test suite (16 test files) with Vitest
- Chrome mock setup for test environment (`tests/mocks/chrome.ts`)

### Technical
- Chrome Manifest V3 with service worker architecture
- TypeScript strict mode, Webpack bundling
- Biome for formatting, ESLint for linting
- Supports `coursera.org` host with CloudFront CDN image access
