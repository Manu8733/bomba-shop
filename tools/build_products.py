"""Turn the crawled bomba-shop.ro pages into Shopify-shaped data/products.json + data/collections.json.

Usage: python tools/build_products.py
Reads research/raw/products_raw.json and research/raw/pages/*.html. Never invents values: a spec is either
read from the product's parameter table ("tabel"), parsed from the store's own description ("descriere"), or null.
"""
import html, json, re, unicodedata, pathlib
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "research" / "raw"
OUT = ROOT / "data"
OUT.mkdir(exist_ok=True)


def slugify(s):
    s = unicodedata.normalize("NFKD", s.replace("ș", "s").replace("ş", "s").replace("ț", "t").replace("ţ", "t"))
    s = s.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def money(s):
    m = re.search(r"(\d+(?:[.,]\d+)?)", (s or "").replace(".", "").replace(" ", "")) if s else None
    return round(float(m.group(1).replace(",", ".")), 2) if m else None


# the old platform stored ș/ț as "?" in product names; these are every damaged word in the catalog
BROKEN = {"?i": "și", "Bucă?i": "Bucăți", "Emi?ător": "Emițător", "emi?ător": "emițător", "Ie?iri": "Ieșiri",
          "Ro?ie": "Roșie", "Ro?u": "Roșu", "Protec?ie": "Protecție", "Tor?ă": "Torță", "Cârti?elor": "Cârtițelor",
          "Eficien?ă": "Eficiență", "Na?tere": "Naștere", "Elegan?ă": "Eleganță", "Anun?": "Anunț",
          "Anun?ul": "Anunțul", "Băie?el": "Băiețel", "Bebelu?ului": "Bebelușului"}


def clean_title(t):
    t = (t or "").strip()
    return re.sub(r"[^\s,;:()–-]*\?[^\s,;:()–-]*", lambda m: BROKEN.get(m.group(0), m.group(0)), t)


def description_html(page):
    m = re.search(r'<div class="part selected" id="description">(.*?)<!-- END description-->', page, re.S)
    if not m:
        return ""
    body = re.sub(r"<h3>\s*Specificatie completa\s*</h3>", "", m.group(1))
    body = re.sub(r'\s(style|class|id)="[^"]*"', "", body)
    body = re.sub(r"</?(span|strong|div|font|b)>", "", body)
    body = re.sub(r"(<br\s*/?>\s*){2,}", "</p><p>", body)
    body = re.sub(r"<br\s*/?>", " ", body)
    body = re.sub(r"\s+", " ", body).strip()
    body = re.sub(r"<p>\s*</p>", "", body)
    return body


def spec(value, source):
    return {"value": value, "source": source} if value is not None else None


def num(s):
    m = re.search(r"(\d+(?:[.,]\d+)?)", s or "")
    return float(m.group(1).replace(",", ".")) if m else None


raw = json.loads((RAW / "products_raw.json").read_text(encoding="utf-8"))
handles = Counter()
products, by_collection = [], defaultdict(list)

