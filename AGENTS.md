>Always update important changes in the documentation files. This includes `README.md`, `CHANGELOG.md`, and any relevant files in the `docs/` directory. Keeping documentation up-to-date ensures that users and contributors have accurate information about the project, its features, and how to use it effectively.
>Always add entry to `CHANGELOG.md` for any new features, bug fixes, or significant changes. This helps users track the evolution of the project and understand what has changed in each version.
>If change is big enough, as per set by the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) guidelines, consider adding a new section in `CHANGELOG.md` with the version number and date, and categorize changes under "Added", "Changed", "Deprecated", "Removed", "Fixed", or "Security" as appropriate.
>This project uses **pnpm** as its package manager for both the extension and the website. Always use `pnpm` commands (`pnpm install`, `pnpm build`, etc.) — never npm or yarn.
>
>## CHANGELOG Format
>
>Follow the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format strictly:
>- Categories: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**
>- Within each category, group entries by domain using `#### Extension`, `#### Website`, `#### Infrastructure` subheadings when the release spans multiple areas
>- Write entries as **user-facing descriptions**, not implementation details — no internal function names, type field names, or test counts
>- Each entry should be one concise line explaining **what changed and why it matters**
>- Bad: "`parseBatchAIResponse()` detects string-typed `answer` values from AI responses and routes them to `rawAnswer`"
>- Good: "Response parser correctly handles free-form numeric answers from AI providers"
>
>## Commit Message Format
>
>Follow [Conventional Commits](https://www.conventionalcommits.org/) with these conventions:
>- **Subject line**: `type(scope): description` — max 72 characters
>  - Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`, `style`
>  - Scope: `extension`, `website`, `installer`, `ci`, or omit for cross-cutting changes
>  - For version bumps: `feat: vX.Y.Z — brief summary`
>- **Body** (for non-trivial changes): group by domain with bullet points
>  - Use blank line between subject and body
>  - Wrap body at 72 characters
>  - Group by area: `Extension — Feature`, `Website — Redesign`, `Infrastructure`, `Fixes`
>- **Examples**:
>  - `fix(extension): handle array-wrapped numeric answers from OpenRouter`
>  - `feat(website): add documentation section with setup and architecture guides`
>  - `chore(ci): pin all third-party GitHub Actions to commit SHAs`
>  - `feat: v2.0.0 — NumericQuestion support, website redesign, architecture overhaul`
>
>## Version Management
>
>- `version.json` is the **single source of truth** for all version references
>- To bump: `bash scripts/sync-constants.sh --bump X.Y.Z` — this updates `version.json` and propagates to all 15+ dependent files
>- To verify: `bash scripts/check-version.sh` — validates 59 cross-file references
>- CI enforces sync: if you push without running `sync-constants.sh`, CI fails with a clear error message
>- Follow [Semantic Versioning](https://semver.org/): MAJOR for breaking changes, MINOR for new features, PATCH for bug fixes

## Write instruction
>Never try to write large content in one go in a file, instead write in smaller increments so as to avoid error.