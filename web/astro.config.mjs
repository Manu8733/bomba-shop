// Static build. Every page maps to a Shopify template (see ARCHITECTURE.md), so the output can be ported to Liquid.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const compress = promisify(gzip);
const packModels = {
  name: 'pack-hero-models',
  hooks: {
    async 'astro:build:done'({ dir }) {
      const folder = new URL('models/', dir);
      const models = (await readdir(folder)).filter((name) => name.endsWith('.glb'));
      await Promise.all(models.map(async (name) => {
        const bytes = await readFile(new URL(name, folder));
        await writeFile(new URL(`${name}.gz`, folder), await compress(bytes, { level: 9 }));
      }));
    },
  },
};

export default defineConfig({
  site: 'https://www.bomba-shop.ro',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap(), packModels],
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: { build: { assetsInlineLimit: 2048 } },
});
