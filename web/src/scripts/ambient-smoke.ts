// A shallow volume of 3D noise is integrated along each view ray. The background artwork stays still.
const VERTEX = `#version 300 es
void main() {
  vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform float time;
out vec4 smoke;

float hash(vec3 point) {
  point = fract(point * 0.3183099 + vec3(0.13, 0.27, 0.41));
  point *= 17.0;
  return fract(point.x * point.y * point.z * (point.x + point.y + point.z));
}
float noise(vec3 point) {
  vec3 cell = floor(point), f = fract(point);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(cell), hash(cell + vec3(1, 0, 0)), f.x),
        mix(hash(cell + vec3(0, 1, 0)), hash(cell + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(cell + vec3(0, 0, 1)), hash(cell + vec3(1, 0, 1)), f.x),
        mix(hash(cell + vec3(0, 1, 1)), hash(cell + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float density(vec3 point) {
  // Two rising banks frame the product. Their cross-sections also change through the volume's depth.
  float roll = sin(point.y * 2.1 + point.z * 1.2 - time * 0.43);
  float swell = sin(time * 0.37 + point.z * 0.8);
  float curl = point.y * point.y * 0.16 + point.z * 0.12 + roll * 0.19;
  vec3 left = (point - vec3(-0.87 + curl, 0.34 + swell * 0.1, -0.1)) / vec3(0.96, 1.17, 1.35);
  vec3 right = (point - vec3(0.89 - curl, 0.42 - swell * 0.09, 0.12)) / vec3(1.0, 1.22, 1.3);
  float envelope = max(1.0 - smoothstep(0.1, 1.3, dot(left, left)),
                       1.0 - smoothstep(0.1, 1.3, dot(right, right)));
  vec3 drift = vec3(time * 0.065, -time * 0.14, time * 0.04);
  vec3 field = point * vec3(2.6 * resolution.x / resolution.y, 3.7, 1.1) + drift;
  field.x += (noise(field * 0.6 + vec3(3, 1, 8)) - 0.5) * 0.95;
  field.y += sin(field.x * 1.4 + field.z * 0.9 - time * 0.33) * 0.26;
  float detail = noise(field) * 0.57;
  detail += noise(field * 2.03 + vec3(7, 3, 1)) * 0.28;
  detail += noise(field * 4.07 + vec3(2, 9, 5)) * 0.15;
  return pow(smoothstep(0.35, 0.73, detail), 1.4) * envelope;
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float sides = smoothstep(0.08, 0.34, abs(uv.x - 0.5));
  float lower = 1.0 - smoothstep(0.18, 0.49, uv.y);
  float region = max(sides * (1.0 - smoothstep(0.48, 0.78, uv.y)), lower * 0.78);
  region *= smoothstep(0.025, 0.08, uv.y); // keep the photographic floor and its reflections clear
  if (region < 0.001) { smoke = vec4(0); return; }

  vec3 origin = vec3((uv.x - 0.5) * 2.6, uv.y * 1.7, -1.2);
  vec3 ray = normalize(vec3((uv.x - 0.5) * 0.18, (uv.y - 0.3) * 0.1, 1));
  float jitter = hash(vec3(gl_FragCoord.xy, 1.7));
  vec3 scattering = vec3(0);
  float opacity = 0.0, previous = 0.0;
  for (int step = 0; step < 16; step++) {
    vec3 point = origin + ray * ((float(step) + jitter) * 0.15);
    float amount = density(point);
    // Front-facing density ridges catch the warm side light, with deeper folds shading the smoke behind them.
    float light = clamp(0.55 + (amount - previous) * 2.8 + point.y * 0.12, 0.12, 1.0);
    vec3 color = mix(vec3(0.16, 0.15, 0.18), vec3(0.57, 0.47, 0.39), light);
    float absorbed = amount * 0.27 * (1.0 - opacity);
    scattering += color * absorbed;
    opacity += absorbed;
    previous = amount;
  }
  float alpha = 0.62 * (1.0 - exp(-opacity * 3.0)) * region;
  // The browser expects premultiplied color when compositing this transparent WebGL canvas.
  smoke = vec4(scattering * alpha / max(opacity, 0.0001), alpha);
}`;

type SmokeVolume = { canvas: HTMLCanvasElement; resize(): void; render(time: number): void; destroy(): void };

