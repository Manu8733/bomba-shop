"""Tileable carpet (needle felt, like a stage mat) for the floor products stand on.

Writes web/public/images/floor/carpet-<n>.webp (colour) and carpet-n-<n>.webp (normal map for WebGL). The texture is
built in the frequency domain, so it tiles by construction: fine fibres in many directions, a coarser tuft structure
and a faint mottling, toned to a dark anthracite.
"""
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "images" / "floor"
rng = np.random.default_rng(7)


def band(n, lo, hi, aniso=None):
    """White noise filtered to wavelengths between n/hi and n/lo pixels; aniso=(angle, ratio) stretches it into fibres."""
    f = np.fft.fft2(rng.standard_normal((n, n)))
    ky, kx = np.meshgrid(np.fft.fftfreq(n) * n, np.fft.fftfreq(n) * n, indexing="ij")
    if aniso:
        a, r = aniso
        u, v = kx * np.cos(a) + ky * np.sin(a), -kx * np.sin(a) + ky * np.cos(a)
        k = np.sqrt((u * r) ** 2 + v ** 2)
    else:
        k = np.sqrt(kx ** 2 + ky ** 2)
    mask = np.exp(-((np.log(k + 1e-6) - np.log((lo + hi) / 2)) ** 2) / (2 * .35 ** 2)) * (k > lo * .5)
    out = np.real(np.fft.ifft2(f * mask))
    return (out - out.mean()) / (out.std() + 1e-9)


def make(n):
    fibres = sum(band(n, n / 6, n / 2.6, (rng.uniform(0, np.pi), 6.0)) for _ in range(12)) / 3.5
    fluff = band(n, n / 12, n / 6)
    tufts = band(n, n / 40, n / 20)
    mottle = band(n, 2, 5)
    h = fibres * .62 + fluff * .3 + tufts * .12 + mottle * .05
    h = (h - h.min()) / (h.max() - h.min())
    # colour: an albedo (how much light the felt reflects), not a final look: mid grey with a faint warm-violet cast;
    # the scene's light, the material colour and the CSS dimming decide how dark it finally reads
    base = np.array([132, 126, 138], np.float32)
    col = base[None, None, :] * (.6 + .8 * h[:, :, None]) + mottle[:, :, None] * 1.2
    Image.fromarray(col.clip(0, 255).astype(np.uint8), "RGB").save(OUT / f"carpet-{n}.webp", quality=88)
    # normal map from the height field (wrapping gradients keep it tileable)
    s = 2.2
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * s
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * s
    nz = 1 / np.sqrt(dx ** 2 + dy ** 2 + 1)
    nm = np.stack([-dx * nz, -dy * nz, nz], -1) * .5 + .5
    Image.fromarray((nm * 255).astype(np.uint8), "RGB").save(OUT / f"carpet-n-{n}.webp", quality=90)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for n in (256, 512):
        make(n)
    print("ok", sorted(p.name for p in OUT.iterdir()))
