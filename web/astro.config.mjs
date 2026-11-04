// Static build. Every page maps to a Shopify template (see ARCHITECTURE.md), so the output can be ported to Liquid.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.bomba-shop.ro',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap()],
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: { build: { assetsInlineLimit: 2048 } },
});
