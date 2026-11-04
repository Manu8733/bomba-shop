// Entry intro (first page of a session), shot like a film sequence:
//   1 launch   a shell rises from the bottom with a comet tail
//   2 burst    warm flash + shock ring; sparks fly out radially, then curve into the BOMBA wordmark
//   3 ignite   the formed logo glitters, a light sweep crosses it, the "camera" pushes in a little
//   4 land     the logo streams as comets into the header logo while the page is revealed; the logo lights up
// ~3.4 s, skippable (click, key, wheel, touch), off for reduced motion and without WebGL. One instanced WebGL draw a
// frame: every spark, glow and ring segment is a soft capsule (a dot when it does not move). Removed afterwards.
// Shopify: assets/intro.js, included by layout/theme.liquid; same sessionStorage flag.
// Geometry = brand/logo (final_logo.py): letters on a 474×100 grid, the burst "O" centred at (130, 50).

const KEY = 'bomba-intro-v1';
const VIEW = { w: 522, h: 148, pad: 24 }; // the wordmark SVG's viewBox and its clear space
const T = { rise: 620, form: 1050, hold: 640, fly: 980, end: 260 };

/** Inline in <head>: decides before first paint whether the intro will play (so the header logo starts hidden). */
export const introBootScript = `try{if(!sessionStorage.getItem('${KEY}')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('intro')}catch(e){}`;

