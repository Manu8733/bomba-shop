"""Stand a cut-out product on the ground: trim its transparent margins and bake a contact shadow under its base.

A product photo cut out of its background floats; a real object on a floor has a tight, dark contact line where it
touches and a soft occlusion pool around it. Both are drawn from the product's own footprint (the columns its bottom
rows cover), so a thin tube gets a small shadow and a wide box a long one.

ground(im) -> (image, obj) where obj = [x0, y0, x1, y1] is the product's box inside the new image (fractions); y1 is
the floor line, used by the hero stage to put the effect's nozzle and light in the right place.
"""
from PIL import Image, ImageFilter
import numpy as np


def ground(im: Image.Image):
    im = im.convert("RGBA")
    a = np.asarray(im)[:, :, 3]
    rows = (a > 40).sum(axis=1)
    cols = (a > 40).sum(axis=0)
    min_cov = max(2, int(im.width * .005))
    ys = np.where(rows >= min_cov)[0]
    xs = np.where(cols >= max(2, int(im.height * .005)))[0]
    if not len(ys) or not len(xs):
        return im, [0, 0, 1, 1]
    im = im.crop((int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1))
    a = np.asarray(im)[:, :, 3].astype(np.float32) / 255
    W, H = im.size

    # footprint: how much of each column the bottom rows cover
    band = max(2, int(H * .04))
    foot = a[H - band:, :].max(axis=0)
    xs = np.where(foot > .2)[0]
    if not len(xs):
        xs = np.array([0, W - 1])
    fx0, fx1 = int(xs[0]), int(xs[-1])
    fw = max(4, fx1 - fx0)

    pad_y = int(max(H * .055, fw * .16, 8))           # room under the base for the shadow
    pad_x = int(max(fw * .12, 6))                       # the occlusion pool reaches a little past the base
    CW, CH = W + 2 * pad_x, H + pad_y
    base_y = H                                          # the floor line in canvas coordinates (before crop offsets)

    # 1 occlusion pool: a wide soft ellipse centred on the floor line
    pool = Image.new("L", (CW, CH), 0)
    ell = Image.new("L", (CW, CH), 0)
    from PIL import ImageDraw
    d = ImageDraw.Draw(ell)
    cx = pad_x + (fx0 + fx1) / 2
    rx, ry = fw * .62 + pad_x * .5, max(3, pad_y * .42)
    d.ellipse((cx - rx, base_y - ry, cx + rx, base_y + ry), fill=190)
    pool = ell.filter(ImageFilter.GaussianBlur(max(2, pad_y * .38)))

    # 2 contact line: the footprint itself, squashed onto the floor, dark and only slightly blurred
    contact = np.zeros((CH, CW), np.float32)
    t = max(2, int(pad_y * .14))
    contact[base_y - t // 2: base_y + t, pad_x: pad_x + W] = foot[None, :] * 210
    contact_img = Image.fromarray(contact.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(1.5, pad_y * .2)))

    shadow_a = np.maximum(np.asarray(pool, np.float32), np.asarray(contact_img, np.float32))
    # the pool is wider than the canvas for wide products: fade it out towards the left/right edges, or the image
    # box shows as a dark rectangle on a lighter floor
    ramp = np.clip(np.minimum(np.arange(CW), np.arange(CW)[::-1]) / max(1, pad_x), 0, 1)
    shadow_a *= (ramp * ramp * (3 - 2 * ramp))[None, :]
    shadow = np.zeros((CH, CW, 4), np.uint8)
    shadow[:, :, 3] = shadow_a.clip(0, 255).astype(np.uint8)       # black, alpha = shadow density
    out = Image.fromarray(shadow, "RGBA")
    out.alpha_composite(im, (pad_x, 0))
    obj = [round(pad_x / CW, 4), 0.0, round((pad_x + W) / CW, 4), round(H / CH, 4)]
    return out, obj


if __name__ == "__main__":
    import sys
    from pathlib import Path
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    for f in sys.argv[3:]:
        img, obj = ground(Image.open(src / f))
        img.save(dst / (f.replace("/", "_") + ".png"))
        print(f, img.size, obj)
