import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAsBase64, processCorsBlockedImages } from '../../src/services/image-pipeline';

describe('ImagePipeline', () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		// Mock fetch for each test
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	describe('fetchAsBase64()', () => {
		describe('data URI handling', () => {
			it('should parse data URI directly without fetching', async () => {
				const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
				const result = await fetchAsBase64(dataUri);
				expect(result.mime).toBe('image/png');
				expect(result.base64).toBe('iVBORw0KGgoAAAANSUhEUg==');
				expect(globalThis.fetch).not.toHaveBeenCalled();
			});

			it('should handle data URI with different mime type', async () => {
				const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
				const result = await fetchAsBase64(dataUri);
				expect(result.mime).toBe('image/jpeg');
				expect(result.base64).toBe('/9j/4AAQSkZJRg==');
			});

			it('should default to image/png for data URI without recognized mime', async () => {
				const dataUri = 'data:;base64,abc123';
				const result = await fetchAsBase64(dataUri);
				// The regex /^data:([^;,]+)/ matches empty string which is falsy
				expect(result.mime).toBe('image/png');
			});
		});

		describe('host allowlist validation', () => {
			it('should reject URLs from untrusted hosts', async () => {
				await expect(fetchAsBase64('https://evil.com/malware.png')).rejects.toThrow(
					'Blocked image fetch from untrusted host: evil.com',
				);
				expect(globalThis.fetch).not.toHaveBeenCalled();
			});

			it('should reject URLs from hosts that look similar to allowed ones', async () => {
				await expect(fetchAsBase64('https://not-coursera.org/img.png')).rejects.toThrow(
					'Blocked image fetch from untrusted host',
				);
			});

			it('should allow coursera.org', async () => {
				mockFetchSuccess();
				await fetchAsBase64('https://coursera.org/image.png');
				expect(globalThis.fetch).toHaveBeenCalledWith(
					'https://coursera.org/image.png',
					expect.objectContaining({ signal: undefined }),
				);
			});

			it('should allow d3njjcbhbojbot.cloudfront.net', async () => {
				mockFetchSuccess();
				await fetchAsBase64('https://d3njjcbhbojbot.cloudfront.net/img.png');
				expect(globalThis.fetch).toHaveBeenCalled();
			});

			it('should allow coursera-assessments.s3.amazonaws.com', async () => {
				mockFetchSuccess();
				await fetchAsBase64('https://coursera-assessments.s3.amazonaws.com/q1.png');
				expect(globalThis.fetch).toHaveBeenCalled();
			});

			it('should allow subdomains of allowed hosts', async () => {
				mockFetchSuccess();
				await fetchAsBase64('https://www.coursera.org/img.png');
				expect(globalThis.fetch).toHaveBeenCalled();
			});

			it('should reject invalid URLs', async () => {
				await expect(fetchAsBase64('not-a-url')).rejects.toThrow('Invalid image URL');
			});
		});

		describe('fetch behavior', () => {
			it('should return base64-encoded image data on success', async () => {
				const imgBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
				const blob = new Blob([imgBytes], { type: 'image/png' });
				vi.mocked(globalThis.fetch).mockResolvedValue(
					new Response(blob, { status: 200, headers: { 'Content-Type': 'image/png' } }),
				);

				const result = await fetchAsBase64('https://coursera.org/chart.png');
				expect(result.mime).toBe('image/png');
				expect(result.base64).toBeTruthy();
			});

			it('should throw on non-OK response', async () => {
				vi.mocked(globalThis.fetch).mockResolvedValue(
					new Response('Not Found', { status: 404, statusText: 'Not Found' }),
				);

				await expect(fetchAsBase64('https://coursera.org/missing.png')).rejects.toThrow(
					'Image fetch failed: 404 Not Found',
				);
			});
		});
	});

	describe('processCorsBlockedImages()', () => {
		it('should pass through images that are not CORS-blocked', async () => {
			const images = [
				{ base64: 'abc123', context: 'question' },
				{ base64: 'def456', context: 'option' },
			];
			const result = await processCorsBlockedImages(images);
			expect(result).toHaveLength(2);
			expect(result[0].base64).toBe('abc123');
			expect(result[1].base64).toBe('def456');
			expect(globalThis.fetch).not.toHaveBeenCalled();
		});

		it('should re-fetch CORS-blocked images', async () => {
			const imgBytes = new Uint8Array([0xff, 0xd8]); // JPEG magic
			const blob = new Blob([imgBytes], { type: 'image/jpeg' });
			vi.mocked(globalThis.fetch).mockResolvedValue(new Response(blob, { status: 200 }));

			const images = [{ base64: 'CORS_BLOCKED:https://coursera.org/img.jpg', context: 'question' }];
			const result = await processCorsBlockedImages(images);
			expect(result).toHaveLength(1);
			expect(result[0].base64).toBeTruthy();
			expect(result[0].context).toBe('question');
			expect(globalThis.fetch).toHaveBeenCalledWith(
				'https://coursera.org/img.jpg',
				expect.objectContaining({ signal: undefined }),
			);
		});

		it('should skip CORS-blocked images that fail to fetch', async () => {
			vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

			const images = [
				{ base64: 'CORS_BLOCKED:https://coursera.org/fail.png', context: 'question' },
				{ base64: 'normal-base64', context: 'option' },
			];
			const result = await processCorsBlockedImages(images);
			// The failed CORS image is skipped, normal one kept
			expect(result).toHaveLength(1);
			expect(result[0].base64).toBe('normal-base64');
		});

		it('should skip CORS-blocked images from untrusted hosts', async () => {
			const images = [{ base64: 'CORS_BLOCKED:https://evil.com/bad.png', context: 'question' }];
			const result = await processCorsBlockedImages(images);
			// Should be skipped because the host is blocked
			expect(result).toHaveLength(0);
			expect(globalThis.fetch).not.toHaveBeenCalled();
		});

		it('should handle empty image array', async () => {
			const result = await processCorsBlockedImages([]);
			expect(result).toHaveLength(0);
		});

		it('should handle mixed normal and CORS-blocked images', async () => {
			mockFetchSuccess();
			const images = [
				{ base64: 'normal1', context: 'question' },
				{ base64: 'CORS_BLOCKED:https://coursera.org/img.png', context: 'question' },
				{ base64: 'normal2', context: 'option' },
			];
			const result = await processCorsBlockedImages(images);
			expect(result).toHaveLength(3);
			expect(result[0].base64).toBe('normal1');
			expect(result[2].base64).toBe('normal2');
		});
	});
});

/** Utility: mock a successful fetch returning a small PNG blob */
function mockFetchSuccess() {
	const blob = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' });
	vi.mocked(globalThis.fetch).mockResolvedValue(new Response(blob, { status: 200 }));
}
