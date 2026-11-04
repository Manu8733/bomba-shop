// Footer scene "Jarul" (DESIGN.md §7): embers drift down slowly, cool from white-hot to deep orange and go out.
// Plain 2D canvas on purpose: no WebGL context (the page keeps its single renderer for the big scenes), tiny payload.
// Shopify: assets/embers.js, imported by sections/footer.liquid with a dynamic import when the footer nears the viewport.

export type EmbersOptions = {
  /** Embers per 10 000 CSS px² of canvas (default 1). The count is clamped to 14–110. */
  density?: number;
};

type Tone = 0 | 1;
type Ember = {
  x: number; y: number; ux: number; // position (CSS px) and current horizontal speed (px/s)
  vx: number; vy: number;           // own drift and fall speed (px/s)
  r: number;                        // core radius (CSS px)
  age: number; ttl: number;         // seconds
  phase: number; sway: number; freq: number; flick: number;
  tone: Tone;                       // glow colour: magnesium-400 or magnesium-600
};

const TAU = Math.PI * 2;
const DPR_MAX = 1.5;
const FRAME_MS = 1000 / 60 - 1; // cap at ~60 fps on high-refresh screens; it is decoration, not a game
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Colours come from tokens.css; the fallbacks are the same values (DESIGN.md §2). */
function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

/** Pre-rendered soft dot, drawn with drawImage (much cheaper than a gradient per ember per frame). */
function sprite(hex: string, knee: number): HTMLCanvasElement {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (!g) return c;
  const n = parseInt(hex.slice(1), 16);
  const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, `rgba(${rgb}, 1)`);
  grad.addColorStop(knee, `rgba(${rgb}, .3)`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return c;
}

/** Alpha over normalised life t (0..1): quick ignition, a short burn, then a long cooling fade. */
function envelope(t: number): number {
  if (t < 0.12) return smooth(t / 0.12);
  if (t > 0.4) return smooth(Math.max(0, 1 - (t - 0.4) / 0.6));
  return 1;
}

/**
 * Starts the ember field on `canvas` (sized by CSS) and returns a cleanup function.
 * Runs only while the canvas is on screen and the tab is visible; with prefers-reduced-motion it draws one still frame.
 */
export function mountEmbers(canvas: HTMLCanvasElement, { density = 1 }: EmbersOptions = {}): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx || !('IntersectionObserver' in window) || !('ResizeObserver' in window)) return () => {};

  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tones: [string, string] = [token('--magnesium-400', '#ffb648'), token('--magnesium-600', '#e08a12')];
  const glow: [HTMLCanvasElement, HTMLCanvasElement] = [sprite(tones[0], 0.2), sprite(tones[1], 0.2)];
  const core = sprite(token('--white', '#f6f1ea'), 0.45);

  let w = 0, h = 0, dpr = 1, time = 0, last = 0, raf = 0;
  let inView = false, running = false, shown = false;
  const embers: Ember[] = [];

  // `fill`: place it anywhere, mid-life, so the first frame is already populated (and the reduced-motion still looks lived-in).
  const spawn = (fill: boolean): Ember => {
    const ttl = rand(5, 11);
    return {
      x: rand(-0.04, 1.04) * w, y: (fill ? rand(0, 1) : rand(-0.08, 0.7)) * h, ux: 0,
      vx: rand(-5, 5), vy: rand(10, 30),
      r: 0.6 + Math.random() ** 2.4 * 1.5, // mostly tiny, a few bigger chunks
      age: fill ? rand(0, ttl) : 0, ttl,
      phase: rand(0, TAU), sway: rand(6, 20), freq: rand(0.25, 0.8), flick: rand(5, 13),
      tone: Math.random() < 0.7 ? 0 : 1,
    };
  };

  const step = (dt: number) => {
    time += dt;
    const wind = Math.sin(time * 0.09) * 7; // one slow shared gust keeps the field coherent
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      e.age += dt;
      e.ux = e.vx + wind + Math.cos(time * e.freq + e.phase) * e.sway * e.freq;
      e.x += e.ux * dt;
      e.y += e.vy * dt;
      if (e.age >= e.ttl || e.y > h + 12) embers[i] = spawn(false);
    }
  };

  const draw = (live: boolean) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const e of embers) {
      const t = Math.min(1, e.age / e.ttl);
      let a = envelope(t);
      if (live) a *= 0.72 + 0.18 * Math.sin(time * e.flick + e.phase) + 0.1 * Math.sin(time * e.flick * 2.7 + e.phase * 1.7);
      if (a < 0.02) continue;
      const r = e.r * (1 - 0.4 * t);
      if (live) {
        // short streak behind the ember: the long-exposure trail
        ctx.globalAlpha = a * 0.25;
        ctx.strokeStyle = tones[e.tone];
        ctx.lineWidth = r;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x - e.ux * 0.45, e.y - e.vy * 0.45);
        ctx.stroke();
      }
      const g = r * 10;
      ctx.globalAlpha = a * 0.55;
      ctx.drawImage(glow[e.tone], e.x - g / 2, e.y - g / 2, g, g);
      const c = r * 2.8;
      ctx.globalAlpha = a * (1 - t) ** 1.3; // the white-hot core cools first
      ctx.drawImage(core, e.x - c / 2, e.y - c / 2, c, c);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (!shown) { shown = true; canvas.dataset.ready = ''; }
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const elapsed = now - last;
    if (elapsed < FRAME_MS) return;
    last = now;
    step(Math.min(0.05, elapsed / 1000)); // clamp so a long stall does not teleport the field
    draw(true);
  };

  const sync = () => {
    const go = inView && !document.hidden && !still.matches && w > 0 && h > 0;
    if (go && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!go && running) { running = false; cancelAnimationFrame(raf); }
    if (!go && still.matches && w > 0 && h > 0) draw(false);
  };

  const resize = (cw: number, ch: number) => {
    if (cw === w && ch === h) return;
    if (w > 0 && h > 0) for (const e of embers) { e.x *= cw / w; e.y *= ch / h; }
    w = cw; h = ch;
    dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const target = Math.round(Math.min(110, Math.max(14, ((w * h) / 10_000) * density)));
    if (embers.length > target) embers.length = target;
    while (embers.length < target) embers.push(spawn(true));
    if (w > 0 && h > 0 && !running) draw(false); // resizing cleared the bitmap
  };

  const ro = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1]?.contentRect;
    if (box) { resize(box.width, box.height); sync(); }
  });
  const io = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (entry) { inView = entry.isIntersecting; sync(); }
  });
  ro.observe(canvas);
  io.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  still.addEventListener('change', sync);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', sync);
    still.removeEventListener('change', sync);
  };
}
