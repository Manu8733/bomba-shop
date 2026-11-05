// Catalog access. Data is Shopify-shaped (data/products.json from tools/build_products.py), so these helpers
// map 1:1 to Liquid: product.title, product.variants[0].price, product.metafields.pyro.*, collection.products.
import productsData from '../data/products.json';
import collectionsData from '../data/collections.json';
import imagesData from '../data/images.json';

export type Spec = { value: number; source: 'tabel' | 'descriere' } | null;
export type Pyro = {
  category: string | null;
  audience: 'public' | 'autorizat' | null;
  category_raw: string | null;
  shots: Spec;
  calibre_mm: Spec;
  duration_s: Spec;
  pack_qty: Spec;
  effect: string | null;
};
export type Variant = {
  id: number; title: string; price: number | null; compare_at_price: number | null;
  sku: string; available: boolean; inventory_quantity: number | null;
};
export type Product = {
  id: number; handle: string; title: string; body_html: string; vendor: string; product_type: string;
  tags: string[]; options: unknown[]; variants: Variant[]; collections: string[];
  images: { id: number; position: number; alt: string }[];
  metafields: { pyro: Pyro; legacy: { url: string; path: string; h1: string | null } };
  flags: string[];
};
export type ImageFile = { w: number; h: number; src: string };
/** obj = the product's box inside a cut-out [x0, y0, x1, y1] as fractions; y1 is the floor line (the baked shadow lies below it). */
export type ProductImage = { n: number; kind: 'cutout' | 'original'; alt: string; w: number; h: number; files: ImageFile[]; obj?: number[] };

export const products: Product[] = (productsData as { products: Product[] }).products;
const imageMap = imagesData as Record<string, ProductImage[]>;

// ---------- Collections: the old 17 categories, renamed and grouped for the new navigation ----------
export type CollectionMeta = { title: string; group: 'petrecere' | 'cer' | 'fum' | 'pro' | 'altele'; blurb: string };
export const collectionMeta: Record<string, CollectionMeta> = {
  'produse-f1-pentru-public': { title: 'Divertisment F1', group: 'petrecere', blurb: 'Titireze, pocnitori și efecte mici, legale pentru toți cei peste 16 ani.' },
  'vulcani-artificii': { title: 'Vulcani și fântâni', group: 'cer', blurb: 'Jerbe de scântei care stau pe loc și ard frumos, aproape de public.' },
  'artificii-de-tort': { title: 'Artificii de tort', group: 'petrecere', blurb: 'Scântei reci și flăcări mici pentru tortul de la aniversare sau nuntă.' },
  'bengale-candele': { title: 'Bengale și candele', group: 'petrecere', blurb: 'Lumină în mână pentru poze, intrări și momente de dans.' },
  'artificii-de-brad': { title: 'Artificii de brad', group: 'petrecere', blurb: 'Steluțe de Crăciun pentru brad și masa de sărbători.' },
  'artificii-de-interior': { title: 'Artificii de interior', group: 'petrecere', blurb: 'Efecte gândite pentru săli și spații închise.' },
  'confetti': { title: 'Confetti', group: 'petrecere', blurb: 'Tunuri de confetti pentru final de petrecere.' },
  'gender-reveal': { title: 'Gender reveal', group: 'petrecere', blurb: 'Fum și confetti în roz sau albastru pentru marele anunț.' },
  'asortimente-pachete': { title: 'Pachete', group: 'petrecere', blurb: 'Seturi gata făcute, ca să nu mai alegi bucată cu bucată.' },
  'fumigene-colorate': { title: 'Fumigene colorate', group: 'fum', blurb: 'Fum dens în culori puternice pentru ședințe foto și stadion.' },
  'baterii-de-artificii': { title: 'Baterii de artificii', group: 'pro', blurb: 'Baterii cu zeci de focuri pe cer. Doar pentru persoane autorizate.' },
  'artificii-de-exterior': { title: 'Artificii de exterior', group: 'pro', blurb: 'Efecte mari pe cer pentru spectacole. Doar pentru persoane autorizate.' },
  'petarde': { title: 'Petarde și emițătoare', group: 'pro', blurb: 'Emițătoare de sunet și petarde din categoria P1. Doar pentru persoane autorizate.' },
  'produse-import': { title: 'Produse import', group: 'pro', blurb: 'Selecție de import din mai multe categorii.' },
  'oferta-la-bax': { title: 'Oferta la bax', group: 'pro', blurb: 'Cantități mari, la preț de bax.' },
  'torte': { title: 'Torțe', group: 'altele', blurb: 'Torțe de semnalizare și de stadion.' },
  'airsoft-paintball': { title: 'Airsoft și paintball', group: 'altele', blurb: 'Grenade și accesorii pirotehnice pentru airsoft.' },
};
export const groups = {
  petrecere: { title: 'Petrecere', blurb: 'Tort, brad, confetti, bengale' },
  cer: { title: 'Pe cer', blurb: 'Vulcani și fântâni de scântei' },
  fum: { title: 'Fum colorat', blurb: 'Fumigene în toate culorile' },
  pro: { title: 'Profesioniști', blurb: 'P1 și T1, doar autorizați' },
  altele: { title: 'Altele', blurb: 'Torțe, airsoft' },
} as const;

