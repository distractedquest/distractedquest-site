// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Fully static build -> ./dist, served by Cloudflare Workers static assets (see wrangler.jsonc).
// build.format 'file' emits privacy.html / terms.html so the existing URLs
// https://distractedquest.com/privacy and /terms keep returning 200 with no redirect.
export default defineConfig({
  site: 'https://distractedquest.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
    }),
  ],
});
