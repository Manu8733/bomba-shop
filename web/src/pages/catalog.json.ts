// Minimal catalog for client code (cart drawer, instant search). Liquid equivalent: /products.json or the
// Storefront API; at the port this endpoint is replaced by predictive search + /cart.js.
import type { APIRoute } from 'astro';
import { products, imagesOf, price, compareAt, available, category, isPro, productUrl, variant, effectType } from '../lib/catalog';

export const GET: APIRoute = () => {
  const list = products.map((p) => ({
    handle: p.handle,
    title: p.title,
    price: price(p),
    compare: compareAt(p),
    available: available(p),
    category: category(p),
    pro: isPro(p),
    url: productUrl(p),
    image: imagesOf(p)[0]?.files[0]?.src ?? null,
    stock: variant(p).inventory_quantity,
    vendor: p.vendor,
    effect: effectType(p),
    collection: p.collections[0],
  }));
  return new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } });
};
