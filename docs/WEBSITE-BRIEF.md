# Website Redesign Brief

> Research intelligence for the Auto-Coursera website rebuild.
> Every creative, copy, and design decision must trace back to this document.
> Compiled from a full read of the extension codebase at v1.9.1.

---

## Phase 0A -- Research Brief

### Extension Identity

- **Name:** Auto-Coursera Assistant
- **Version:** 1.9.1
- **Manifest:** V3, Chrome extension with service worker architecture
- **Description (from manifest):** "AI-powered answer assistant for e-learning platforms"

### Extension True Purpose (One Sentence)

Auto-Coursera Assistant automatically detects quiz questions on Coursera pages,
sends them to an AI provider, and selects or highlights the correct answers --
turning a manual research-and-click process into a single page load.

### The Exact User Pain It Solves

Coursera learners face graded quizzes where they must:

1. Read each question carefully
2. Open new tabs to research or verify answers
3. Cross-reference course material, videos, and external sources
4. Manually select answers one-by-one
5. Second-guess themselves on confidence
6. Repeat for every question, every quiz, every course

This friction multiplies across courses, especially for working professionals
and students managing multiple certifications simultaneously. The pain isn't
just *answering* -- it's the **cognitive overhead of context-switching** between
learning mode and testing mode.

### The Trigger Moment

The extension activates when the user navigates to any `https://www.coursera.org/*`
page. A `MutationObserver` watches the DOM for quiz question containers matching
`div[data-testid^="part-Submission_"]`. The moment questions appear -- on page
load or SPA navigation (detected via monkey-patched `history.pushState`/
`replaceState`) -- the extension springs to life. The user does nothing. They
just open the quiz.

### The Transformation (Before -> After)

**Before:** You open a Coursera quiz. You see 15 questions. You start
tab-switching, Googling, re-watching lecture segments, second-guessing. Twenty
minutes pass. You submit, uncertain.

**After:** You open a Coursera quiz. A small blue pill appears in the corner.
Within seconds, green highlights ripple through the page. Answers are selected.
A counter ticks up: check-mark 15 solved. You review, adjust if needed, and submit. Two
minutes.

### Target Audience

**Primary:** Online learners on Coursera -- working professionals pursuing
certifications, university students taking supplementary courses, career-changers
consuming course material at scale.

**Secondary:** Power users comfortable with API keys and AI model selection --
people who already use ChatGPT/Claude and want that capability embedded directly
in their browser workflow.

### 3 Specific Concrete Details from Code (for Website Copy)

1. **The 800ms Debounce Batch:** Questions aren't sent one-by-one. The
   `QuestionDetector` uses an 800ms debounce window to batch newly detected
   questions, then sends them as a single payload. This means the extension
   *waits* for all questions to appear before acting -- it's patient, then
   decisive.

2. **The Three-Click Strategy:** When auto-selecting an answer, `selector.ts`
   tries three strategies in sequence: click the `<label>`, dispatch an `input`
   change event, or click the `<input>` directly -- with verification retries.
   This exists because Coursera uses React controlled components that swallow
   normal click events. The extension doesn't just click -- it *negotiates*
   with the page.

3. **The AI Honeypot Filter:** The extractor explicitly filters out
   `div[data-ai-instructions="true"]` elements -- Coursera's AI honeypot traps
   designed to mislead AI assistants. The extension is aware it's being hunted
   and actively evades detection.

### Accent Color Rationale

The extension's brand color is `#0056d2` -- Coursera's own blue, used in the
popup header, toggle switches, and action buttons. This is deliberate: the
extension positions itself as a **companion to Coursera**, not a foreign tool
overlaid on top. The website should use this exact blue as its accent -- it says
"I belong here" without saying a word. For the website, this maps to a deep,
confident academic blue -- not tech-startup cyan, not corporate navy.

### One Strong Narrative Metaphor

**The Scribe in the Examination Hall.**

The extension sits silently in the corner of the page, watching. When questions
appear, it reads them -- all of them -- in a single breath. Then it writes the
answers on the page in green ink, quietly, without disrupting the exam. It
doesn't shout. It doesn't brag. It just *knows*, and it shows you. Like having
a brilliant, invisible study partner who read every textbook and sits beside you
during every quiz, whispering "this one" and moving on.

---

## Full Popup UI Structure

### Popup (300px wide)

- **Header row:** "mortar-board Auto-Coursera" title (left) + enable/disable toggle switch (right)
- **Coursera context** (visible when on coursera.org):
  - Status indicator: colored dot + text (Idle / Processing... / Done / Error / Disabled)
  - Error banner (conditional): warning icon + error text + clipboard copy-to-clipboard button
  - Session stats row: check-mark solved count | cross-mark failed count | coin token count
  - Action buttons: magnifier Scan | refresh Retry
- **Non-Coursera context:** "Navigate to a Coursera quiz to use this extension." + "The floating widget will appear on Coursera pages."
- **Footer:** gear Settings link (opens in-page overlay on Coursera tab)