export type Collection = { handle: string; title: string; group: CollectionMeta['group']; blurb: string; products: Product[] };
export const collections: Collection[] = (collectionsData as { collections: { handle: string }[] }).collections.map((c) => {
  const meta = collectionMeta[c.handle] ?? { title: c.handle, group: 'altele' as const, blurb: '' };
  return { handle: c.handle, ...meta, products: products.filter((p) => p.collections.includes(c.handle)) };
});
export const collectionByHandle = (h: string) => collections.find((c) => c.handle === h);

// Virtual collections (Shopify: automated collections by tag/condition)
export const virtualCollections = {
  all: { title: 'Toate produsele', blurb: 'Tot catalogul Bomba Shop.', filter: (_: Product) => true },
  public: { title: 'Pentru public · F1', blurb: 'Produse din categoria F1, disponibile pentru public de la 16 ani.', filter: (p: Product) => isF1(p) },
  profesionisti: { title: 'Pentru profesioniști · P1 / T1', blurb: 'Doar pentru firme și persoane autorizate.', filter: (p: Product) => isPro(p) },
  reduceri: { title: 'Reduceri', blurb: 'Produse cu preț redus față de prețul obișnuit.', filter: (p: Product) => !!compareAt(p) },
} as const;

// ---------- Product helpers ----------
export const variant = (p: Product) => p.variants[0];
export const price = (p: Product) => variant(p).price;
export const compareAt = (p: Product) => variant(p).compare_at_price;
export const available = (p: Product) => variant(p).available;
export const category = (p: Product) => p.metafields.pyro.category;
export const isF1 = (p: Product) => category(p) === 'F1';
export const isPublic = (p: Product) => isF1(p) || (category(p) === null && !/T1|P1/.test(p.title));
export const isPro = (p: Product) => !!p.metafields.pyro.category && p.metafields.pyro.category !== 'F1';
export const productUrl = (p: Product) => `/products/${p.handle}`;
export const collectionUrl = (h: string) => `/collections/${h}`;
export const byHandle = (h: string) => products.find((p) => p.handle === h);
export const imagesOf = (p: Product): ProductImage[] => imageMap[p.handle] ?? [];

const lei = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (v: number | null | undefined) => (v == null ? '—' : `${lei.format(v)} lei`);
export const discountPct = (p: Product) => {
  const c = compareAt(p), v = price(p);
  return c && v ? Math.round((1 - v / c) * 100) : 0;
};

