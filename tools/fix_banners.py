"""Remove "Bomba-Shop.ro" label strips that survived background removal, working on the cut-outs themselves.

Usage: tools/.venv/Scripts/python tools/fix_banners.py [--dry]
In a cut-out the background is already transparent, so a leftover banner is an opaque, light, low-saturation
rectangle (with coloured text inside) near the bottom. When it stands apart from the product it is cleared and the
image is re-cropped. When product pixels touch it on both sides it is left alone and reported for review.
Backups go to assets/processed/_before_banner_fix/.
"""
import json, pathlib, shutil, sys
import numpy as np
import cv2
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROC = ROOT / "assets" / "processed"
BACKUP = PROC / "_before_banner_fix"
dry = "--dry" in sys.argv


def find_strip(rgba):
    a = rgba[..., 3] > 160
    hsv = cv2.cvtColor(rgba[..., :3], cv2.COLOR_RGB2HSV)
    light = (hsv[..., 2] > 200) & (hsv[..., 1] < 60) & a
    H, W = a.shape
    # close the text holes inside the white strip
    k = max(3, W // 60)
    m = cv2.morphologyEx(light.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((k, k * 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    best = None
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if y + h < H * 0.55:                       # banners sit in the lower part
            continue
        if not (0.22 * W < w < 0.98 * W and h > 6 and 2.6 < w / h < 14):
            continue
        box = light[y:y + h, x:x + w]
        fill = box.mean()
        text = 1 - fill                               # text pixels inside the strip
        if fill < 0.5 or text < 0.04:
            continue
        if best is None or area > best[4]:
            best = (x, y, w, h, area)
    return best


def touches_product(rgba, x, y, w, h):
    """Opaque pixels just left and right of the strip, on its rows, mean the product continues through it."""
    a = rgba[..., 3] > 160
    H, W = a.shape
    pad = max(4, w // 40)
    left = a[y:y + h, max(0, x - pad * 3):max(0, x - pad)]
    right = a[y:y + h, min(W, x + w + pad):min(W, x + w + pad * 3)]
    above = a[max(0, y - pad * 2):max(0, y - 2), x + w // 5:x + w - w // 5]
    side = (left.mean() if left.size else 0) > 0.35 and (right.mean() if right.size else 0) > 0.35
    return side, (above.mean() if above.size else 0)


def main():
    status = {}
    for lf in PROC.glob("log-*.jsonl"):
        for line in lf.read_text(encoding="utf-8").splitlines():
            e = json.loads(line)
            if e.get("status") == "ok":
                status[f"{e['handle']}/{pathlib.Path(e['file']).stem}"] = e
    fixed, review = [], []
    for key in sorted(status):
        f = PROC / f"{key}.webp"
        if not f.exists():
            continue
        rgba = np.array(Image.open(f).convert("RGBA"))
        hit = find_strip(rgba)
        if not hit:
            continue
        x, y, w, h, _ = hit
        side, above = touches_product(rgba, x, y, w, h)
        if side:
            review.append(key)
            continue
        if dry:
            fixed.append(key)
            continue
        BACKUP.joinpath(key).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(f, BACKUP / f"{key}.webp")
        g = max(3, h // 6)
        rgba[max(0, y - g):y + h + g, max(0, x - g):x + w + g, 3] = 0
        # drop specks left around the old strip (thin shadows, anti-aliasing)
        a = (rgba[..., 3] > 30).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(a)
        keep = np.zeros_like(a, bool)
        big = max(st[1:, 4]) if n > 1 else 0
        for i in range(1, n):
            if st[i, 4] >= big * 0.02:
                keep |= lab == i
        rgba[..., 3] = np.where(keep, rgba[..., 3], 0)
        img = Image.fromarray(rgba)
        if img.getbbox():
            img = img.crop(img.getbbox())
        img.save(f, "WEBP", quality=88, method=5)
        fixed.append(key)
    (PROC / "banner-fix.json").write_text(json.dumps({"fixed": fixed, "review": review}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{'would fix' if dry else 'fixed'} {len(fixed)}; overlap, needs review {len(review)}")


if __name__ == "__main__":
    main()
