// "Laboratorul de efecte" (DESIGN.md §7): six particle presets, one per effect type used by the collection filter
// (the effectType labels in lib/catalog.ts). It draws on a 2D canvas with additive light and a partial night wash
// each frame, which gives the long-exposure trails; this keeps the page at a single WebGL context (the hero) and
// weighs a few KB. Shopify: assets/effects-lab.js, loaded with import() by sections/home-effects-lab.liquid.

export type EffectKey = 'jerba' | 'crackling' | 'strobe' | 'titirez' | 'fum' | 'bengala';
export type LabController = { setEffect: (k: EffectKey) => void; setPaused: (paused: boolean) => void; destroy: () => void };
type Options = { effect: EffectKey; reducedMotion?: boolean };

// Palette (DESIGN.md §2). Index order matters: it is the colour id stored on each particle.
const COLORS = ['#f6f1ea', '#ffd23f', '#ffb648', '#ff3d6e', '#6cf2a0', '#5aa9ff', '#b07bff'];
const WHITE = 0, SODIUM = 1, MAGNESIUM = 2, STRONTIUM = 3, BARIUM = 4, COPPER = 5, POTASSIUM = 6;
const STICK = '#8f879c', ASH = '#322b3f', NIGHT = '7, 6, 11'; // smoke-400, night-600, night-950

// Particle kinds
const SPARK = 0, STAR = 1, FLASH = 2, STROBE = 3, SMOKE = 4, BRANCH = 5;
type P = { x: number; y: number; px: number; py: number; vx: number; vy: number; age: number; life: number;
  c: number; s: number; k: number; ph: number; fr: number; br: number };

