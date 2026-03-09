/**
 * ImagePipeline — CORS-aware image fetch from service worker context.
 * REQ: REQ-005
 */

import { Logger } from '../utils/logger';

const logger = new Logger('ImagePipeline');

const ALLOWED_IMAGE_HOSTS = [
	'coursera.org',
	'd3njjcbhbojbot.cloudfront.net',
	'd2j5ihb19pt1hq.cloudfront.net',
	'coursera-assessments.s3.amazonaws.com',
	'coursera-university-assets.s3.amazonaws.com',
];

/**
 * Fetch a CORS-blocked image from the service worker context.
 * Service workers can fetch any URL via host_permissions.
 * @param url - The original image URL
 * @returns base64-encoded image data
 */
export async function fetchAsBase64(url: string): Promise<{ base64: string; mime: string }> {
	// Handle data URIs directly
	if (url.startsWith('data:')) {
		const match = url.match(/^data:([^;,]+)/);
		const mime = match?.[1] || 'image/png';
		const commaIdx = url.indexOf(',');
		return { base64: commaIdx >= 0 ? url.slice(commaIdx + 1) : '', mime };
	}

	// Validate URL host
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Invalid image URL: ${url}`);
	}
	if (
		!ALLOWED_IMAGE_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))
	) {
		throw new Error(`Blocked image fetch from untrusted host: ${parsed.hostname}`);
	}

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Image fetch failed: ${response.status} ${response.statusText}`);
		}

		const blob = await response.blob();
		const mime = blob.type || 'image/png';
		const base64 = await blobToBase64(blob);
		return { base64, mime };
	} catch (error) {
		logger.error(`Failed to fetch image: ${url}`, error);
		throw error;
	}
}

/**
 * Process an array of images, re-fetching any CORS-blocked ones.
 * @param images - Array of image objects with base64 and context
 * @returns Processed images with CORS-blocked ones re-fetched
 */
export async function processCorsBlockedImages(
	images: Array<{ base64: string; context: string }>,
): Promise<Array<{ base64: string; context: string; mime?: string }>> {
	const results = await Promise.all(
		images.map(async (img) => {
			if (img.base64.startsWith('CORS_BLOCKED:')) {
				const url = img.base64.replace('CORS_BLOCKED:', '');
				try {
					const result = await fetchAsBase64(url);
					logger.info(`Re-fetched CORS-blocked image: ${url}`);
					return { base64: result.base64, context: img.context, mime: result.mime };
				} catch {
					logger.warn(`Skipping unfetchable image: ${url}`);
					return null;
				}
			}
			return img;
		}),
	);

	return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * Convert a Blob to base64 string.
 */
async function blobToBase64(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
