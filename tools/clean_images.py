"""Remove the old Bomba-Shop.ro watermarks from product photos and cut out the background.

Usage:
  tools/.venv/Scripts/python tools/clean_images.py --files a/1.png,b/2.jpg   # specific photos (handle/file)
  tools/.venv/Scripts/python tools/clean_images.py --worker 0 --workers 4     # one shard of the whole catalog
  tools/.venv/Scripts/python tools/clean_images.py --sheet assets/processed/x.jpg --files ...

Per photo, driven by assets/processed/classification.json when present (visual review), else by the detectors:
  thirdparty -> skipped: another shop's watermark is never removed; the photo is flagged for the owner
  logo       -> LaMa inpainting over the detected Bomba logo, then background cut-out
  banner     -> background cut-out; a banner strip that survives is cleared (or inpainted if it covers the product)
  none       -> background cut-out
Writes assets/processed/<handle>/<n>.webp (transparent), <n>_clean.jpg (watermark-free, original background)
and one JSON line per photo to assets/processed/log-<worker>.jsonl. Originals are never touched.
"""
import argparse, json, pathlib, sys
import numpy as np
import cv2
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from watermarks import LogoDetector, ThirdPartyDetector, find_banner  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORIG = ROOT / "assets" / "originals"
OUT = ROOT / "assets" / "processed"
LAMA = ROOT / "tools" / "models" / "lama_fp32.onnx"
LOGO_MIN = 0.72      # logo detector score that counts as a real Bomba logo (validated on a 48-photo sample)
LOGO_CONFIRMED_MIN = 0.5  # same, when the visual review already confirmed a logo is present
THIRD_MIN = 0.6      # third-party detector score that counts as a match without visual review


class Lama:
    def __init__(self):
        import onnxruntime as ort
        self.s = ort.InferenceSession(str(LAMA), providers=["CPUExecutionProvider"])
        self.inp = [i.name for i in self.s.get_inputs()]

    def __call__(self, rgb, mask):
        """Inpaint inside a square crop around the mask so LaMa works at a useful resolution."""
        ys, xs = np.where(mask > 0)
        if len(xs) == 0:
            return rgb
        cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
        side = int(max(xs.max() - xs.min(), ys.max() - ys.min()) * 1.6) + 48
        side = min(side, min(rgb.shape[:2]))
        x0 = int(np.clip(cx - side / 2, 0, rgb.shape[1] - side))
        y0 = int(np.clip(cy - side / 2, 0, rgb.shape[0] - side))
        crop, mcrop = rgb[y0:y0 + side, x0:x0 + side], mask[y0:y0 + side, x0:x0 + side]
        img = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
        m = (cv2.resize(mcrop, (512, 512), interpolation=cv2.INTER_NEAREST) > 0).astype(np.float32)
        out = self.s.run(None, {self.inp[0]: img.transpose(2, 0, 1)[None], self.inp[1]: m[None, None]})[0][0].transpose(1, 2, 0)
        if out.max() <= 1.5:
            out = out * 255.0
        out = cv2.resize(np.clip(out, 0, 255).astype(np.uint8), (side, side), interpolation=cv2.INTER_CUBIC)
        soft = cv2.GaussianBlur(mcrop.astype(np.float32) / 255.0, (0, 0), 1.5)[..., None]
        res = rgb.copy()
        res[y0:y0 + side, x0:x0 + side] = (out * soft + crop * (1 - soft)).astype(np.uint8)
        return res


def rotated_logo_search(det, rgb):
    """Some photos carry the logo turned 90°; search those orientations when the upright search fails."""
    best = (*det.find(rgb), 0)
    for k in (1, 3):
        s, box = det.find(np.ascontiguousarray(np.rot90(rgb, k)))
        if s > best[0]:
            best = (s, box, k)
    return best


def erase_logo(det, lama, rgb, entry, confirmed=False):
    """confirmed=True when the visual review saw a logo: then the best match is trusted at a lower score
    (dark packaging hides the black bomb and lowers the score, but the match position stays right)."""
    score, box, rot = rotated_logo_search(det, rgb)
    entry["logo_score"] = round(score, 3)
    if score < (LOGO_CONFIRMED_MIN if confirmed else LOGO_MIN) or box is None:
        return rgb, False
    work = np.ascontiguousarray(np.rot90(rgb, rot)) if rot else rgb
    work = lama(work, det.mask(work.shape, box))
    # second look: a part of the logo can survive on busy packaging
    s2, box2 = det.find(work)
    entry["logo_leftover"] = round(s2, 3)
    if s2 >= LOGO_MIN and box2 is not None:
        work = lama(work, det.mask(work.shape, box2, grow=0.03))
        entry["second_pass"] = True
    entry["logo_rotation"] = rot * 90
    return (np.ascontiguousarray(np.rot90(work, -rot)) if rot else work), True