type Preset = {
  trail: number;   // alpha of the night wash per frame: lower = longer exposure
  g: number;       // gravity, in canvas heights per s²
  drag: number;    // velocity decay per second
  lw: number;      // streak width, px
  warm: number;    // seconds simulated before the first frame, so the effect starts "lit"
  emit: (dt: number, t: number) => void;
  under?: (t: number) => void; // drawn under the sparks (normal blending)
  over?: (t: number) => void;  // glows drawn over the sparks (additive)
  death?: (p: P) => void;
};

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function sprite(size: number, stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

export function start(canvas: HTMLCanvasElement, opts: Options): LabController {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas indisponibil');
  const mobile = matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  const q = mobile ? 0.55 : 1;              // emission scale
  const MAX = mobile ? 1800 : 3600;         // particle cap
  const reduced = !!opts.reducedMotion;

  const glow = COLORS.map((c) => sprite(64, [[0, 'rgba(255, 255, 255, 1)'], [0.22, `rgba(${hexToRgb(c)}, .9)`], [1, `rgba(${hexToRgb(c)}, 0)`]]));
  const puff = COLORS.map((c) => sprite(128, [[0, `rgba(${hexToRgb(c)}, .85)`], [0.45, `rgba(${hexToRgb(c)}, .45)`], [1, `rgba(${hexToRgb(c)}, 0)`]]));

  // ---- particle pool (swap-remove, no allocation per frame) ----
  const pool: P[] = Array.from({ length: MAX }, () => ({ x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, age: 0, life: 1, c: 0, s: 1, k: 0, ph: 0, fr: 0, br: 0 }));
  let n = 0;
  function spawn(k: number, x: number, y: number, vx: number, vy: number, life: number, c: number, s: number): P | null {
    if (n >= MAX) return null;
    const p = pool[n++];
    p.k = k; p.x = p.px = x; p.y = p.py = y; p.vx = vx; p.vy = vy; p.age = 0; p.life = life; p.c = c; p.s = s;
    p.ph = Math.random(); p.fr = 0; p.br = 0;
    return p;
  }
  function kill(i: number) { const last = pool[--n]; pool[n] = pool[i]; pool[i] = last; }

  let w = 1, h = 1, dpr = 1;
  const acc: number[] = [0, 0, 0];
  /** emits `rate` particles per second, carrying fractions between frames */
  function emit(slot: number, count: number, make: () => void) {
    acc[slot] += count;
    while (acc[slot] >= 1) { acc[slot] -= 1; make(); }
  }
  function light(x: number, y: number, size: number, c: number, a: number) {
    ctx!.globalAlpha = Math.max(0, Math.min(1, a));
    ctx!.drawImage(glow[c], x - size / 2, y - size / 2, size, size);
  }

  // ---- presets ----
  let spin = 0, spinX = 0, spinY = 0, tipX = 0, tipY = 0;
  const presets: Record<EffectKey, Preset> = {
    // Jerbă / vulcan: a fountain from the ground, sparks cooling from white to gold
    jerba: {
      trail: 0.2, g: 1.7, drag: 0.5, lw: 1.5, warm: 0.9,
      emit(dt) {
        emit(0, 760 * q * dt, () => {
          const a = -Math.PI / 2 + gauss() * 0.2, v = h * (1 + Math.random() * 0.38);
          spawn(SPARK, w / 2 + (Math.random() - 0.5) * 4, h * 0.9, Math.cos(a) * v, Math.sin(a) * v, 0.9 + Math.random() * 0.8, -1, 1);
        });
      },
      over(t) { light(w / 2, h * 0.9, 120, MAGNESIUM, 0.5 + 0.08 * Math.sin(t * 23)); light(w / 2, h * 0.9, 26, WHITE, 1); },
    },
    // Crackling: golden stars rise a little, then each one pops into a few short white flashes
    crackling: {
      trail: 0.3, g: 1.1, drag: 1.2, lw: 1.3, warm: 0.9,
      emit(dt) {
        emit(0, 120 * q * dt, () => {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.3, v = h * (0.55 + Math.random() * 0.45);
          spawn(STAR, w / 2, h * 0.88, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.45, SODIUM, 1);
        });
      },
      death(p) {
        const m = 4 + ((Math.random() * 5) | 0);
        for (let i = 0; i < m; i++) {
          const f = spawn(FLASH, p.x + (Math.random() - 0.5) * 16, p.y + (Math.random() - 0.5) * 16, 0, 0, 0.05 + Math.random() * 0.08,
            Math.random() < 0.7 ? WHITE : SODIUM, 6 + Math.random() * 7);
          if (f) f.age = -Math.random() * 0.2; // staggered pops
        }
      },
      over() { light(w / 2, h * 0.88, 70, MAGNESIUM, 0.4); },
    },
    // Stroboscop: white points that blink on and off. Each point blinks below 4 Hz, out of phase with the others and
    // only a few px wide, so the canvas never flashes as a whole (WCAG 2.3.1, general flash threshold).
    strobe: {
      trail: 0.55, g: 0.04, drag: 1.5, lw: 1, warm: 2.6,
      emit(dt) {
        emit(0, 64 * q * dt, () => {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.min(w, h) * 0.42;
          const p = spawn(STROBE, w / 2 + Math.cos(a) * r * 1.3, h * 0.42 + Math.sin(a) * r * 0.85,
            Math.cos(a) * h * 0.03, Math.sin(a) * h * 0.02 + h * 0.02, 2.2 + Math.random() * 1.6, WHITE, 7 + Math.random() * 6);
          if (p) p.fr = 2.4 + Math.random() * 1.4;
        });
      },
    },
    // Titirez: a spinner on the ground throws sparks along its tangent; the drifting centre draws a spiral
    titirez: {
      trail: 0.13, g: 0.7, drag: 2.4, lw: 1.3, warm: 0.6,
      emit(dt, t) {
        const prev = spin;
        spin += 21 * dt;
        spinX = w / 2 + Math.sin(t * 0.8) * w * 0.12;
        spinY = h * 0.68 + Math.cos(t * 0.6) * h * 0.04;
        const R = Math.min(w, h) * 0.035;
        emit(0, 820 * q * dt, () => {
          const th = prev + (spin - prev) * Math.random();
          const tx = -Math.sin(th), ty = Math.cos(th) * 0.45, v = h * (0.5 + Math.random() * 0.35);
          spawn(SPARK, spinX + Math.cos(th) * R, spinY + Math.sin(th) * R * 0.45, tx * v, ty * v - h * 0.08,
            0.45 + Math.random() * 0.45, Math.random() < 0.6 ? BARIUM : WHITE, 1);
        });
      },
      over() { light(spinX, spinY, 70, BARIUM, 0.35); light(spinX, spinY, 18, WHITE, 0.95); },
    },
    // Fum colorat: three smoke pots side by side, soft puffs that rise, widen and fade (normal blending)
    fum: {
      trail: 0.5, g: -0.035, drag: 0.35, lw: 1, warm: 3.2,
      emit(dt) {
        ([[0.27, STRONTIUM], [0.5, POTASSIUM], [0.73, COPPER]] as const).forEach(([fx, c], slot) => {
          emit(slot, 24 * q * dt, () => {
            spawn(SMOKE, w * fx + (Math.random() - 0.5) * 8, h * 0.9, (Math.random() - 0.5) * h * 0.1 + h * 0.03,
              -h * (0.12 + Math.random() * 0.12), 3.5 + Math.random() * 2.5, c, h * 0.05);
          });
        });
      },
      over() { for (const fx of [0.27, 0.5, 0.73]) light(w * fx, h * 0.9, 22, SODIUM, 0.8); },
    },
    // Bengală: a sparkler burning down its stick; short sparks that fork once, like the real thing
    bengala: {
      trail: 0.42, g: 0.35, drag: 3.2, lw: 1, warm: 0.4,
      emit(dt, t) {
        const u = 0.08 + ((t % 9) / 9) * 0.62;
        tipX = w * 0.62 + (w * 0.4 - w * 0.62) * u;
        tipY = h * 0.22 + (h * 0.94 - h * 0.22) * u;
        emit(0, 620 * q * dt, () => {
          const a = Math.random() * Math.PI * 2, v = h * (0.35 + Math.random() * 0.6);
          spawn(BRANCH, tipX, tipY, Math.cos(a) * v, Math.sin(a) * v, 0.14 + Math.random() * 0.22, Math.random() < 0.7 ? WHITE : SODIUM, 1);
        });
      },
      under() {
        const c = ctx!;
        c.globalAlpha = 1;
        c.lineCap = 'round';
        c.strokeStyle = ASH; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(w * 0.62, h * 0.22); c.lineTo(tipX, tipY); c.stroke();
        c.strokeStyle = STICK; c.lineWidth = 3.5;
        c.beginPath(); c.moveTo(tipX, tipY); c.lineTo(w * 0.4, h * 0.94); c.stroke();
      },
      over(t) { light(tipX, tipY, 80, SODIUM, 0.38 + 0.06 * Math.sin(t * 31)); light(tipX, tipY, 16, WHITE, 1); },
    },
  };

  let key: EffectKey = opts.effect;
  let preset = presets[key];

  // ---- simulation ----
  function update(dt: number) {
    const fd = Math.exp(-preset.drag * dt), g = preset.g * h;
    for (let i = 0; i < n; ) {
      const p = pool[i];
      if (p.age < 0) { p.age += dt; i++; continue; }
      p.px = p.x; p.py = p.y;
      if (p.k !== FLASH) {
        p.vx *= fd;
        p.vy = p.vy * fd + g * (p.k === STROBE ? 0.05 : 1) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      p.age += dt;
      if (p.k === BRANCH && !p.br && p.age > p.life * 0.45) {
        p.br = 1;
        const sp = Math.hypot(p.vx, p.vy) * 0.75, base = Math.atan2(p.vy, p.vx), rest = (p.life - p.age) * 0.9;
        for (const side of [-1, 1]) {
          const a = base + side * (0.4 + Math.random() * 0.5);
          spawn(SPARK, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, rest, p.c, 1);
        }
      }
      if (p.age >= p.life) { preset.death?.(p); kill(i); continue; }
      i++;
    }
  }
  function step(dt: number, t: number) { preset.emit(dt, t); update(dt); }

  // ---- drawing ----
  const buckets: number[][] = Array.from({ length: COLORS.length * 4 }, () => []);
  const ramp = (f: number) => (f < 0.18 ? WHITE : f < 0.5 ? SODIUM : MAGNESIUM); // a spark cooling down

  function wash(a: number) {
    ctx!.globalCompositeOperation = 'source-over';
    ctx!.globalAlpha = 1;
    ctx!.fillStyle = `rgba(${NIGHT}, ${a})`;
    ctx!.fillRect(0, 0, w, h);
  }

  function draw(t: number) {
    const c = ctx!;
    wash(preset.trail);
    preset.under?.(t);

    // smoke first, with normal blending so colours stay colours
    for (let i = 0; i < n; i++) {
      const p = pool[i];
      if (p.k !== SMOKE) continue;
      const f = p.age / p.life, size = p.s + f * h * 0.36;
      c.globalAlpha = 0.2 * Math.min(1, f * 5) * Math.pow(1 - f, 1.3);
      c.drawImage(puff[p.c], p.x - size / 2, p.y - size / 2, size, size);
    }

    c.globalCompositeOperation = 'lighter';
    // streaks, batched by colour and 4 alpha steps: one path per bucket
    for (const b of buckets) b.length = 0;
    for (let i = 0; i < n; i++) {
      const p = pool[i];
      if (p.age < 0 || (p.k !== SPARK && p.k !== STAR && p.k !== BRANCH)) continue;
      const f = p.age / p.life, a = 1 - f;
      const col = p.c < 0 ? ramp(f) : p.c;
      buckets[col * 4 + Math.min(3, (a * 4) | 0)].push(i);
    }
    c.lineCap = 'round';
    c.lineWidth = preset.lw;
    for (let bi = 0; bi < buckets.length; bi++) {
      const b = buckets[bi];
      if (!b.length) continue;
      c.strokeStyle = COLORS[bi >> 2];
      c.globalAlpha = ((bi & 3) + 1) / 4;
      c.beginPath();
      for (const i of b) { const p = pool[i]; c.moveTo(p.px, p.py); c.lineTo(p.x + 0.01, p.y); }
      c.stroke();
    }
    // point lights: crackling stars, pops, strobes
    for (let i = 0; i < n; i++) {
      const p = pool[i];
      if (p.age < 0) continue;
      const f = p.age / p.life;
      if (p.k === STAR) light(p.x, p.y, 9, p.c, 1 - f);
      else if (p.k === FLASH) light(p.x, p.y, p.s * 2, p.c, 1 - f);
      else if (p.k === STROBE && ((p.age * p.fr + p.ph) % 1) < 0.22) light(p.x, p.y, p.s * 2, p.c, Math.min(1, f * 8, (1 - f) * 6));
    }
    preset.over?.(t);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  function reset() {
    n = 0;
    acc.fill(0);
    spin = 0;
    wash(1);
  }
  function warmUp(seconds: number) {
    const dt = 1 / 60;
    for (let s = 0; s < seconds; s += dt) { time += dt; step(dt, time); }
  }
  /** reduced motion: one still frame, like a long-exposure photo of a few seconds of the effect */
  function renderStill() {
    reset();
    warmUp(preset.warm);
    for (let i = 0; i < 24; i++) { time += 1 / 60; step(1 / 60, time); draw(time); }
  }

  // ---- size ----
  function resize() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduced) renderStill();
    else { wash(1); draw(time); }
  }

  // ---- loop ----
  let time = 0, last = 0, raf = 0, running = false, visible = false, paused = false, destroyed = false;
  const shouldRun = () => !reduced && !paused && visible && !document.hidden && !destroyed;
  function frame(now: number) {
    if (!shouldRun()) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    step(dt, time);
    draw(time);
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (running || !shouldRun()) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; wake(); }, { rootMargin: '80px' });
  const ro = new ResizeObserver(() => resize());
  const onVisibility = () => wake();
  io.observe(canvas);
  ro.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);

  resize();
  if (!reduced) { reset(); warmUp(preset.warm); }

  return {
    setEffect(k) {
      if (!presets[k]) return;
      key = k;
      preset = presets[key];
      if (reduced) { renderStill(); return; }
      reset();
      warmUp(preset.warm);
      if (!running) draw(time); // paused: still show the new effect
    },
    setPaused(v) {
      paused = v;
      if (!v) wake();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