### Floating Widget (on Coursera pages)

- **FAB pill** (52x32px): Draggable, snap-to-edge, 5 visual states:
  - Disabled: gray
  - Idle: `#0056d2` (blue)
  - Processing: shimmer animation
  - Active/done: `#22c55e` (green)
  - Error: `#ef4444` (red) with pulse
  - First-visit tooltip: "wave Click to get started"
- **Expanded panel** (320x480px): Header (mortar-board brand, title, status badge, progress bar, minimize), toggle, error banner, onboarding banner, provider/model/confidence info, stats grid (animated counters), magnifier Scan Page + refresh Retry buttons, gear Settings footer
- **Settings overlay** (full viewport modal): API key inputs (masked), model dropdowns, primary provider radio group, confidence slider (0-1), auto-select checkbox, auto-start checkbox, floppy Save / plug Test Connection buttons, focus trap, unsaved-changes detection

---

## All Permissions with Plain-English Explanations

| Permission | Why |
|---|---|
| `activeTab` | Access the page you're currently looking at -- needed to read quiz questions and select answers |
| `alarms` | Keep the background worker alive, reset idle timers, recover from processing timeouts |
| `storage` | Save your settings, encrypted API keys, widget position, and session state locally in your browser |
| `tabs` | Check which tab is active and whether it's a Coursera page, send messages between the popup and the page |
| Host: `coursera.org` | The content script needs to run on Coursera pages to detect questions and select answers |
| Host: `openrouter.ai` | Send quiz questions to OpenRouter AI models for answers |
| Host: `integrate.api.nvidia.com` | Send quiz questions to NVIDIA NIM AI models |
| Host: `generativelanguage.googleapis.com` | Send quiz questions to Google Gemini AI models |
| Host: `api.groq.com` | Send quiz questions to Groq AI models |
| Host: `api.cerebras.ai` | Send quiz questions to Cerebras AI models |
| Host: Coursera CDN domains | Fetch quiz images embedded in questions so AI can analyze diagrams and figures |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+C` | Open popup |
| `Alt+Shift+S` | Scan page for questions |
| `Alt+Shift+E` | Toggle extension on/off |

---

## Color Palette (from Code)

| Role | Hex | Usage |
|---|---|---|
| Brand / Accent | `#0056d2` | Popup header, toggle, action buttons, idle FAB |
| Success / High confidence | `#22c55e` | Active state, solved counter, high-confidence highlights |
| Warning / Medium confidence | `#eab308` | Medium-confidence highlights (>=0.5) |
| Low confidence | `#f97316` | Low-confidence highlights (<0.5) |
| Error | `#ef4444` | Error states, failed counter, error pulse |
| Processing | `#94a3b8` | Loading/shimmer states |

Confidence threshold default: **0.7** -- below this the extension highlights
only; above it auto-clicks.

---

## AI Providers and Default Models

| Provider | Default Model |
|---|---|
| OpenRouter | `openrouter/free` |
| NVIDIA NIM | `moonshotai/kimi-k2.5` |
| Gemini | `gemini-2.5-flash-lite` |
| Groq | `llama-3.3-70b-versatile` |
| Cerebras | `llama-3.3-70b` |

### Recommended Models (from README)

| Provider | Model | Best For |
|---|---|---|
| OpenRouter | `google/gemini-2.0-flash-001` | Fast text MCQ |
| OpenRouter | `openai/gpt-4o` | Complex reasoning |
| OpenRouter | `anthropic/claude-sonnet-4` | Nuanced academic content |
| NVIDIA NIM | `nvidia/llama-3.2-nv-vision-instruct` | Image/diagram questions |

---

## User-Facing Strings from Code

These are real strings from the extension source, useful for grounding website copy:

- "AI-powered answer assistant for e-learning platforms"
- "wave Click to get started" (first-visit tooltip)
- "Set up an API key to get started" (onboarding)
- "Welcome to Auto-Coursera! mortar-board" (settings onboarding)
- "Get a free API key from OpenRouter, paste it below, then navigate to any Coursera quiz."
- "Navigate to a Coursera quiz to use this extension."
- Pill states: "Off", "Ready", "Solving {n}...", "check-mark {n} solved", "! Error"

---

## Technical Details for Copy

- **5 AI providers** with automatic fallback (strategy pattern + circuit breaker)
- **AES-256-GCM** encrypted API key storage with PBKDF2 key derivation (100k iterations)
- **Shadow DOM isolation** -- all injected UI in a closed Shadow DOM, invisible to page CSS
- **Token-bucket rate limiter** -- default 20 RPM per provider
- **Circuit breaker** -- 3 failures trigger 60s cooldown, then half-open probe
- **SPA navigation detection** -- monkey-patches `history.pushState`/`replaceState`
- **26 ARIA attributes**, focus trap, keyboard navigation, reduced motion support

