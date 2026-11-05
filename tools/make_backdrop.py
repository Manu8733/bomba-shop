"""The site's backdrop: the night of a show, seen through a lens focused on the shop window. Far away and out of focus,
shells open into long-exposure trails (gold willows, a red peony, a cool silver one) in the upper corners; thin smoke hangs
in the air, lit warm from below; a fine film grain goes on top in CSS. The middle stays dark, so text reads on it.
Rendered small and lossless (the browser's smooth upscaling keeps the dark gradients free of steps).
Writes web/public/images/bg/night.webp (landscape), night-p.webp (portrait) and grain-160.png.
Usage: python tools/make_backdrop.py"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "images" / "bg"


def value_noise(rng, h, w, cy, cx):
    """smooth noise: a random grid with cells of cy × cx pixels, bicubic-upsampled"""
    gh, gw = int(h / cy) + 4, int(w / cx) + 4
    g = Image.fromarray(rng.random((gh, gw)).astype(np.float32), "F")
    return np.asarray(g.resize((int(gw * cx), int(gh * cy)), Image.BICUBIC), np.float32)[:h, :w]


def wisps(rng, h, w, scale):
    """ridged fBm stretched sideways: thin filaments of smoke, the way it hangs after the shells have burst"""
    out, amp, tot = np.zeros((h, w), np.float32), 1.0, 0.0
    for o in range(6):
        cy, cx = scale * .34 / 2 ** o, scale * 1.5 / 2 ** o
        n = value_noise(rng, h, w, max(1.2, cy), max(1.5, cx))
        out += (1 - np.abs(2 * n - 1)) ** 2 * amp
        tot += amp; amp *= .55
    out /= tot
    return np.clip((out - .32) / .5, 0, 1) ** 1.8


def burst(rng, h, w, cx, cy, radius, n, droop, blur):
    """one shell, as a long exposure: n trails thrown out from (cx, cy), falling under gravity, fading as they cool;
    then blurred, because it is far behind the lens's focus. Returns a float light map."""
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(-.08, .08)
        v = radius * rng.uniform(.75, 1.05)
        pts, steps = [], 40
        for s in range(steps + 1):
            t = .14 + .86 * s / steps                            # the trails start a little out: no blob at the centre
            pts.append((cx + math.cos(a) * v * t, cy - math.sin(a) * v * t + droop * radius * t * t))
        for s in range(steps):                                   # burning along the way, cooling at the tail
            t = s / steps
            d.line([pts[s], pts[s + 1]], fill=int(255 * min(1, t * 6) * (1 - t) ** .9), width=2)
    im = im.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(im, np.float32) / 255


def backdrop(w, h, name, seed, bursts):
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    y3 = y[..., None]
    night = np.array([7, 6, 11], np.float32) * (1 - y3) + np.array([12, 9, 14], np.float32) * y3
    img = night.repeat(w, axis=1)
    # smoke: a thin layer high up, a denser one low, near where it was fired
    s = wisps(rng, h, w, scale=min(w, h) * .55) * (.55 + .9 * value_noise(rng, h, w, h * .5, w * .45))
    band = .5 * np.exp(-((y - .22) / .14) ** 2) + .95 * np.exp(-((y - .8) / .22) ** 2)
    cool, warm = np.array([44, 40, 66], np.float32), np.array([86, 54, 36], np.float32)
    img += (s * band)[..., None] * ((cool * (1 - y3) + warm * y3) - night) * .55
    # the shells: far away, out of focus
    for (fx, fy, fr, col, gain, droop) in bursts:
        light = burst(rng, h, w, fx * w, fy * h, fr * min(w, h), 38, droop, blur=min(w, h) * .0035)
        halo = burst(rng, h, w, fx * w, fy * h, fr * min(w, h), 38, droop, blur=min(w, h) * .03)
        img += (light * 1.5 + halo * 2.1)[..., None] * np.array(col, np.float32) * gain
    img += np.exp(-((y3 - 1.08) / .3) ** 2) * np.array([16, 8, 3], np.float32)   # embers' light at the very bottom
    img = np.clip(np.round(img), 0, 255).astype(np.uint8)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img, "RGB").save(OUT / f"{name}.webp", "WEBP", lossless=True, method=6)
    print(name, w, h, "max", img.max(axis=(0, 1)), (OUT / f"{name}.webp").stat().st_size, "bytes")


def grain(n=160, seed=7):
    g = np.random.default_rng(seed).normal(0, 1, (n, n)).astype(np.float32)
    a = np.clip(np.abs(g) * 6, 0, 18).astype(np.uint8)            # alpha: faint specks, felt more than seen
    v = np.where(g > 0, 255, 0).astype(np.uint8)                  # light and dark
    Image.fromarray(np.dstack([v, v, v, a]), "RGBA").save(OUT / f"grain-{n}.png", optimize=True)


GOLD, RED, SILVER = (255, 178, 92), (255, 84, 96), (170, 180, 255)
if __name__ == "__main__":
    # (x, y as fractions of the frame, radius as a fraction of its short side, colour, strength, droop)
    backdrop(960, 600, "night", 1793, [(.12, .16, .3, GOLD, .34, .9), (.9, .1, .22, RED, .26, .5), (.74, .3, .14, SILVER, .2, .6), (.32, .04, .12, GOLD, .16, .7)])
    # portrait: lower, so the shells open below a phone's header and countdown strip
    backdrop(540, 960, "night-p", 1794, [(.2, .24, .34, GOLD, .32, .9), (.86, .34, .26, RED, .24, .5), (.6, .16, .16, SILVER, .18, .6)])
    grain()
