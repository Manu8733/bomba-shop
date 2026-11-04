# Bomba Shop frontend — architecture and contracts

Static Astro site (`web/`) that is the visual and UX reference for the future Shopify theme. Design rules: [`../DESIGN.md`](../DESIGN.md). Tokens: `src/styles/tokens.css`. Shop facts: `src/config.ts`.

## Run

```bash
npm --prefix web run dev      # http://127.0.0.1:4321, live reload
npm --prefix web run build    # static output in web/dist
tools/.venv/Scripts/python tools/sync_web_assets.py   # refresh data + product images
```

## Folder map → Shopify

| Astro | Shopify (Online Store 2.0) |
|---|---|
| `src/layouts/Theme.astro` | `layout/theme.liquid` |
| `src/sections/*.astro` | `sections/*.liquid` (each section = one schema'd section) |
| `src/sections/<page>/*.astro` | sections used only on that template |
| `src/snippets/*.astro` | `snippets/*.liquid` |
| `src/pages/index.astro` | `templates/index.json` |
| `src/pages/products/[handle].astro` | `templates/product.json` |
| `src/pages/collections/[handle].astro` | `templates/collection.json` |
| `src/pages/search.astro` | `templates/search.json` |
| `src/pages/cart.astro` | `templates/cart.json` |
| `src/pages/pages/<slug>.astro` | `templates/page.<slug>.json` |
| `src/pages/404.astro` | `templates/404.json` |
| `src/scripts/*.ts` | `assets/*.js` (ES modules) |
| `src/data/products.json` | Shopify products (+ metafields namespace `pyro`) |

Keep every section self-contained (its markup, scoped `<style>`, and at most one `<script>`), so each one ports to a single `.liquid` file.

## Data API (`src/lib/catalog.ts`) — read-only for builders

- `products: Product[]`, `byHandle(h)`, `collections`, `collectionByHandle(h)`, `collectionMeta`, `groups`, `virtualCollections` (`all`, `public`, `profesionisti`, `reduceri`)
- per product: `price`, `compareAt`, `available`, `category` (`F1`/`P1`/`T1`/null), `isPublic`, `isPro`, `productUrl`, `imagesOf` (responsive files), `effectColor` (salt colour), `effectType` (filter label), `specs` / `cardSpecs` (label cells, `value: null` = unknown), `discountPct`, `money`, `plainText`
- 297 products, 87 in stock. **All P1/T1 products are out of stock**; the live shop is effectively F1. Design for that.

## Snippets (import, don't copy)

| Snippet | Props |
|---|---|
| `ProductCard` | `product`, `eager?`, `headingLevel?` — renders `[data-product-card]` with `data-available data-category data-audience data-effect data-color data-price data-discount data-title` for filtering |
| `Img` | `image?`, `alt?`, `sizes?`, `eager?` — handles missing photos |
| `SpecLabel` | `product`, `mode: 'card' \| 'full'` |
| `CatBadge` | `category`, `size: 'sm' \| 'md' \| 'lg'` |
| `Price` | `product`, `size` |
| `Fuse` | `value 0..1`, `label`; client code updates CSS var `--p` |
| `Icon` | `name`, `size`, `label?` (see the `paths` map) |
| `Logo` | `variant`, `height` |
| `Toast` | in layout; trigger with `window.dispatchEvent(new CustomEvent('toast', {detail:{message, tone:'warn'|undefined}}))` |

Global CSS classes from `base.css`: `.container .section .section-head .grid-products .stack .eyebrow .muted .mono .prose .visually-hidden .btn .btn-primary .btn-secondary .btn-ghost .btn-pro .btn-sm .btn-block .spec-label .field .input`.

## Client modules

- `scripts/cart.ts`: `addToCart(handle, qty)`, `setQuantity`, `removeLine`, `getCart()`, `openCart()`, `loadCatalog()` (fetches `/catalog.json`), `money`. Any `<button data-add-to-cart data-handle="…" [data-qty-input="#sel"]>` works on every page. Events on `window`: `cart:change` (detail = cart), `cart:open`, `cart:added`.
- `scripts/mode.ts`: `getMode()` → `'public' | 'pro' | null`, `setMode()`, `getProAuth()/setProAuth()`. `<html data-mode="public|pro|unset">` is set before first paint. Event `mode:change`.
- Three.js lives in `scripts/three/*.ts`, imported dynamically (`import('...')`) only when the canvas is near the viewport and WebGL exists. One renderer per page. Respect `prefers-reduced-motion` (render one static final frame) and stop rendering off-screen.

## Rules for every builder

1. **Language:** Romanian with full diacritics (ă â î ș ț). Prices `25,00 lei`. Dates `3 noiembrie 2026`.
2. **No invented facts.** No fake reviews, ratings, stock counts, "x people are watching", delivery promises, phone numbers or addresses. Use `src/config.ts`; where a value is `null` or `confirmed: false`, either omit it or show it as written in config. Product specs come only from `specs()`; unknown = "—".
3. **Law (Legea 92/2025):** individuals may buy only **F1, from 16**. P1/T1 only for authorized buyers. Never let a P1/T1 product be added to cart in public mode; explain calmly how authorization works (`/pages/profesionisti`). Show the category diamond everywhere a product appears.
4. **Tokens only.** Colours, type, spacing, radius, motion come from CSS variables in `tokens.css`. No new hex values except inside canvas/WebGL code (use the palette in DESIGN.md).
5. **Accessibility (WCAG 2.2 AA):** semantic landmarks, one `h1` per page, labelled controls, visible focus, keyboard support for menus/drawers/dialogs (Esc closes, focus is trapped and returned), `aria-live` for cart/search updates, touch targets ≥ 44px, `prefers-reduced-motion`.
6. **Performance:** no UI libraries; vanilla TS. Images through `Img`. No layout shift (sizes reserved). Heavy JS only via dynamic import. Target Lighthouse mobile ≥ 90.
7. **Mobile first.** Test widths 360, 390, 768, 1024, 1440. No horizontal page scroll.
8. **Ownership:** edit only the files assigned to you. If you need a change in a shared file (`lib/`, `snippets/`, `styles/`, `layouts/`, `config.ts`), don't make it — describe it in your final report.
9. **Don't run `astro build` or `astro dev`** while other builders work in parallel; the integrator runs the build afterwards.

## De confirmat (owner)

Telefon, adresă, program, prag livrare gratuită (300 lei în config), termene și curieri, metode de plată, excepții de retur pentru pirotehnice, textele legale finale (avocat), logo-urile oficiale PNRR, poze noi pentru produsele cu fotografii de la alt magazin.
