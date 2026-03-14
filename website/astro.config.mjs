import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	integrations: [sitemap()],
	output: 'static',
	site: 'https://autocr.nicx.me',
	vite: {
		resolve: {
			alias: {
				'@root': path.resolve(__dirname, '..'),
			},
		},
		server: {
			fs: {
				allow: [path.resolve(__dirname, '..')],
			},
		},
	},
});
