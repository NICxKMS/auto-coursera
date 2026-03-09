import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [tailwind(), sitemap()],
	output: 'static',
	site: 'https://autocr.nicx.me',
});
