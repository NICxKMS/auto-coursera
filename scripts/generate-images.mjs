#!/usr/bin/env node

/**
 * Generate raster image assets from SVG sources.
 *
 * Usage: node scripts/generate-images.mjs
 * Run from the repository root.
 */

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// sharp lives in website/node_modules — resolve it explicitly
// so this script can run from the repository root.
const localRequire = createRequire(resolve(repoRoot, 'website', 'package.json'));
const sharp = localRequire('sharp');

const websitePublic = resolve(repoRoot, 'website', 'public');

// ====================================================================
// 1. favicon-32.png — Convert SVG favicon to 32×32 PNG
// ====================================================================

async function generateFavicon() {
	// Use SVG path elements instead of <text> to avoid font rendering
	// issues with librsvg. The paths draw an "AC" monogram in amber
	// on a dark rounded-rect background.

	const faviconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#09090B"/>
  <rect x="1" y="1" width="30" height="30" rx="5" fill="none" stroke="#1C1917" stroke-width="0.5"/>
  <!-- A -->
  <path d="M7 23L10.5 9h3L17 23h-2.5l-1-4H10l-1 4H7zm3.5-6h3l-1.5-6-1.5 6z" fill="#F59E0B"/>
  <!-- C -->
  <path d="M19 16c0-4 2.5-7.5 5.5-7.5 1.5 0 2.5.5 3.2 1.5l-1.5 2c-.5-.5-1-.8-1.7-.8-1.8 0-3 2-3 4.8s1.2 4.8 3 4.8c.7 0 1.2-.3 1.7-.8l1.5 2c-.7 1-1.7 1.5-3.2 1.5C21.5 23.5 19 20 19 16z" fill="#F59E0B"/>
</svg>`;

	await sharp(Buffer.from(faviconSvg))
		.resize(32, 32)
		.png({ compressionLevel: 9 })
		.toFile(resolve(websitePublic, 'favicon-32.png'));

	console.log('✓ Generated favicon-32.png (32×32)');
}

// ====================================================================
// 2. og-image.png — 1200×630 social sharing image
// ====================================================================

async function generateOgImage() {
	const ogSvg = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="subtle" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#09090B"/>
      <stop offset="100%" stop-color="#1C1917"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#subtle)"/>

  <!-- Subtle border -->
  <rect x="40" y="40" width="1120" height="550" rx="12" fill="none" stroke="#27272A" stroke-width="1"/>

  <!-- AC monogram (large, subtle) -->
  <text x="600" y="220" font-family="monospace" font-weight="900" font-size="96"
        fill="#F59E0B" text-anchor="middle" opacity="0.15">AC</text>

  <!-- Title -->
  <text x="600" y="310" font-family="Georgia, 'Times New Roman', serif"
        font-size="64" fill="#FAFAF9" text-anchor="middle" font-weight="400">
    Auto-Coursera
  </text>

  <!-- Tagline -->
  <text x="600" y="370" font-family="'Segoe UI', Helvetica, Arial, sans-serif"
        font-size="26" fill="#A8A29E" text-anchor="middle" font-weight="400">
    AI-powered Coursera quiz assistant
  </text>

  <!-- Accent line -->
  <rect x="520" y="400" width="160" height="2" rx="1" fill="#F59E0B"/>

  <!-- URL -->
  <text x="600" y="470" font-family="monospace" font-size="18"
        fill="#78716C" text-anchor="middle">
    autocr.nicx.me
  </text>

  <!-- Bottom decorative dots -->
  <circle cx="570" cy="520" r="4" fill="#F59E0B" opacity="0.6"/>
  <circle cx="590" cy="520" r="4" fill="#F59E0B" opacity="0.4"/>
  <circle cx="610" cy="520" r="4" fill="#F59E0B" opacity="0.3"/>
  <circle cx="630" cy="520" r="4" fill="#F59E0B" opacity="0.2"/>
</svg>`;

	await sharp(Buffer.from(ogSvg))
		.png({ compressionLevel: 9 })
		.toFile(resolve(websitePublic, 'og-image.png'));

	console.log('✓ Generated og-image.png (1200×630)');
}

// ====================================================================
// Run
// ====================================================================

try {
	await generateFavicon();
	await generateOgImage();
	console.log('\nAll images generated successfully.');
} catch (error) {
	console.error('Image generation failed:', error);
	process.exit(1);
}
