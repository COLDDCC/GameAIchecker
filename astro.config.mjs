import { defineConfig } from 'astro/config';
import sitemap from './scripts/sitemap.mjs';
export default defineConfig({ output: 'static', integrations: [sitemap()], site: 'https://gameaichecker.com', trailingSlash: 'always' });
