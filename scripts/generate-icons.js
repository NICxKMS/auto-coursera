#!/usr/bin/env node
// scripts/generate-icons.js
// Run: node scripts/generate-icons.js
// Generates minimal valid PNG icon placeholders for the Chrome extension.
// No external dependencies required.

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';

const sizes = [16, 32, 48, 128];
const iconDir = join(__dirname, '..', 'assets', 'icons');

// Coursera-blue color: #0056D2 → R=0, G=86, B=210
const R = 0,
	G = 86,
	B = 210;

function crc32(buf) {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		crc ^= buf[i];
		for (let j = 0; j < 8; j++) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
	const typeBytes = Buffer.from(type, 'ascii');
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const payload = Buffer.concat([typeBytes, data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(payload), 0);
	return Buffer.concat([len, payload, crc]);
}

function createPNG(size) {
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

	// IHDR: width, height, bit depth 8, color type 2 (RGB)
	const ihdrData = Buffer.alloc(13);
	ihdrData.writeUInt32BE(size, 0);
	ihdrData.writeUInt32BE(size, 4);
	ihdrData[8] = 8; // bit depth
	ihdrData[9] = 2; // color type: RGB
	ihdrData[10] = 0; // compression
	ihdrData[11] = 0; // filter
	ihdrData[12] = 0; // interlace
	const ihdr = makeChunk('IHDR', ihdrData);

	// Build raw image data: each row = filter byte (0) + RGB pixels
	// Draw a simple "AC" text-like pattern on blue background for recognizability
	const rawRows = [];
	const mid = Math.floor(size / 2);
	const border = Math.max(1, Math.floor(size / 8));

	for (let y = 0; y < size; y++) {
		const row = Buffer.alloc(1 + size * 3);
		row[0] = 0; // no filter
		for (let x = 0; x < size; x++) {
			const idx = 1 + x * 3;
			// Simple rounded-square icon with letter hint
			const inBorder = x < border || x >= size - border || y < border || y >= size - border;
			const inCenter = x >= mid - border && x <= mid + border && y >= size * 0.3 && y <= size * 0.7;

			if (inBorder || inCenter) {
				// White border/center accent
				row[idx] = 255;
				row[idx + 1] = 255;
				row[idx + 2] = 255;
			} else {
				// Coursera blue fill
				row[idx] = R;
				row[idx + 1] = G;
				row[idx + 2] = B;
			}
		}
		rawRows.push(row);
	}

	const rawData = Buffer.concat(rawRows);
	const compressed = deflateSync(rawData);
	const idat = makeChunk('IDAT', compressed);

	const iend = makeChunk('IEND', Buffer.alloc(0));

	return Buffer.concat([signature, ihdr, idat, iend]);
}

// Ensure directory exists
if (!existsSync(iconDir)) {
	mkdirSync(iconDir, { recursive: true });
}

for (const size of sizes) {
	const filename = `icon-${size}.png`;
	const filepath = join(iconDir, filename);
	writeFileSync(filepath, createPNG(size));
	console.log(`Created ${filename} (${size}x${size})`);
}

console.log('All icons created in assets/icons/');
