/**
 * Changelog Parser — Parses Keep a Changelog format into structured release data.
 *
 * Handles the Auto-Coursera CHANGELOG.md format:
 *   ## [X.Y.Z] — YYYY-MM-DD        (version header)
 *   ### Added / Changed / Fixed …   (category header)
 *   #### Extension / Website / …    (subcategory — folded into parent category)
 *   - Bullet point entry            (change item)
 *
 * Only extension-related entries are included in the output. Items under
 * `#### Website` or `#### Infrastructure` subcategory headers are filtered out.
 * Items with no subcategory header (bare items) are always included.
 */

/* ========================================================================
   Types
   ======================================================================== */

export interface ChangelogCategory {
	name: string;
	items: string[];
}

export interface ChangelogEntry {
	version: string;
	date: string;
	isLatest: boolean;
	categories: ChangelogCategory[];
	anchor: string;
}

/* ========================================================================
   Parser
   ======================================================================== */

/**
 * Match the [Unreleased] header line.
 *   ## [Unreleased]
 */
const UNRELEASED_RE = /^##\s+\[Unreleased\]\s*$/i;

/**
 * Match a version header line.
 *
 * Accepted formats (all encountered in the wild):
 *   ## [2.0.0] — 2026-03-14
 *   ## [2.0.0] - 2026-03-14
 *   ## 2.0.0 — 2026-03-14
 *   ## [2.0.0]
 */
const VERSION_RE = /^##\s+\[?(\d+\.\d+\.\d+)\]?\s*(?:[—–-]\s*(.+))?$/;

/** Match a category header (### Added, ### Fixed, etc.) */
const CATEGORY_RE = /^###\s+(.+)$/;

/** Match a subcategory header (#### Extension, #### Website, etc.) */
const SUBCATEGORY_RE = /^####\s+(.+)$/;

/** Match a bullet point line */
const BULLET_RE = /^-\s+(.+)$/;

/** Escape HTML entities to prevent XSS when injecting via set:html. */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Convert basic markdown inline markup to HTML for safe rendering. */
function inlineMarkdownToHtml(text: string): string {
	// Escape HTML entities FIRST — neutralises <script>, <img onerror>, etc.
	const escaped = escapeHtml(text);

	return (
		escaped
			// Bold: **text** or __text__
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/__(.+?)__/g, '<strong>$1</strong>')
			// Italic: *text* or _text_ (but not inside words for underscore)
			.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '<em>$1</em>')
			.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>')
			// Inline code: `code`
			.replace(/`(.+?)`/g, '<code>$1</code>')
			// Links: [text](url) — only allow http/https protocols
			.replace(/\[(.+?)\]\((.+?)\)/g, (_match, linkText, url) => {
				const trimmed = url.trim();
				if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
					return `<a href="${trimmed}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
				}
				return linkText; // Strip the link, keep the text
			})
	);
}

/**
 * Parse a Keep a Changelog–formatted string into structured release entries.
 *
 * Entries are returned in document order (newest first, matching the file).
 */
export function parseChangelog(content: string): ChangelogEntry[] {
	const lines = content.split('\n');
	const entries: ChangelogEntry[] = [];

	/** Subcategory names that are filtered OUT (non-extension domains). */
	const EXCLUDED_SUBCATEGORIES = new Set(['Website', 'Infrastructure']);

	let currentEntry: ChangelogEntry | null = null;
	let currentCategory: ChangelogCategory | null = null;
	let currentSubcategory: string | null = null;

	for (const raw of lines) {
		const line = raw.trimEnd();

		/* ----- Unreleased header ----- */
		const unreleasedMatch = line.match(UNRELEASED_RE);
		if (unreleasedMatch) {
			// Flush previous entry
			if (currentEntry) {
				entries.push(currentEntry);
			}

			currentEntry = {
				version: 'Unreleased',
				date: '',
				isLatest: false,
				categories: [],
				anchor: 'unreleased',
			};
			currentCategory = null;
			currentSubcategory = null;
			continue;
		}

		/* ----- Version header ----- */
		const versionMatch = line.match(VERSION_RE);
		if (versionMatch) {
			// Flush previous entry
			if (currentEntry) {
				entries.push(currentEntry);
			}

			const version = versionMatch[1];
			const date = versionMatch[2]?.trim() ?? '';

			currentEntry = {
				version,
				date,
				isLatest: false,
				categories: [],
				anchor: `v${version}`,
			};
			currentCategory = null;
			currentSubcategory = null;
			continue;
		}

		// Skip lines that appear before the first version header
		if (!currentEntry) continue;

		/* ----- Category header (### Added, ### Fixed, …) ----- */
		const categoryMatch = line.match(CATEGORY_RE);
		if (categoryMatch) {
			currentCategory = {
				name: categoryMatch[1].trim(),
				items: [],
			};
			currentEntry.categories.push(currentCategory);
			currentSubcategory = null;
			continue;
		}

		/* ----- Subcategory header (#### Extension, #### Website, …) ----- */
		const subcategoryMatch = line.match(SUBCATEGORY_RE);
		if (subcategoryMatch) {
			currentSubcategory = subcategoryMatch[1].trim();
			continue;
		}

		/* ----- Bullet point ----- */
		const bulletMatch = line.match(BULLET_RE);
		if (bulletMatch && currentCategory) {
			// Filter: skip items under excluded subcategories (Website, Infrastructure)
			if (currentSubcategory && EXCLUDED_SUBCATEGORIES.has(currentSubcategory)) {
				continue;
			}

			// No prefix — since only extension items survive, the label is redundant
			const itemText = inlineMarkdownToHtml(bulletMatch[1].trim());
			currentCategory.items.push(itemText);
			continue;
		}
	}

	// Flush final entry
	if (currentEntry) {
		entries.push(currentEntry);
	}

	// Strip empty categories (categories left with zero items after filtering)
	for (const entry of entries) {
		entry.categories = entry.categories.filter((cat) => cat.items.length > 0);
	}

	// Strip entries that have no categories at all after filtering
	const nonEmptyEntries = entries.filter((entry) => entry.categories.length > 0);

	// Mark the first entry as latest
	if (nonEmptyEntries.length > 0) {
		nonEmptyEntries[0].isLatest = true;
	}

	return nonEmptyEntries;
}