for i, p in enumerate(raw, 1):
    slug = re.sub(r"[^A-Za-z0-9_.-]+", "_", p["url"].split("bomba-shop.ro/")[-1])
    page = (RAW / "pages" / f"{slug}.html").read_text(encoding="utf-8")
    q = p["params"]
    title = clean_title(p["title"])
    h = slugify(title) or f"produs-{i}"
    handles[h] += 1
    if handles[h] > 1:
        h = f"{h}-{handles[h]}"
    body = description_html(page)
    dtext = text(body).lower()

    cat_raw = q.get("CATEGORIE", "")
    m = re.search(r"\b([FPT][1-4])\b", cat_raw)
    cat = m.group(1) if m else None
    audience = "public" if cat == "F1" else ("autorizat" if cat else None)

    shots = spec(int(num(q["Numar focuri"])), "tabel") if num(q.get("Numar focuri")) else None
    if not shots and (m := re.search(r"(\d+)\s*(?:de\s*)?focuri", dtext)):
        shots = spec(int(m.group(1)), "descriere")
    cal = spec(num(q.get("Calibru")), "tabel") if num(q.get("Calibru")) else None
    if not cal and (m := re.search(r"calibru(?:l)?\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*mm", dtext)):
        cal = spec(float(m.group(1).replace(",", ".")), "descriere")
    dur_src = q.get("Timp") or q.get("Durata")
    dur = spec(num(dur_src), "tabel") if num(dur_src) else None
    if not dur and (m := re.search(r"(\d+)\s*(?:de\s*)?(?:secunde|sec\b)", dtext)):
        dur = spec(float(m.group(1)), "descriere")
    pack = None
    if m := re.search(r"(?:contine|adica|set de|pachet de)\s*(\d+)\s*(?:de\s*)?(?:bucati|buc)", dtext):
        pack = spec(int(m.group(1)), "descriere")

    # keep only this product's photos (the JSON-LD sometimes lists every image on the page)
    imgs = p.get("images") or []
    if isinstance(imgs, str):  # JSON-LD gives a bare string when there is a single photo
        imgs = [imgs]
    pid = re.search(r"_vyr\w*?_(\d+)", imgs[0]).group(1) if imgs and re.search(r"_vyr\w*?_(\d+)", imgs[0]) else None
    if pid:
        imgs = [u for u in imgs if re.search(rf"_vyr\w*?_{pid}[A-Za-z]", u)]
    seen, images = set(), []
    for u in imgs:
        if u in seen:
            continue
        seen.add(u)
        images.append({"id": len(images) + 1, "position": len(images) + 1, "src_original": u,
                       "src": f"/images/products/{h}/{len(images) + 1}.webp", "alt": title if not images else f"{title}, imaginea {len(images) + 1}"})

    price = round(float(p["price"] or 0), 2)
    compare = money(q.get("Preţ obisnuit"))
    stock = int(m.group(1)) if (m := re.search(r"(\d+)", q.get("Pe stoc", ""))) else None
    crumbs = [c.strip() for c in p.get("breadcrumbs", [])]
    coll_title = crumbs[1].title() if len(crumbs) > 1 else "Diverse"
    coll = slugify(coll_title)
    effect = q.get("EFECT") or None

    tags = [t for t in [cat, f"public-{audience}" if audience else None, p.get("brand"), effect] if t]
    product = {
        "id": i,
        "handle": h,
        "title": title,
        "body_html": body,
        "vendor": p.get("brand") or "",
        "product_type": coll_title,
        "tags": tags,
        "status": "active",
        "options": [{"name": "Title", "values": ["Default Title"]}],
        "variants": [{"id": i * 10, "title": "Default Title", "price": price if price > 0 else None,
                      "compare_at_price": compare if compare and compare > price else None,
                      "sku": q.get("EAN") or p.get("code") or "", "available": bool(p["available"]),
                      "inventory_quantity": stock}],
        "images": images,
        "collections": [coll],
        "metafields": {
            "pyro": {"category": cat, "audience": audience, "category_raw": cat_raw or None,
                     "shots": shots, "calibre_mm": cal, "duration_s": dur, "pack_qty": pack, "effect": effect},
            "legacy": {"url": p["url"], "path": "/" + p["url"].split("bomba-shop.ro/")[-1],
                       "h1": text(m.group(1)) if (m := re.search(r"<h1>(.*?)</h1>", page, re.S)) else None},
        },
        "flags": [f for f, ok in [("pret_lipsa", price <= 0), ("fara_categorie", not cat),
                                   ("fara_imagini", not images), ("descriere_lipsa", len(text(body)) < 30)] if ok],
    }
    products.append(product)
    by_collection[coll].append(product)

collections = [{"handle": k, "title": v[0]["product_type"], "products_count": len(v),
                "available_count": sum(x["variants"][0]["available"] for x in v)}
               for k, v in sorted(by_collection.items(), key=lambda kv: -len(kv[1]))]
(OUT / "products.json").write_text(json.dumps({"products": products}, ensure_ascii=False, indent=1), encoding="utf-8")
(OUT / "collections.json").write_text(json.dumps({"collections": collections}, ensure_ascii=False, indent=1), encoding="utf-8")
redirects = [{"from": p["metafields"]["legacy"]["path"], "to": f"/products/{p['handle']}"} for p in products]
(OUT / "redirects.json").write_text(json.dumps(redirects, ensure_ascii=False, indent=1), encoding="utf-8")

c = Counter(f for p in products for f in p["flags"])
src = Counter((k, v["source"]) for p in products for k, v in p["metafields"]["pyro"].items() if isinstance(v, dict))
print(f"{len(products)} produse, {len(collections)} colecții, {sum(len(p['images']) for p in products)} imagini")
print("probleme:", dict(c))
print("surse specificații:", {f"{k}/{s}": n for (k, s), n in sorted(src.items())})
print("titluri încă cu '?':", [p["title"] for p in products if "?" in p["title"]])
print("imagini pe produs:", Counter(len(p["images"]) for p in products).most_common())