def handle_banner(lama, session, rgb, entry):
    """Cut out first; the banner normally disappears with the background. If the product continues
    under the strip, inpaint the strip on the original and cut out again."""
    from rembg import remove
    box = find_banner(rgb)
    cut = np.array(remove(Image.fromarray(rgb), session=session, post_process_mask=True))
    if box is None:
        return rgb, cut
    x, y, w, h = [int(round(v)) for v in box]
    entry["banner_box"] = [x, y, w, h]
    a = cut[..., 3]
    above = a[max(0, y - 6):y, x + w // 6:x + w - w // 6]
    inside = a[y:y + h, x:x + w]
    if above.size and (above > 128).mean() > 0.35:  # product runs into the banner
        m = np.zeros(rgb.shape[:2], np.uint8)
        m[max(0, y - 4):y + h + 4, max(0, x - 4):x + w + 4] = 255
        rgb = lama(rgb, m)
        cut = np.array(remove(Image.fromarray(rgb), session=session, post_process_mask=True))
        entry["banner_inpainted"] = True
    elif inside.size and (inside > 128).mean() > 0.05:  # strip kept as foreground: clear it
        cut[max(0, y - 4):y + h + 4, max(0, x - 4):x + w + 4, 3] = 0
        entry["banner_cleared"] = True
    return rgb, cut


def finish(handle, f, clean, cut, entry):
    a = cut[..., 3]
    entry["subject_ratio"] = round(float((a > 128).mean()), 3)
    img = Image.fromarray(cut)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    img.thumbnail((1600, 1600))
    d = OUT / handle
    d.mkdir(parents=True, exist_ok=True)
    img.save(d / f"{f.stem}.webp", "WEBP", quality=88, method=5)
    Image.fromarray(clean).save(d / f"{f.stem}_clean.jpg", quality=90)
    entry["out"] = f"assets/processed/{handle}/{f.stem}.webp"


def process(handle, f, cls, logo, third, lama, session):
    from rembg import remove
    rgb = np.array(Image.open(f).convert("RGB"))
    entry = {"handle": handle, "file": f.name, "class": cls}
    if cls is None:  # no visual review available: decide from detectors
        ts, _ = third.find(rgb)
        entry["third_score"] = round(ts, 3)
        cls = "thirdparty" if ts >= THIRD_MIN else None
    if cls == "thirdparty":
        entry["status"] = "skipped_thirdparty"
        return entry
    clean = rgb
    if cls in (None, "logo"):
        clean, erased = erase_logo(logo, lama, rgb, entry, confirmed=cls == "logo")
        if cls == "logo" and not erased:
            entry["status"] = "logo_not_found"
    if cls == "banner" or (cls is None and find_banner(clean) is not None):
        clean, cut = handle_banner(lama, session, clean, entry)
    else:
        cut = np.array(remove(Image.fromarray(clean), session=session, post_process_mask=True))
    finish(handle, f, clean, cut, entry)
    entry.setdefault("status", "ok")
    return entry


def all_photos():
    products = json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))["products"]
    for p in products:
        d = ORIG / p["handle"]
        if d.exists():
            for f in sorted(d.glob("*.*"), key=lambda x: int(x.stem)):
                yield p["handle"], f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", default="")
    ap.add_argument("--worker", type=int, default=0)
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    from rembg import new_session
    logo, third, lama, session = LogoDetector(), ThirdPartyDetector(), Lama(), new_session("isnet-general-use")
    cls_file = OUT / "classification.json"
    classes = json.loads(cls_file.read_text(encoding="utf-8")) if cls_file.exists() else {}
    if args.files:
        photos = [(s.split("/")[0], ORIG / s) for s in args.files.split(",")]
    else:
        photos = [ph for i, ph in enumerate(all_photos()) if i % args.workers == args.worker]
    OUT.mkdir(parents=True, exist_ok=True)
    log = OUT / f"log-{args.worker if not args.files else 'files'}.jsonl"
    done = set()
    if not args.force:  # skip photos already handled in any earlier run (failed ones are retried)
        for lf in OUT.glob("log-*.jsonl"):
            for e in map(json.loads, lf.read_text(encoding="utf-8").splitlines()):
                if e.get("status") != "error":
                    done.add((e["handle"], e["file"]))
    with log.open("a", encoding="utf-8") as fh:
        for handle, f in photos:
            if (handle, f.name) in done:
                continue
            try:
                e = process(handle, f, classes.get(f"{handle}/{f.name}"), logo, third, lama, session)
            except Exception as ex:  # keep going; the photo is reported as failed
                e = {"handle": handle, "file": f.name, "status": "error", "error": str(ex)[:200]}
            fh.write(json.dumps(e, ensure_ascii=False) + "\n")
            fh.flush()
            print(f"{handle}/{f.name}: {e.get('status')} {e.get('class') or ''} logo={e.get('logo_score', '-')}", flush=True)
    print("DONE worker", args.worker)


if __name__ == "__main__":
    main()
