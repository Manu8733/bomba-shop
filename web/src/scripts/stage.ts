// Hero stage (Liquid: assets/hero-stage.js). The product on the stage is fired live above its nozzle, each effect
// modelled on how the real thing looks in a night photo: silver fountain, cold cake fountain, crackling bengal flare,
// smoke grenade, roman candle. 2D canvas cleared every frame. Sparks are velocity streaks (a 1/40 s exposure) batched
// into a handful of paths by colour; smoke is pre-shaded puff sprites; a blurred fifth-resolution copy added back on
// top is the lens bloom. Pauses off-screen and in hidden tabs; reduced motion gets a single still frame.

export type Effect = 'fountain' | 'ice' | 'bengal' | 'smoke' | 'candle' | 'show';
/** nozzles are fractions of the product itself; obj is the product's box inside the image (the baked floor shadow lies below it) */
export type Shot = { effect: Effect; color: string; nozzles: number[][]; obj: number[]; el: HTMLElement };

type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; ramp: number; w: number; glitter: boolean; branch: boolean; drag: number; g: number; ex?: number; gy: number };
type Puff = { x: number; y: number; vx: number; vy: number; r: number; r0: number; gr: number; age: number; life: number; rot: number; vr: number; a: number; sprite: HTMLCanvasElement; drag: number; buoy: number; wind: number };
type Glow = { x: number; y: number; r: number; age: number; life: number; sprite: HTMLCanvasElement; a: number };
type Star = { x: number; y: number; vx: number; vy: number; age: number; life: number; c: string; ramp: number; acc: number; shell?: string };

const EXP = 1 / 40; // streak length = the distance a spark travels during the "exposure"
const STAR_COLORS = ['#ff3d4e', '#58ff8f', '#4f8dff', '#ffd23f', '#b06bff', '#ffffff']; // strontium, barium, copper, sodium, potassium, magnesium
const LIGHT: Record<string, string> = { silver: '236 236 255', gold: '255 199 94' };

const rnd = Math.random;
const gauss = () => (rnd() + rnd() + rnd()) / 1.5 - 1; // -1..1, peaked at 0
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixHex = (a: string, b: string, t: number) => {
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

function glowSprite(c: string, size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d')!, r = size / 2, [R, G, B] = rgb(c);
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, `rgba(${R},${G},${B},1)`); gr.addColorStop(.18, `rgba(${R},${G},${B},.55)`);
  gr.addColorStop(.5, `rgba(${R},${G},${B},.14)`); gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return cv;
}

/** Five octaves of smooth value noise on a wrapping lattice, sampled on an S×S grid (one field per sprite variant). */
function fbm(S: number, seed: number) {
  const N = 32, lat = new Float32Array(N * N);
  let st = (seed * 7919 + 13) % 233280;
  for (let i = 0; i < lat.length; i++) lat[i] = (st = (st * 9301 + 49297) % 233280) / 233280;
  const vn = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % N) + N) % N, x1 = (x0 + 1) % N, y0 = ((yi % N) + N) % N, y1 = (y0 + 1) % N;
    const a = lat[y0 * N + x0], b = lat[y0 * N + x1], c = lat[y1 * N + x0], d = lat[y1 * N + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const f = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = .5, fr = 4 / S;
    for (let o = 0; o < 5; o++) { v += amp * vn(x * fr + o * 7.1, y * fr + o * 3.7); amp *= .5; fr *= 2; }
    f[y * S + x] = v;
  }
  return f;
}

/** A smoke puff that reads as volume: fractal density (dense core, wispy edge), lit from the upper left and shadowed by
 *  its own density towards the light, coloured from deep shadow to a pale lit rim. */