// ---------- Effects: colour of the effect, named after the salt that produces it ----------
export type Effect = { key: string; label: string; salt: string; color: string };
const SALTS: Record<string, Omit<Effect, 'label'>> = {
  rosu: { key: 'rosu', salt: 'stronțiu', color: 'var(--fx-strontium)' },
  galben: { key: 'galben', salt: 'sodiu', color: 'var(--fx-sodium)' },
  verde: { key: 'verde', salt: 'bariu', color: 'var(--fx-barium)' },
  albastru: { key: 'albastru', salt: 'cupru', color: 'var(--fx-copper)' },
  violet: { key: 'violet', salt: 'potasiu', color: 'var(--fx-potassium)' },
  alb: { key: 'alb', salt: 'magneziu', color: 'var(--fx-magnesium)' },
};
const COLOR_WORDS: [RegExp, keyof typeof SALTS, string][] = [
  [/\b(ro[șs]u|ro[șs]ie|red)\b/i, 'rosu', 'Roșu'],
  [/\b(roz|pink)\b/i, 'rosu', 'Roz'],
  [/\b(galben|gold|aur|auriu|golden)\b/i, 'galben', 'Auriu'],
  [/\b(verde|green)\b/i, 'verde', 'Verde'],
  [/\b(albastr[uă]|blue)\b/i, 'albastru', 'Albastru'],
  [/\b(violet|mov|purple)\b/i, 'violet', 'Violet'],
  [/\b(alb|alb[ăa]|white|silver|argintiu)\b/i, 'alb', 'Alb'],
];
export function effectColor(p: Product): Effect | null {
  const text = `${p.metafields.pyro.effect ?? ''} ${p.title}`;
  for (const [re, key, label] of COLOR_WORDS) if (re.test(text)) return { ...SALTS[key], label };
  return null;
}

// Effect type for filters (text from the shop's own "EFECT" field or the product name, never guessed beyond that)
const TYPES: [RegExp, string][] = [
  [/fum|fumigen|smoke/i, 'Fum colorat'],
  [/crackling|pocnit/i, 'Crackling'],
  [/stroboscop|strobo/i, 'Stroboscop'],
  [/jerb|vulcan|f[âa]nt[âa]n/i, 'Jerbă / vulcan'],
  [/titirez|spinner|moris/i, 'Titirez'],
  [/bang|petard|emi[țt][ăa]tor|sunet|scream/i, 'Sunet'],
  [/confetti/i, 'Confetti'],
  [/bengal|candel|sc[âa]nteie/i, 'Bengală'],
  [/flam|flac/i, 'Flacără'],
  [/pe cer|baterie|rachet/i, 'Pe cer'],
];
export function effectType(p: Product): string | null {
  const text = `${p.metafields.pyro.effect ?? ''} ${p.title}`;
  for (const [re, label] of TYPES) if (re.test(text)) return label;
  return null;
}

// ---------- Specs for the label system (DESIGN.md §5). Missing values stay null and render as "—". ----------
export type SpecCell = { key: string; label: string; value: string | null; source?: string };
export function specs(p: Product): SpecCell[] {
  const m = p.metafields.pyro;
  const n = (s: Spec, unit = '') => (s ? `${Number.isInteger(s.value) ? s.value : s.value.toFixed(1).replace('.', ',')}${unit}` : null);
  return [
    { key: 'shots', label: 'Focuri', value: n(m.shots), source: m.shots?.source },
    { key: 'calibre', label: 'Calibru', value: n(m.calibre_mm, ' mm'), source: m.calibre_mm?.source },
    { key: 'duration', label: 'Timp', value: n(m.duration_s, ' s'), source: m.duration_s?.source },
    { key: 'pack', label: 'Buc', value: n(m.pack_qty), source: m.pack_qty?.source },
    { key: 'effect', label: 'Efect', value: effectType(p) },
  ];
}
/** Cells for a card: only values we actually know (unknown ones stay on the product page), at most `max`. */
export function cardSpecs(p: Product, max = 2): SpecCell[] {
  return specs(p).filter((c) => c.value).slice(0, max);
}

/** The card's one line of facts, e.g. "36 focuri · 25 mm · Crackling" (known values only). */
export function specLine(p: Product, max = 3) {
  const unit: Record<string, (v: string) => string> = { shots: (v) => `${v} focuri`, pack: (v) => `${v} buc.` };
  return cardSpecs(p, max).map((c) => (unit[c.key] ? unit[c.key](c.value!) : c.value)).join(' · ');
}

export function plainText(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
