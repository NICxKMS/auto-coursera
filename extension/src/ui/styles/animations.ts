/**
 * Animation styles — keyframe animations and motion preferences.
 * Injected into the Shadow DOM as part of the combined widget stylesheet.
 *
 * Contains:
 *   - 8 keyframe animations (shimmer, pulse, flash, fade, slide, scale, spin, counter-pop)
 *   - Progress bar indeterminate animation
 *   - Panel/overlay enter animations
 *   - All animations gated behind prefers-reduced-motion: no-preference
 *   - Reduced motion overrides (transition-duration: 0ms, animation: none)
 */

/** All animations — gated behind prefers-reduced-motion */
export const ANIMATION_STYLES = /* css */ `
@media (prefers-reduced-motion: no-preference) {

	/* ── Shimmer (processing pill) ──────────────────────── */

	@keyframes ac-shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	.ac-fab--processing::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.2) 50%,
			transparent 100%
		);
		animation: ac-shimmer 1.5s ease-in-out infinite;
	}

	/* ── Pulse (error state) ───────────────────────────── */

	@keyframes ac-pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.ac-fab--error {
		animation: ac-pulse 2s ease-in-out infinite;
	}

	/* ── Flash Green (success) ─────────────────────────── */

	@keyframes ac-flash-green {
		0% {
			box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
		}
		70% {
			box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
		}
	}

	.ac-fab--active {
		animation: ac-flash-green 1s ease-out;
	}

	/* ── Fade In ───────────────────────────────────────── */

	@keyframes ac-fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* ── Slide Up ──────────────────────────────────────── */

	@keyframes ac-slideUp {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ── Scale In ──────────────────────────────────────── */

	@keyframes ac-scaleIn {
		from {
			opacity: 0;
			transform: scale(0.9);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* ── Spin ──────────────────────────────────────────── */

	@keyframes ac-spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.ac-spin {
		animation: ac-spin 1s linear infinite;
	}

	/* ── Counter Increment ─────────────────────────────── */

	@keyframes ac-counter-pop {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	.ac-stat__value--animate {
		animation: ac-counter-pop 300ms ease-out;
	}

	/* ── Progress Bar Indeterminate ────────────────────── */

	@keyframes ac-progress-indeterminate {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(400%);
		}
	}

	.ac-panel__progress-bar--indeterminate {
		animation: ac-progress-indeterminate 1.5s ease-in-out infinite;
	}

	/* ── Panel Enter ───────────────────────────────────── */

	.ac-panel--open {
		animation: ac-slideUp 200ms ease-out;
	}

	/* ── Overlay Enter ─────────────────────────────────── */

	.ac-overlay--open .ac-overlay__card {
		animation: ac-scaleIn 300ms ease-out;
	}
}

/* ── Reduced Motion Overrides ──────────────────────────── */

@media (prefers-reduced-motion: reduce) {
	.ac-fab,
	.ac-panel,
	.ac-overlay,
	.ac-overlay__card,
	.ac-toggle__thumb,
	.ac-status-msg {
		transition-duration: 0ms !important;
		animation: none !important;
	}
}
`;