---

## Phase 0B -- URL Contract

### Page Routes (must exist at identical slugs)

| Route | Description |
|---|---|
| `/` | Homepage / landing |
| `/install` | Primary install page |
| `/downloads` | Full download matrix (all platforms) |
| `/releases` | Version history |
| `/support` | Help & contact |
| `/privacy` | Privacy policy |
| `/docs` | Documentation hub |
| `/docs/manual` | Manual install guide |
| `/docs/troubleshoot` | Troubleshooting guide |
| `/docs/setup` | Setup guide |
| `/docs/architecture` | Architecture overview |

### Redirect Routes (preserved in `_redirects`)

| Route | Target | Code |
|---|---|---|
| `/download/windows` | GitHub release asset | 302 |
| `/download/macos` | GitHub release asset | 302 |
| `/download/linux` | GitHub release asset | 302 |
| `/download/windows-arm64` | GitHub release asset | 302 |
| `/download/linux-arm64` | GitHub release asset | 302 |
| `/download/macos-intel` | GitHub release asset | 302 |
| `/ps` | `/scripts/install.ps1` | 200 |
| `/sh` | `/scripts/install.sh` | 200 |

### Static Assets (must survive untouched in `public/`)

| Path | Purpose |
|---|---|
| `/scripts/install.ps1` | Windows install script |
| `/scripts/install.sh` | Linux install script |
| `/scripts/install-mac.sh` | macOS install script |
| `/scripts/uninstall.ps1` | Windows uninstall script |
| `/scripts/uninstall.sh` | Linux/macOS uninstall script |
| `/updates.xml` | Browser auto-update manifest |
| `/robots.txt` | Crawler directives |
| `/_headers` | Cloudflare security headers |
| `/_redirects` | Cloudflare redirect rules |
| `/favicon.svg` | Favicon |
| `/og-image.svg` | Open Graph image |

**Totals:** 11 page routes + 8 redirect routes + 11 static assets.

---

## Phase 0C -- Design Brief

```
EXTENSION:           Auto-Coursera Assistant
PURPOSE:             Detects Coursera quiz questions and auto-selects AI-generated
                     answers so you never tab-switch to research again.
AUDIENCE:            Online learners managing coursework at scale -- working
                     professionals, students, career-changers on Coursera.
NARRATIVE METAPHOR:  The Scribe in the Examination Hall -- a silent, brilliant
                     presence that reads every question and writes the answers
                     in green ink before you finish reading the first one.
AESTHETIC DIRECTION: Editorial Print -- deep ink, serif-dominant, paper grain
                     textures. Education is the domain. The extension lives in
                     the world of coursework, exams, and written knowledge.
                     This is not a dev tool or a SaaS dashboard -- it's a
                     scholarly companion. The website should feel like opening
                     a beautifully typeset examination booklet.
ACCENT COLOR:        #0056d2 -- Coursera's own blue. The extension positions
                     itself as native to the Coursera experience, not alien.
                     This blue on deep ink backgrounds provides confident,
                     academic authority without shouting.
DISPLAY FONT:        Instrument Serif -- editorial weight, visible personality,
                     signals "this is written, not generated." Used for act
                     headings and the homepage narrative arc.
BODY/MONO FONT:      Source Serif 4 (body) + IBM Plex Mono (labels/code) --
                     Source Serif for readable long-form prose that matches the
                     editorial aesthetic. IBM Plex Mono for version numbers,
                     keyboard shortcuts, and technical labels -- precise without
                     being cold.
URL CONTRACT:        /
                     /install
                     /downloads
                     /releases
                     /support
                     /privacy
                     /docs
                     /docs/manual
                     /docs/troubleshoot
                     /docs/setup
                     /docs/architecture
```

**This brief is a contract.** Every design decision in the build must trace back
to something in this document. No random choices.

---

## Implementation Notes

### What the task.md specifies

- **Framework:** Astro 5, static output, zero client JS beyond chapter observer
- **Styling:** Pure CSS with custom properties in `tokens.css` -- NO Tailwind
- **Fonts:** Self-hosted via `@fontsource` packages, NOT Google Fonts CDN
- **Homepage:** 5-act scrollytelling narrative (not a landing page)
- **Extension mockup:** HTML/CSS replica of the real popup UI in new visual language
- **Performance:** Lighthouse 95+ Performance, 100 Accessibility
- **public/ files:** Must survive untouched (scripts, redirects, headers, robots.txt, updates.xml)

### Banned elements

- Inter, Roboto, Poppins, Space Grotesk
- Gradient blobs, glassmorphism, rounded-full pill buttons
- Feature cards with icons
- Purple gradients or generic AI-product aesthetics
- "Powerful. Intuitive. Fast." / "Supercharge your workflow" / "Seamless experience" / "Boost productivity"
- Bullet lists of features on the homepage
- Star ratings or "trusted by X users" claims