function createVolume(): SmokeVolume | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'smoke-volume';
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const vertex = gl.createShader(gl.VERTEX_SHADER), fragment = gl.createShader(gl.FRAGMENT_SHADER), program = gl.createProgram();
  const destroy = () => {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
  };
  if (!vertex || !fragment || !program) { destroy(); return null; }
  gl.shaderSource(vertex, VERTEX); gl.compileShader(vertex);
  gl.shaderSource(fragment, FRAGMENT); gl.compileShader(fragment);
  if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) { destroy(); return null; }
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { destroy(); return null; }
  const resolution = gl.getUniformLocation(program, 'resolution'), clock = gl.getUniformLocation(program, 'time');
  const resize = () => {
    const width = Math.max(1, document.documentElement.clientWidth), height = Math.max(1, window.innerHeight);
    const longestSide = matchMedia('(pointer: coarse)').matches ? 320 : 384;
    const scale = Math.min(1, longestSide / Math.max(width, height), Math.sqrt(90_000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  return {
    canvas, resize, destroy,
    render(time) {
      gl.useProgram(program);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(clock, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

// A pair of inexpensive, separately moving smoke textures remains available without WebGL2.
function smokeTexture(seed: number) {
  const width = 384, height = 192, gridSize = 32;
  const canvas = document.createElement('canvas');
  canvas.className = 'smoke-fallback';
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const grid = new Float32Array(gridSize * gridSize);
  let state = seed;
  for (let i = 0; i < grid.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    grid[i] = state / 4294967296;
  }
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ix & 31, x1 = (ix + 1) & 31, y0 = iy & 31, y1 = (iy + 1) & 31;
    const a = grid[y0 * gridSize + x0], b = grid[y0 * gridSize + x1];
    const c = grid[y1 * gridSize + x0], d = grid[y1 * gridSize + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1), v = y / (height - 1);
      const warp = noise(u * 3 + 5, v * 3 + 9);
      let density = 0, amplitude = .55, frequency = 1;
      for (let octave = 0; octave < 4; octave++) {
        density += noise(u * 4 * frequency + 7, (v * 5 + warp * 1.5) * frequency + 11) * amplitude;
        amplitude *= .5; frequency *= 2;
      }
      // Taper every edge so the moving texture never reveals its rectangle.
      const envelope = Math.sin(Math.PI * u) ** 1.3 * Math.sin(Math.PI * v) ** 1.8;
      const wisp = Math.max(0, Math.min(1, (density - .34) * 2.1));
      const light = Math.max(0, Math.min(1, density));
      const offset = (y * width + x) * 4;
      image.data[offset] = 56 + light * 48;
      image.data[offset + 1] = 47 + light * 26;
      image.data[offset + 2] = 50 + light * 16;
      image.data[offset + 3] = wisp * envelope * 190;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export function initAmbientSmoke() {
  const layer = document.querySelector<HTMLElement>('[data-ambient-smoke]');
  if (!layer || layer.dataset.smokeEngine) return;
  layer.dataset.smokeEngine = 'pending';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let volume: SmokeVolume | null = null, initialized = false, queued = false, pageActive = true;
  let timer = 0, frame = 0, time = 18, last = 0;
  const stop = () => { clearTimeout(timer); cancelAnimationFrame(frame); timer = frame = 0; };
  const paused = () => !pageActive || document.hidden || document.documentElement.classList.contains('intro');
  const fallback = () => {
    stop(); volume?.destroy(); volume = null;
    layer.replaceChildren();
    for (const seed of [1793, 2917]) {
      const canvas = smokeTexture(seed);
      if (canvas) layer.append(canvas);
    }
    layer.dataset.smokeEngine = 'fallback';
  };
  const tick = () => {
    if (!volume || paused() || motion.matches) { stop(); return; }
    const now = performance.now();
    time += Math.min(0.15, (now - last) / 1000); last = now;
    volume.render(time);
    timer = window.setTimeout(() => { frame = requestAnimationFrame(tick); }, Math.max(0, 1000 / 15 - (performance.now() - now)));
  };
  const start = () => {
    if (!volume || timer || frame) return;
    last = performance.now();
    if (motion.matches) volume.render(time);
    else frame = requestAnimationFrame(tick);
  };
  const initialize = () => {
    queued = false;
    if (paused()) return;
    initialized = true;
    try { volume = createVolume(); } catch { volume = null; }
    if (!volume) { fallback(); return; }
    volume.canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); fallback(); }, { once: true });
    layer.append(volume.canvas);
    layer.dataset.smokeEngine = 'volume';
    start();
  };
  const syncVisibility = () => {
    layer.toggleAttribute('data-paused', paused());
    if (paused()) { stop(); return; }
    if (initialized) { start(); return; }
    if (queued) return;
    queued = true;
    if ('requestIdleCallback' in window) requestIdleCallback(initialize, { timeout: 1600 });
    else setTimeout(initialize, 200);
  };
  syncVisibility();
  window.addEventListener('intro:done', syncVisibility, { once: true });
  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pagehide', () => { pageActive = false; syncVisibility(); });
  window.addEventListener('pageshow', () => { pageActive = true; syncVisibility(); });
  window.addEventListener('resize', () => {
    if (!volume) return;
    volume.resize();
    if (!paused() && motion.matches) volume.render(time);
  });
  motion.addEventListener('change', () => { stop(); syncVisibility(); });
}