function puffSprite(base: string, seed: number) {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d')!, img = g.createImageData(S, S), n = fbm(S, seed), dens = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), fall = Math.max(0, 1 - (dx * dx + dy * dy));
    dens[y * S + x] = Math.min(1, Math.max(0, (n[y * S + x] * 1.25 + fall * .9 - 1) * 2.2));
  }
  const [R, G, B] = rgb(base), lit = [R + (255 - R) * .35, G + (255 - G) * .35, B + (255 - B) * .35], dark = [R * .6, G * .6, B * .6];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, d = dens[i];
    if (d <= 0) continue;
    const lx = Math.max(0, x - 5), ly = Math.max(0, y - 7), occ = dens[ly * S + lx]; // smoke between here and the light
    const l = Math.max(0, Math.min(1, 1 - occ * .7 + (1 - d) * .25));
    img.data[i * 4] = dark[0] + (lit[0] - dark[0]) * l; img.data[i * 4 + 1] = dark[1] + (lit[1] - dark[1]) * l;
    img.data[i * 4 + 2] = dark[2] + (lit[2] - dark[2]) * l; img.data[i * 4 + 3] = Math.pow(d, 1.1) * 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** Layout box of el in root's coordinates, ignoring transforms (slides animate with transforms). */
function rectIn(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0, n: HTMLElement | null = el;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/** floor3d: a WebGL set (three/set.ts) draws the floor and its light, so the 2D floor glow is skipped and sparks land at
 *  different depths on the mat instead of on one line; onFrame hands it the effect's light level every frame. */
export type StageOptions = { floor3d?: boolean; onFrame?: (light: number) => void };

export function startStage(canvas: HTMLCanvasElement, root: HTMLElement, opts: StageOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const bloom = document.createElement('canvas'), bctx = bloom.getContext('2d')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  let W = 0, H = 0, S = 1, mobile = false;

  // colour ramps: a spark is born at index 0 and cools towards the last colour
  const ramps: string[][] = [];
  const rampOf = (cols: string[]) => { const k = ramps.findIndex((r) => r.join() === cols.join()); return k >= 0 ? k : ramps.push(cols) - 1; };
  const SILVER = rampOf(['#ffffff', '#f8f6ff', '#ece9ff', '#ffe7c2', '#ffb878']);
  const GOLD = rampOf(['#fffaf0', '#ffe6a6', '#ffc75e', '#ff9e3d', '#d9602a']);
  const WHITE = rampOf(['#ffffff', '#fff6dc', '#ffe0a0', '#ffb46e', '#ff8a4a']);
  const buckets: number[][] = [];
  const ALPHA = [.35, .65, 1], WIDTH = [1, 1.9];

  const sprites = new Map<string, HTMLCanvasElement>();
  const glowOf = (c: string) => { let s = sprites.get('g' + c); if (!s) sprites.set('g' + c, (s = glowSprite(c))); return s; };
  const puffsOf = (base: string) => {
    const k = 'p' + base;
    if (!sprites.has(k + 0)) for (let i = 0; i < 6; i++) sprites.set(k + i, puffSprite(base, i + 1));
    return [0, 1, 2, 3, 4, 5].map((i) => sprites.get(k + i)!);
  };

  const sparks: Spark[] = [], puffs: Puff[] = [], glows: Glow[] = [], stars: Star[] = [];
  let shot: Shot | null = null, nz: { x: number; y: number }[] = [], box = { x: 0, y: 0, w: 0, h: 0 }, ground = 0;
  let live = 0, heat = 0, nextShot = 0, shotN = 0;
  const acc: number[] = [];

  const place = () => {
    if (!shot) return;
    const r = rectIn(shot.el, root), [x0, y0, x1, y1] = shot.obj;
    box = { x: r.x + r.w * x0, y: r.y + r.h * y0, w: r.w * (x1 - x0), h: r.h * (y1 - y0) };
    nz = shot.nozzles.map(([u, v]) => ({ x: box.x + box.w * u, y: box.y + box.h * v }));
    ground = box.y + box.h;
    root.style.setProperty('--ground', `${Math.round(ground)}px`);
  };
  const layout = () => {
    W = root.clientWidth; H = root.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bloom.width = Math.ceil(W / 5); bloom.height = Math.ceil(H / 5);
    S = clamp(H / 900, .6, 1.25); mobile = W < 768;
    place();
  };
  layout();
  const ro = new ResizeObserver(layout); ro.observe(root);

  // where a spark lands: on a 3D floor, somewhere between just behind the product and well in front of it (in screen
  // terms a band around the base line, since nearer floor is lower on screen); on a flat floor, the base line itself
  const spark = (x: number, y: number, vx: number, vy: number, life: number, ramp: number, o: Partial<Spark> = {}) =>
    sparks.push({ x, y, vx, vy, age: 0, life, ramp, w: .8 + rnd(), glitter: false, branch: false, drag: .5, g: 1600 * S,
      gy: opts.floor3d ? (rnd() * .24 - .06) * box.h : 3, ...o });
  const glow = (x: number, y: number, r: number, life: number, c: string, a = 1) => glows.push({ x, y, r, age: 0, life, sprite: glowOf(c), a });
  const puff = (x: number, y: number, vx: number, vy: number, o: Partial<Puff> & { base: string }) => {
    const set = puffsOf(o.base);
    const p: Puff = { x, y, vx, vy, r: 16 * S, r0: 0, gr: 60 * S, age: 0, life: 5, rot: rnd() * 6.28, vr: (rnd() - .5) * .6, a: .12, drag: .8, buoy: -30 * S,
      wind: 30 * S, sprite: set[(rnd() * set.length) | 0], ...o };
    p.r0 = p.r; puffs.push(p);
  };
  /** frame-rate independent emission: how many to spawn this frame for a rate per second */
  const count = (slot: number, rate: number, dt: number) => { acc[slot] = (acc[slot] ?? 0) + rate * dt; const n = acc[slot] | 0; acc[slot] -= n; return n; };

  const emit = (dt: number) => {
    if (!shot || !nz.length) return;
    const n0 = nz[0];
    if (live < 0) { // the fuse spits before the effect catches
      for (let i = count(9, 70, dt); i--;) spark(n0.x, n0.y, (rnd() - .5) * 220 * S, -(60 + rnd() * 160) * S, .18 + rnd() * .25, WHITE, { w: .8 });
      return;
    }
    const ramp = Math.min(1, live / .35); // the jet builds up over a third of a second
    const e = shot.effect;
    if (e === 'fountain') {
      const hT = Math.max(160, n0.y - Math.max(H * .06, 84)), g = 2400 * S, v0 = Math.sqrt(2 * g * hT) * 1.12; // never up into the header
      for (let i = count(0, (mobile ? 620 : 1150) * ramp, dt); i--;) {
        const a = -Math.PI / 2 + gauss() * .14 + (rnd() < .12 ? (rnd() - .5) * .8 : 0), v = v0 * (.42 + .58 * Math.sqrt(rnd()));
        spark(n0.x + (rnd() - .5) * 5, n0.y, Math.cos(a) * v, Math.sin(a) * v, .85 + rnd() * .95, rnd() < .8 ? SILVER : GOLD,
          { g, drag: .55, w: .7 + rnd() * 1.3, glitter: rnd() < .2, branch: rnd() < .05 });
      }
      for (let i = count(1, 10, dt); i--;) puff(n0.x + (rnd() - .5) * 14, n0.y - 20 * S, (10 + rnd() * 25) * S, -(70 + rnd() * 70) * S,
        { base: '#f3e2c4', r: 14 * S, gr: 52 * S, life: 4.5 + rnd() * 2, a: .28, drag: .7, buoy: -55 * S, wind: 22 * S }); // warm-lit fountain smoke
    } else if (e === 'ice') {
      const hT = box.h * .95, g = 1700 * S, v0 = Math.sqrt(2 * g * hT) * 1.06;
      for (const p of nz) for (let i = count(nz.indexOf(p) + 2, (mobile ? 150 : 260) * ramp, dt); i--;) {
        const a = -Math.PI / 2 + gauss() * .06, v = v0 * (.6 + .4 * rnd());
        spark(p.x + (rnd() - .5) * 2, p.y, Math.cos(a) * v, Math.sin(a) * v, .3 + rnd() * .5, GOLD, { g, drag: .3, w: .6 + rnd() * .8, glitter: rnd() < .55 });
      }
      for (let i = count(1, 2, dt); i--;) puff(n0.x, n0.y - 6, 20 * S, -50 * S, { base: '#bfb6aa', r: 10 * S, gr: 34 * S, life: 3.5, a: .05 });
    } else if (e === 'bengal') {
      const c = shot.color;
      for (let i = count(0, (mobile ? 22 : 36) * ramp, dt); i--;) { // crackling: hot pops scattered around the flame
        const x = n0.x + gauss() * 90 * S, y = n0.y - 30 * S - rnd() * 190 * S;
        glow(x, y, (14 + rnd() * 22) * S, .05 + rnd() * .07, '#ffffff', 1);
        for (let k = 0; k < 7; k++) { const a = rnd() * 6.28, v = (200 + rnd() * 260) * S;
          spark(x, y, Math.cos(a) * v, Math.sin(a) * v, .08 + rnd() * .14, WHITE, { g: 300 * S, drag: 2, w: .8 }); }
      }
      for (let i = count(1, 30 * ramp, dt); i--;) spark(n0.x + (rnd() - .5) * 10 * S, n0.y - 8 * S, (rnd() - .5) * 140 * S, (rnd() - .7) * 90 * S, .4 + rnd() * .5, WHITE,
        { g: 900 * S, drag: .4, w: 1 }); // dripping slag
      for (let i = count(2, 15 * ramp, dt); i--;) puff(n0.x + (rnd() - .5) * 16, n0.y - 30 * S, (15 + rnd() * 35) * S, -(70 + rnd() * 80) * S,
        { base: mixHex(c, '#6f7471', .7), r: 24 * S, gr: 66 * S, life: 4 + rnd() * 1.5, a: .11, drag: .7, buoy: -46 * S });
    } else if (e === 'smoke') {
      // a dense jet that slows within a metre, then billows, rises and leans with the wind, thinning as it spreads
      for (let i = count(0, (mobile ? 30 : 46) * ramp, dt); i--;) {
        const a = -Math.PI / 2 + (rnd() - .5) * .45 + .08, v = (280 + rnd() * 170) * S;
        puff(n0.x + (rnd() - .5) * 6, n0.y + 2, Math.cos(a) * v, Math.sin(a) * v,
          { base: shot.color, r: 5 * S, gr: (52 + rnd() * 30) * S, life: 5 + rnd() * 2.5, a: .5 + rnd() * .25, drag: 2.6, buoy: -40 * S, wind: 48 * S });
      }
    } else if (e === 'candle') {
      // between stars the delay composition burns in the tube: a short gold spray from the tube that fires next
      const q = nz[shotN % nz.length];
      for (let i = count(1, (mobile ? 90 : 160) * ramp, dt); i--;) {
        const a = -Math.PI / 2 + gauss() * .12, v = (260 + rnd() * 260) * S;
        spark(q.x + (rnd() - .5) * 3, q.y, Math.cos(a) * v, Math.sin(a) * v, .25 + rnd() * .35, GOLD, { g: 1200 * S, w: .7 + rnd() * .6, glitter: rnd() < .4 });
      }
      nextShot -= dt;
      if (nextShot <= 0) {
        const p = nz[shotN % nz.length], c = STAR_COLORS[shotN % STAR_COLORS.length]; shotN++;
        const g = 1500 * S, h = Math.max(200, p.y - Math.max(H * (.03 + rnd() * .1), 90)), v = Math.sqrt(2 * g * h);
        stars.push({ x: p.x, y: p.y, vx: (rnd() - .5) * 90 * S, vy: -v, age: 0, life: (v / g) * (.9 + rnd() * .12), c,
          ramp: rampOf(['#ffffff', c, c, mixHex(c, '#000000', .3), mixHex(c, '#000000', .55)]), acc: 0 });
        glow(p.x, p.y, 70 * S, .16, '#ffe6b0', .9);
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (rnd() - .5) * .7, s = (200 + rnd() * 380) * S;
          spark(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, .15 + rnd() * .25, GOLD, { w: .9 }); }
        for (let k = 0; k < 2; k++) puff(p.x, p.y - 6, (10 + rnd() * 30) * S, -(60 + rnd() * 70) * S, { base: '#8f8985', r: 10 * S, gr: 34 * S, life: 3 + rnd(), a: .06 });
        heat = 1.2;
        nextShot = .42 + rnd() * .34;
      }
    } else if (e === 'show') {
      // an aerial show: shells climb on a comet tail from the tubes and break high in the sky
      nextShot -= dt;
      if (nextShot <= 0) {
        const p = nz[(rnd() * nz.length) | 0]; shotN++;
        const g = 1500 * S, h = Math.max(160, p.y - H * (.06 + rnd() * .3)), v = Math.sqrt(2 * g * h);
        stars.push({ x: p.x, y: p.y, vx: (rnd() - .5) * 70 * S, vy: -v, age: 0, life: (v / g) * .96, c: '#ffd9a0', ramp: GOLD, acc: 0,
          shell: STAR_COLORS[(rnd() * 5) | 0] });
        glow(p.x, p.y, 60 * S, .14, '#ffe6b0', .8);
        nextShot = (shotN % 7 === 0 ? 1.8 : .5) + rnd() * .8; // now and then a pause, like a real show
      }
    }
  };

  /** A shell breaks: a peony (a sphere of stars seen flat, so denser at the rim), a ring, or a gold willow that hangs. */
  const burst = (x: number, y: number, c: string) => {
    const n = mobile ? 70 : 120, kind = rnd(), cr = rampOf(['#ffffff', c, c, mixHex(c, '#000000', .25), mixHex(c, '#000000', .5)]);
    glow(x, y, 240 * S, .5, c, .5); glow(x, y, 70 * S, .12, '#ffffff', 1); heat = 1.4;
    for (let i = 0; i < n; i++) {
      const a = kind < .45 && kind >= .3 ? (Math.PI * 2 * i) / n : rnd() * Math.PI * 2;
      if (kind < .3) { const v = (110 + rnd() * 90) * S;
        spark(x, y, Math.cos(a) * v, Math.sin(a) * v, 2.2 + rnd() * .9, GOLD, { g: 150 * S, drag: 1.25, w: 1.1, ex: 1 / 7, glitter: rnd() < .35 });
      } else if (kind < .45) { const v = 235 * S * (.95 + rnd() * .1);
        spark(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.1 + rnd() * .3, cr, { g: 220 * S, drag: 1, w: 1.3, ex: 1 / 18 });
      } else { const u = rnd() * 2 - 1, v = 270 * S * Math.sqrt(1 - u * u) * (.9 + rnd() * .1);
        spark(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.2 + rnd() * .5, cr, { g: 230 * S, drag: 1.1, w: 1.2, ex: 1 / 16, glitter: rnd() < .25, branch: rnd() < .1 });
      }
    }
    puff(x, y, 0, 0, { base: '#6d6870', r: 40 * S, gr: 50 * S, life: 4, a: .07, drag: .5, buoy: -6 * S, wind: 14 * S });
  };

  const lightOf = () => shot ? (LIGHT[shot.color] ?? rgb(shot.color).join(' ')) : LIGHT.silver;

  let last = performance.now(), running = true, raf = 0, t = 0, frameN = 0;
  const step = (now: number) => {
    const dt = Math.min(.034, (now - last) / 1000) || .016; last = now; t += dt; live += dt;
    emit(dt);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    const e = shot?.effect;

    // 1 smoke (normal blending, oldest and largest first)
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      p.age += dt;
      if (p.age > p.life) { puffs.splice(i--, 1); continue; }
      const k = Math.min(1, p.drag * dt);
      const tx = Math.sin(p.y * .012 + t * .7) + Math.sin(p.y * .031 - t * 1.3) * .5, ty = Math.cos(p.x * .011 - t * .6) * .6;
      p.vx += ((p.wind + tx * 30 * S) - p.vx) * k; p.vy += ((p.buoy + ty * 18 * S) - p.vy) * k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      p.r = p.r0 + p.gr * Math.sqrt(p.age); // fast at first, then slower: how a plume spreads
      const thin = Math.min(1, Math.max(.18, (p.r0 + 34 * S) / (p.r + 34 * S) * 1.7)); // same smoke, bigger volume
      const a = p.a * Math.min(1, p.age / .15) * Math.pow(1 - p.age / p.life, 1.5) * thin;
      if (a < .004) continue;
      const c = Math.cos(p.rot) * dpr, s = Math.sin(p.rot) * dpr;
      ctx.setTransform(c, s, -s, c, p.x * dpr, p.y * dpr);
      ctx.globalAlpha = a; ctx.drawImage(p.sprite, -p.r, -p.r, p.r * 2, p.r * 2);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;

    // 2 light (additive)
    ctx.globalCompositeOperation = 'lighter';
    const flick = .86 + Math.sin(t * 23) * Math.sin(t * 7.1) * .1 + rnd() * .06;
    const target = !shot || live < 0 ? .15 : e === 'smoke' ? .22 : e === 'ice' ? .55 : e === 'candle' || e === 'show' ? heat * .92 : flick;
    heat += (target - heat) * Math.min(1, dt * (e === 'candle' || e === 'show' ? 3 : 12));
    // the product is lit by its own effect (Hero.astro .shot::after): a few updates a second are enough for the eye
    opts.onFrame?.(!shot || live < 0 ? .08 : e === 'smoke' ? .05 : e === 'ice' ? heat * .5 : heat);
    if (shot && (++frameN & 3) === 0) (shot.el.closest('.shot') as HTMLElement | null)?.style.setProperty('--lit',
      (live < 0 ? .12 : e === 'smoke' ? .34 : e === 'ice' ? .5 : Math.min(1.1, heat)).toFixed(2));
    if (shot && nz.length) {
      const n0 = nz[0], lc = shot.effect === 'bengal' || shot.effect === 'smoke' ? shot.color : shot.color === 'gold' ? '#ffc75e' : '#e8e6ff';
      const L = glowOf(lc);
      // the effect lights the ground it stands on and the night around it
      if (e !== 'show' && !opts.floor3d) { ctx.globalAlpha = .5 * heat; ctx.drawImage(L, n0.x - 330 * S, ground - 46 * S, 660 * S, 92 * S); }
      if (e !== 'smoke' && e !== 'show') { const r = (e === 'ice' ? 260 : 520) * S; ctx.globalAlpha = (opts.floor3d ? .06 : .2) * heat; ctx.drawImage(L, n0.x - r, n0.y - r * .8, r * 2, r * 2); }
      if (live >= 0 && e === 'fountain') {
        ctx.globalAlpha = 1; const r = (34 + rnd() * 10) * S; ctx.drawImage(glowOf('#ffffff'), n0.x - r, n0.y - r, r * 2, r * 2);
        ctx.globalAlpha = .55; ctx.drawImage(L, n0.x - 110 * S, n0.y - 130 * S, 220 * S, 220 * S);
      }
      if (live >= 0 && e === 'ice') for (const p of nz) { ctx.globalAlpha = .9; const r = (12 + rnd() * 4) * S; ctx.drawImage(glowOf('#fff4d6'), p.x - r, p.y - r, r * 2, r * 2); }
      if (live >= 0 && e === 'bengal') {
        // a blinding coloured ball of flame: wide halo, a licking tongue, a white-hot heart
        const C = glowOf(shot.color), f = flick, fy = n0.y - 26 * S * f, sway = Math.sin(t * 5.3) * 4 * S;
        ctx.globalAlpha = .55; ctx.drawImage(C, n0.x - 260 * S * f, fy - 260 * S * f, 520 * S * f, 520 * S * f);
        ctx.globalAlpha = 1; ctx.drawImage(C, n0.x - 40 * S + sway, fy - 150 * S * f, 80 * S, 190 * S * f);
        ctx.drawImage(C, n0.x - 90 * S * f, fy - 90 * S * f, 180 * S * f, 180 * S * f);
        const W2 = glowOf('#ffffff'); ctx.drawImage(W2, n0.x - 34 * S, fy - 50 * S, 68 * S, 84 * S); ctx.drawImage(W2, n0.x - 20 * S + sway * .5, fy - 80 * S * f, 40 * S, 90 * S * f);
      }
      if (live < 0) { ctx.globalAlpha = .8; const r = (8 + rnd() * 8) * S; ctx.drawImage(glowOf('#fff2c8'), n0.x - r, n0.y - r, r * 2, r * 2); }
    }
    for (let i = glows.length - 1; i >= 0; i--) {
      const g = glows[i]; g.age += dt;
      if (g.age > g.life) { glows.splice(i, 1); continue; }
      ctx.globalAlpha = g.a * (1 - g.age / g.life); ctx.drawImage(g.sprite, g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
    }
    for (let i = stars.length - 1; i >= 0; i--) { // roman candle stars: a burning ball with a falling tail
      const s = stars[i]; s.age += dt;
      s.vy += 1500 * S * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.age > s.life) {
        if (s.shell) burst(s.x, s.y, s.shell);
        else for (let k = 0; k < 8; k++) { const a = rnd() * 6.28, v = (40 + rnd() * 90) * S; spark(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, .25 + rnd() * .3, s.ramp, { g: 400 * S, glitter: true }); }
        stars.splice(i, 1); continue;
      }
      s.acc += 140 * dt;
      for (let k = s.acc | 0; k--;) spark(s.x, s.y, (rnd() - .5) * 60 * S, (20 + rnd() * 60) * S, .35 + rnd() * .55, GOLD, { g: 500 * S, w: .7, glitter: rnd() < .5, drag: 1.2 });
      s.acc -= s.acc | 0;
      const fade = s.shell ? 1 : s.age > s.life * .85 ? (s.life - s.age) / (s.life * .15) : 1, r = (s.shell ? 22 : 44) * S;
      ctx.globalAlpha = .75 * fade; ctx.drawImage(glowOf(s.c), s.x - r, s.y - r, r * 2, r * 2);
      ctx.globalAlpha = fade; ctx.drawImage(glowOf(s.c), s.x - 16 * S, s.y - 16 * S, 32 * S, 32 * S); ctx.drawImage(glowOf('#ffffff'), s.x - 8 * S, s.y - 8 * S, 16 * S, 16 * S);
    }

    // 3 sparks, batched: one path per colour × width × alpha (order is irrelevant in additive light: swap-remove)
    const kill = (i: number) => { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); };
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.age += dt;
      if (s.age > s.life) { kill(i); continue; }
      if (s.branch && s.age > s.life * .5) { // charcoal sparks split in two or three at the end of their flight
        for (let k = 2 + ((rnd() * 2) | 0); k--;) { const a = rnd() * 6.28, v = (70 + rnd() * 110) * S;
          spark(s.x, s.y, s.vx * .3 + Math.cos(a) * v, s.vy * .3 + Math.sin(a) * v, .18 + rnd() * .2, WHITE, { g: s.g * .5, w: .7 }); }
        kill(i); continue;
      }
      const k = 1 - s.drag * dt;
      s.vx *= k; s.vy = s.vy * k + s.g * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > ground + s.gy && s.vy > 0) { // hitting the ground: most die, some skip once
        if (rnd() < .5) { kill(i); continue; }
        s.y = ground + s.gy; s.vy *= -.22; s.vx *= .5; s.age = Math.max(s.age, s.life * .8);
      }
      const f = s.age / s.life;
      let a = f < .7 ? 1 : 1 - (f - .7) / .3;
      if (s.glitter && f > .45) a = rnd() < .45 ? 1 : .15;
      const ci = s.ramp * 5 + Math.min(4, (f * 5) | 0), wi = s.w < 1.3 ? 0 : 1, ai = a < .5 ? 0 : a < .85 ? 1 : 2;
      const b = (ci * 2 + wi) * 3 + ai;
      const ex = s.ex ?? EXP;
      (buckets[b] ??= []).push(s.x - s.vx * ex, s.y - s.vy * ex, s.x + .3, s.y);
    }
    ctx.lineCap = 'round';
    const strokeAll = (mirror: boolean) => {
      for (let b = 0; b < buckets.length; b++) {
        const seg = buckets[b];
        if (!seg?.length) continue;
        const ai = b % 3, wi = ((b / 3) | 0) % 2, ci = (b / 6) | 0;
        ctx.globalAlpha = ALPHA[ai] * (mirror ? .22 : 1); ctx.strokeStyle = ramps[(ci / 5) | 0][ci % 5]; ctx.lineWidth = WIDTH[wi];
        ctx.beginPath();
        if (mirror) for (let i = 0; i < seg.length; i += 4) { ctx.moveTo(seg[i], 2 * ground - seg[i + 1]); ctx.lineTo(seg[i + 2], 2 * ground - seg[i + 3]); }
        else for (let i = 0; i < seg.length; i += 4) { ctx.moveTo(seg[i], seg[i + 1]); ctx.lineTo(seg[i + 2], seg[i + 3]); }
        ctx.stroke();
      }
    };
    strokeAll(false);
    // on the 3D set's glossy floor the sparks and the hot core show again, mirrored and dimmed, below the base line
    if (opts.floor3d && shot && nz.length) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, ground, W, H - ground); ctx.clip();
      strokeAll(true);
      if (live >= 0 && e !== 'smoke') { const n0 = nz[0], r = (e === 'bengal' ? 70 : 40) * S; ctx.globalAlpha = .3 * heat;
        ctx.drawImage(glowOf(e === 'bengal' ? shot.color : '#fff4dc'), n0.x - r, 2 * ground - n0.y - r, r * 2, r * 2); }
      ctx.restore();
    }
    for (const seg of buckets) if (seg) seg.length = 0;

    // 4 bloom: a blurred low-resolution copy of the light, added back on top
    const bl = e === 'smoke' ? 0 : e === 'candle' || e === 'show' ? .7 : e === 'bengal' ? .75 : .6;
    if (bl) {
      bctx.clearRect(0, 0, bloom.width, bloom.height);
      bctx.filter = 'blur(2px)';
      bctx.drawImage(canvas, 0, 0, bloom.width, bloom.height);
      ctx.globalAlpha = bl; ctx.drawImage(bloom, 0, 0, W, H);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    if (running) raf = requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(([en]) => setRunning(en.isIntersecting && !document.hidden));
  const setRunning = (on: boolean) => {
    const was = running; running = on && !reduce;
    if (running && !was) { last = performance.now(); raf = requestAnimationFrame(step); }
    if (!running) cancelAnimationFrame(raf);
  };
  const onVis = () => setRunning(!document.hidden && root.getBoundingClientRect().bottom > 0);
  document.addEventListener('visibilitychange', onVis);

  const still = () => { // reduced motion: let the effect run 1.6 s invisibly, then show that one frame
    let now = performance.now(); last = now;
    for (let i = 0; i < 100; i++) { now += 16; step(now); }
  };

  if (reduce) running = false;
  else { io.observe(root); raf = requestAnimationFrame(step); }

  return {
    fire(next: Shot) {
      shot = next; place();
      for (const p of puffs) p.life = Math.min(p.life, p.age + 1.4); // the last effect's smoke clears off quickly
      live = reduce ? 1 : -.45; nextShot = 0; heat = Math.min(heat, .4);
      root.style.setProperty('--fx', lightOf());
      if (reduce) { sparks.length = puffs.length = glows.length = stars.length = 0; still(); }
    },
    relayout: place,
    destroy() { running = false; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); },
  };
}