function sample(n: number) {
  // draw the wordmark at 4× into an offscreen canvas and pick n opaque pixels (letters white, burst rays coloured)
  const S = 4, c = document.createElement('canvas');
  c.width = 474 * S + 8; c.height = 100 * S + 8;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.translate(4, 4); g.scale(S, S);
  const bowls = new Path2D('M11 11H40a19 19 0 0 1 0 38H11M11 51H46a19 19 0 0 1 0 38H11');
  const B = (x: number) => { g.save(); g.translate(x, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, 22, 100); g.strokeStyle = '#fff'; g.lineWidth = 22; g.stroke(bowls); g.restore(); };
  B(0); B(296);
  g.fillStyle = '#fff';
  g.save(); g.translate(190, 0); g.fill(new Path2D('M0 100V0H24L48 40L72 0H96V100H74V40L52 76H44L22 40V100Z')); g.restore();
  g.save(); g.translate(382, 0); g.fill(new Path2D('M0 100L30 0H62L92 100H69L63 78H29L23 100ZM34 58H58L46 18Z'), 'evenodd'); g.restore();
  g.lineCap = 'round'; g.lineWidth = 9;
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12 - Math.PI / 2, r1 = i % 2 ? 35 : 47.5;
    g.strokeStyle = i % 2 ? '#f00' : '#0f0';
    g.beginPath(); g.moveTo(130 + Math.cos(a) * 16, 50 + Math.sin(a) * 16); g.lineTo(130 + Math.cos(a) * r1, 50 + Math.sin(a) * r1); g.stroke();
  }
  g.fillStyle = '#0f0'; g.beginPath(); g.arc(130, 50, 8, 0, Math.PI * 2); g.fill();
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const px: number[] = [];
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
    const k = (y * c.width + x) * 4;
    if (d[k + 3] > 140) px.push(x, y, d[k] > 200 && d[k + 1] > 200 ? 0 : d[k] > 200 ? 2 : 1); // 0 letter, 1 long ray, 2 short ray
  }
  const out: { u: number; v: number; kind: number }[] = [];
  const total = px.length / 3;
  for (let i = 0; i < n; i++) {
    const j = Math.floor(Math.random() * total) * 3;
    out.push({ u: (px[j] - 4) / S + Math.random() * .5, v: (px[j + 1] - 4) / S + Math.random() * .5, kind: px[j + 2] });
  }
  return out;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => { const c = 1.25; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeInOut = (t: number) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const hex = (c: string) => { const n = parseInt(c.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

// instance = one soft capsule from (x0,y0) to (x1,y1): width, rgb, alpha. Its head (x1,y1) is brightest, like a streak.
const VS = `attribute vec2 corner; attribute vec4 seg; attribute float width; attribute vec4 color;
uniform vec2 res; uniform vec3 cam;
varying vec2 vP; varying float vLen; varying float vHw; varying vec4 vCol;
void main() {
  vec2 d = seg.zw - seg.xy; float len = length(d);
  vec2 dir = len > .001 ? d / len : vec2(1., 0.); vec2 n = vec2(-dir.y, dir.x);
  float hw = width * .5; float along = -hw + (len + 2. * hw) * corner.x; float across = hw * corner.y;
  vec2 p = (seg.xy + dir * along + n * across) * cam.x + cam.yz;
  vP = vec2(along, across); vLen = len; vHw = hw; vCol = color;
  vec2 c = p / res * 2. - 1.; gl_Position = vec4(c.x, -c.y, 0., 1.);
}`;
const FS = `precision mediump float;
varying vec2 vP; varying float vLen; varying float vHw; varying vec4 vCol;
void main() {
  float dx = max(0., max(-vP.x, vP.x - vLen));
  float k = 1. - smoothstep(0., 1., length(vec2(dx, vP.y)) / vHw); k *= k;
  float head = vLen > .5 ? mix(.3, 1., clamp(vP.x / vLen, 0., 1.)) : 1.;
  float a = vCol.a * k * head;
  gl_FragColor = vec4(vCol.rgb * a, a);
}`;
const VS_FILL = `attribute vec2 corner; void main() { gl_Position = vec4(corner.x * 2. - 1., corner.y, 0., 1.); }`;
const FS_FILL = `precision mediump float; uniform vec4 fill; void main() { gl_FragColor = fill; }`;

function program(gl: WebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

export function runIntro() {
  const root = document.documentElement;
  if (!root.classList.contains('intro')) return;
  const finish = () => {
    try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    root.classList.remove('intro', 'intro-live');
    setTimeout(() => root.classList.remove('intro-land'), 700);
    window.dispatchEvent(new CustomEvent('intro:done'));
  };
  const logo = document.querySelector<SVGElement>('.site-header .brand svg');
  if (!logo) { finish(); return; }

  const canvas = document.createElement('canvas');
  canvas.className = 'intro-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
  const inst = gl?.getExtension('ANGLE_instanced_arrays');
  const prog = gl && program(gl, VS, FS), fillProg = gl && program(gl, VS_FILL, FS_FILL);
  if (!gl || !inst || !prog || !fillProg) { finish(); return; } // no WebGL: straight to the page
  document.body.appendChild(canvas);
  root.classList.add('intro-live'); // the canvas paints its own night cover from here on
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  // the layout viewport (without the scrollbar), the same box the fixed canvas and getBoundingClientRect use
  const W = root.clientWidth, H = root.clientHeight;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);

  // one unit quad (corner.x 0..1 along, corner.y -1..1 across) shared by every instance
  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const FL = 9; // floats per instance: x0 y0 x1 y1 width r g b a
  let data = new Float32Array(8192 * FL), used = 0;
  const ibuf = gl.createBuffer();
  const loc = { corner: gl.getAttribLocation(prog, 'corner'), seg: gl.getAttribLocation(prog, 'seg'), width: gl.getAttribLocation(prog, 'width'),
    color: gl.getAttribLocation(prog, 'color'), res: gl.getUniformLocation(prog, 'res'), cam: gl.getUniformLocation(prog, 'cam') };
  const fillLoc = { corner: gl.getAttribLocation(fillProg, 'corner'), fill: gl.getUniformLocation(fillProg, 'fill') };
  const put = (x0: number, y0: number, x1: number, y1: number, w: number, c: number[], a: number) => {
    if (used + FL > data.length) { const d = new Float32Array(data.length * 2); d.set(data); data = d; }
    data[used++] = x0; data[used++] = y0; data[used++] = x1; data[used++] = y1; data[used++] = w;
    data[used++] = c[0]; data[used++] = c[1]; data[used++] = c[2]; data[used++] = a;
  };
  const fill = (rgb: number[], a: number, mode: 'over' | 'erase') => {
    gl.useProgram(fillProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(fillLoc.corner); gl.vertexAttribPointer(fillLoc.corner, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    if (mode === 'over') { gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.uniform4f(fillLoc.fill, rgb[0] * a, rgb[1] * a, rgb[2] * a, a); }
    else { gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA); gl.uniform4f(fillLoc.fill, 0, 0, 0, a); } // fade towards transparent
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const flush = (k: number, ox: number, oy: number) => {
    if (!used) return;
    gl.useProgram(prog);
    gl.uniform2f(loc.res, W, H); gl.uniform3f(loc.cam, k, ox, oy);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(loc.corner); gl.vertexAttribPointer(loc.corner, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, used), gl.STREAM_DRAW);
    const B = FL * 4;
    for (const [l, size, off] of [[loc.seg, 4, 0], [loc.width, 1, 16], [loc.color, 4, 20]] as const) {
      gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, B, off); inst.vertexAttribDivisorANGLE(l, 1);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); // additive light
    inst.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, used / FL);
    for (const l of [loc.seg, loc.width, loc.color]) { inst.vertexAttribDivisorANGLE(l, 0); gl.disableVertexAttribArray(l); }
    used = 0;
  };

  const mobile = W < 768;
  const pts = sample(mobile ? 2400 : 4600);
  // colour index: 0 letter, 1 long ray, 2 short ray, 3 white-hot (in flight), 4 pure white (light sweep)
  const COL = ['#f6f1ea', '#ffb648', '#ff3d6e', '#fff8e6', '#ffffff'].map(hex);
  const WARM = hex('#ffecbe'), ORANGE = hex('#ff963c'), RING = hex('#ffdcaa'), HEAD = hex('#fffae6'), SPARK = hex('#ffd28c');
  const bigW = Math.min(W * .8, 900), bk = bigW / 474, bx = (W - bigW) / 2, by = H / 2 - (100 * bk) / 2;
  const cx = bx + 130 * bk, cy = by + 50 * bk;               // the burst happens where the "O" will be
  // where the header logo draws its letters (the SVG keeps its aspect ratio and centres the drawing in its box)
  const target = () => {
    const r = logo.getBoundingClientRect(), k = Math.min(r.width / VIEW.w, r.height / VIEW.h);
    return { k, x: r.left + (r.width - VIEW.w * k) / 2 + VIEW.pad * k, y: r.top + (r.height - VIEW.h * k) / 2 + VIEW.pad * k };
  };
  const { k: sk, x: sx, y: sy } = target();
  const R = Math.max(W, H) * .55;
  const P = pts.map((p) => {
    const a = Math.random() * Math.PI * 2, reach = R * (.35 + Math.pow(Math.random(), .6) * .65);
    return {
      ox: cx + Math.cos(a) * reach, oy: cy + Math.sin(a) * reach * .8,   // where the burst throws it
      bx: bx + p.u * bk, by: by + p.v * bk,                               // its place in the big wordmark
      tx: sx + p.u * sk, ty: sy + p.v * sk,                               // its place in the header logo
      c: p.kind, s: .9 + Math.random() * 1.5, d: Math.random(),
      fly: clamp01(p.u / 474 * .55 + Math.random() * .2),                // left letters leave first
      x: cx, y: cy,
    };
  });
  const tail: { x: number; y: number; vx: number; vy: number; a: number }[] = [];

  let t0 = 0, raf = 0, done = false, prev = 0, clock = 0, aimed = false;
  const tR = T.rise, tF = tR + T.form, tH = tF + T.hold, tL = tH + T.fly, total = tL + T.end;
  const end = () => {
    if (done) return;
    done = true; cancelAnimationFrame(raf);
    canvas.style.transition = 'opacity .3s'; canvas.style.opacity = '0';
    root.classList.add('intro-land');
    finish();
    setTimeout(() => { canvas.remove(); gl.getExtension('WEBGL_lose_context')?.loseContext(); }, 350);
    removeEventListener('keydown', end); removeEventListener('wheel', end); canvas.removeEventListener('pointerdown', end);
  };
  addEventListener('keydown', end, { once: true }); addEventListener('wheel', end, { once: true, passive: true }); canvas.addEventListener('pointerdown', end, { once: true });

  const NIGHT = [7 / 255, 6 / 255, 11 / 255];
  gl.clearColor(NIGHT[0], NIGHT[1], NIGHT[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
  const frame = (now: number) => {
    if (!t0) { t0 = now; prev = now; }
    const frozen = (window as unknown as { __INTRO_T?: number }).__INTRO_T; // test hook: render one exact moment
    // the clock advances at most 2 frames per frame: a busy main thread slows the film down instead of skipping it
    const step = Math.min(now - prev, 34); clock += step; prev = now;
    const t = typeof frozen === 'number' ? frozen : clock;
    const dt = step / 1000 || .016;

    // trails: on the solid night until the landing, then fade the whole layer away to reveal the page (the page
    // shows only once the logo is on its way to the corner). Fades are per 60 Hz frame, rescaled to the real frame
    // time so trails look the same at 60, 120 or 144 Hz.
    const reveal = tH + T.fly * .32, fade = (a: number) => 1 - Math.pow(1 - a, dt * 60);
    if (typeof frozen === 'number' && t < reveal) gl.clear(gl.COLOR_BUFFER_BIT);
    else if (t < reveal) fill(NIGHT, fade(.34), 'over');
    else fill(NIGHT, fade(mix(.1, .45, clamp01((t - reveal) / (tL - reveal)))), 'erase');

    // camera push while the logo burns: screen = push·(p − centre) + centre
    const push = t > tF ? 1 + .035 * easeInOut(clamp01((t - tF) / (T.hold + T.fly * .3))) : 1;
    const ox = (1 - push) * W / 2, oy = (1 - push) * H / 2;

    if (t < tR) {
      // 1 launch: the shell climbs from the bottom with a falling tail
      const k = easeOut(t / tR);
      const hx = cx + Math.sin(k * 5) * 6, hy = mix(H + 40, cy, k);
      for (let i = Math.max(1, Math.round(6 * dt * 60)); i--;) tail.push({ x: hx + (Math.random() - .5) * 4, y: hy + 6, vx: (Math.random() - .5) * 40, vy: 30 + Math.random() * 80, a: 1 });
      put(hx, hy, hx, hy, 64, HEAD, 1); put(hx, hy, hx, hy, 14, COL[4], 1);
    }
    for (let i = tail.length - 1; i >= 0; i--) {
      const s = tail[i]; s.vy += 220 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.a -= dt * 1.6;
      if (s.a <= 0) { tail[i] = tail[tail.length - 1]; tail.pop(); continue; }
      put(s.x, s.y, s.x, s.y, 7, SPARK, s.a);
    }

    if (t >= tR) {
      // 2 burst flash + shock ring
      const fk = clamp01((t - tR) / 420);
      if (fk < 1) {
        const fr = Math.max(W, H) * 1.8;
        put(cx, cy, cx, cy, fr, WARM, .5 * (1 - fk)); put(cx, cy, cx, cy, fr * .4, ORANGE, .35 * (1 - fk));
        const rr = easeOut(fk) * Math.max(W, H) * .6, rw = 3 + 8 * (1 - fk);
        for (let i = 0; i < 96; i++) {
          const a0 = (i / 96) * Math.PI * 2, a1 = ((i + 1) / 96) * Math.PI * 2;
          put(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, rw, RING, .6 * (1 - fk));
        }
      }
      const sweepX = t > tF ? mix(bx - 80, bx + bigW + 80, easeInOut(clamp01((t - tF - 120) / 520))) : -1e9;
      if (t >= tH && !aimed) { // measure the header logo again right before landing, in case the page moved under the cover
        aimed = true;
        const g = target();
        for (const p of P) { p.tx = g.x + (p.tx - sx) / sk * g.k; p.ty = g.y + (p.ty - sy) / sk * g.k; }
      }
      for (const p of P) {
        let x: number, y: number, a = 1, s = p.s, col: number = p.c;
        if (t < tF) {
          // out with the blast, then curve back into the letter (quadratic path through the throw point)
          const k = clamp01((t - tR) / (T.form * (.82 + p.d * .18)));
          const e = easeOutBack(k), q = 1 - e;
          x = q * q * cx + 2 * q * e * p.ox + e * e * p.bx; y = q * q * cy + 2 * q * e * p.oy + e * e * p.by + 60 * Math.sin(Math.PI * k) * (k < .6 ? k : .6);
          col = k < .35 ? 3 : p.c; s = p.s * (1.4 - .5 * k);
        } else if (t < tH) {
          // 3 ignite: glitter + light sweep
          x = p.bx + Math.sin(t * .02 + p.d * 40) * .5; y = p.by + Math.cos(t * .018 + p.d * 30) * .5;
          const tw = .75 + .25 * Math.sin(t * .03 + p.d * 90);
          const band = Math.max(0, 1 - Math.abs(x - sweepX) / 60);
          a = tw + band; s = p.s * (1 + band * .8); if (band > .4) col = 4;
        } else {
          // 4 land: stream into the header logo, left letters first
          const k = easeInOut(clamp01(((t - tH) / T.fly - p.fly * .35) / .65));
          const mx = mix(p.bx, p.tx, .5) + (p.by - H / 2) * .25, my = Math.min(p.by, p.ty) - 80 - p.d * 60;
          const q = 1 - k;
          x = q * q * p.bx + 2 * q * k * mx + k * k * p.tx; y = q * q * p.by + 2 * q * k * my + k * k * p.ty;
          s = p.s * mix(1.1, .5, k); a = k > .97 ? 1 - (k - .97) / .03 : 1;
        }
        // a moving spark is a streak from its previous position (long exposure), a resting one a soft dot
        const still = Math.abs(x - p.x) + Math.abs(y - p.y) < 1.2;
        put(still ? x : p.x, still ? y : p.y, x, y, s * 2.4, COL[col], Math.min(1, a));
        p.x = x; p.y = y;
      }
    }
    flush(push, ox, oy);

    if (t > tL - 240) root.classList.add('intro-land');
    if (t >= total && typeof frozen !== 'number') { end(); return; }
    raf = requestAnimationFrame(frame);
  };
  // skip the first frame after load (style, layout and image decode land there), then roll
  raf = requestAnimationFrame(() => { raf = requestAnimationFrame(frame); });
  addEventListener('resize', end, { once: true });
}
