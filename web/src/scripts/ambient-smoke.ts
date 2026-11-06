/* The atlas holds a three-dimensional density field. Every step transports the previous
 * density through rising currents and eddies, then adds fresh smoke near the stage floor. */
const FIELD_WIDTH = 136;
const FIELD_HEIGHT = 84;
const FIELD_DEPTH = 12;
const ATLAS_COLUMNS = 4;
const ATLAS_WIDTH = FIELD_WIDTH * ATLAS_COLUMNS;
const ATLAS_HEIGHT = FIELD_HEIGHT * (FIELD_DEPTH / ATLAS_COLUMNS);

const VERTEX = `#version 300 es
void main() {
  vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
}`;

const FIELD = `
uniform sampler2D densityField;
const vec2 grid = vec2(${FIELD_WIDTH}.0, ${FIELD_HEIGHT}.0);
const vec2 atlas = vec2(${ATLAS_WIDTH}.0, ${ATLAS_HEIGHT}.0);
const float depth = ${FIELD_DEPTH}.0;
const float columns = ${ATLAS_COLUMNS}.0;

float sampleSlice(vec2 p, float layer) {
  vec2 tile = vec2(mod(layer, columns), floor(layer / columns));
  vec2 cell = clamp(p * grid, vec2(0.5), grid - 0.5);
  vec2 packedDensity = texture(densityField, (tile * grid + cell) / atlas).rg;
  return packedDensity.x + packedDensity.y / 255.0;
}

float densityAt(vec3 p) {
  if (any(lessThan(p, vec3(0))) || any(greaterThan(p, vec3(1)))) return 0.0;
  float layer = clamp(p.z * depth - 0.5, 0.0, depth - 1.0);
  float lower = floor(layer);
  return mix(sampleSlice(p.xy, lower), sampleSlice(p.xy, min(lower + 1.0, depth - 1.0)), fract(layer));
}
`;

const ADVECT = `#version 300 es
precision highp float;
${FIELD}
uniform float delta;
uniform float time;
uniform float aspect;
uniform vec4 sources[2];
uniform vec4 eddies[3];
out vec4 nextDensity;

void main() {
  vec2 tile = floor(gl_FragCoord.xy / grid);
  vec3 p = vec3(mod(gl_FragCoord.xy, grid) / grid, (tile.x + tile.y * columns + 0.5) / depth);
  float localDensity = densityAt(p);
  vec3 velocity = vec3(
    0.078 + 0.092 * sin(time * 0.71 + p.y * 4.5) + 0.048 * sin(p.z * 11.0 + time * 1.19),
    0.129 + localDensity * 0.085 + 0.026 * cos(p.x * 13.0 + p.z * 7.0 + time * 0.51),
    0.085 * sin(p.y * 8.0 - p.x * 5.0 + time * 0.57)
  );
  float verticalShear = p.y * 17.0 + p.z * 5.0 - time * 0.91;
  float horizontalShear = p.x * 12.0 + p.z * 3.0 + time * 0.57;
  velocity.xy += vec2(sin(verticalShear) * cos(horizontalShear), -cos(verticalShear) * sin(horizontalShear)) * vec2(0.065, 0.046);
  for (int i = 0; i < 3; i++) {
    vec4 eddy = eddies[i];
    vec2 offset = (p.xy - eddy.xy) * vec2(aspect, 1.0);
    float strength = eddy.z * exp(-dot(offset, offset) * eddy.w);
    velocity.xy += vec2(-offset.y / aspect, offset.x) * strength;
    velocity.z += offset.x * strength * 0.5;
  }
  float density = densityAt(p - delta * velocity);
  density *= exp(-delta * mix(0.17, 0.72, smoothstep(0.20, 0.96, p.y)));

  for (int i = 0; i < 2; i++) {
    vec4 source = sources[i];
    vec3 offset = (p - vec3(source.x, 0.052, source.y)) / vec3(source.z, 0.035, 0.15);
    float noise = 0.71 + 0.17 * sin(p.x * 49.0 + p.z * 14.0 + time * 3.4)
                       + 0.12 * cos(p.z * 29.0 - p.x * 38.0 + time * 2.1);
    density += delta * source.w * noise * exp(-dot(offset, offset) * 1.6);
  }
  float scaled = clamp(density, 0.0, 1.0) * 255.0;
  nextDensity = vec4(floor(scaled) / 255.0, fract(scaled), 0.0, 1.0);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
${FIELD}
uniform vec2 resolution;
uniform float time;
out vec4 smoke;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 cell = floor(p), t = fract(p);
  t = t * t * (3.0 - 2.0 * t);
  return mix(mix(hash(cell), hash(cell + vec2(1, 0)), t.x),
             mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), t.x), t.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  // Fade the injection area into the floor, leaving the visible curls higher in the air.
  float clip = smoothstep(0.026, 0.20, uv.y) * (1.0 - smoothstep(0.71, 0.94, uv.y));
  if (clip < 0.002) { smoke = vec4(0); return; }
  vec2 detail = uv * vec2(18.0 * clamp(resolution.x / resolution.y, 0.7, 1.9), 22.0) - vec2(time * 0.32, time * 0.81);
  detail.x += noise(detail * 0.44 + vec2(1.1, 8.4)) * 2.9;
  float folds = noise(detail) * 0.69 + noise(detail * 2.12 + 7.0) * 0.31;
  vec3 color = vec3(0);
  float opacity = 0.0;
  for (int step = 0; step < 14; step++) {
    float z = (float(step) + 0.5) / 14.0;
    vec2 point = uv + (uv - 0.5) * (z - 0.5) * 0.055;
    float density = densityAt(vec3(point, z));
    float amount = max(0.0, density * (0.68 + 0.72 * folds) - 0.044 * (1.0 - folds));
    if (amount < 0.004) continue;
    float towardLight = densityAt(vec3(point + vec2(0.022, 0.041), z - 0.048));
    float light = clamp(0.36 + (density - towardLight) * 2.65 + (folds - 0.5) * 0.36 - opacity * 0.31, 0.12, 0.96);
    vec3 tint = mix(vec3(0.16, 0.17, 0.20), vec3(0.73, 0.70, 0.65), light);
    float absorb = (1.0 - exp(-amount * 0.38)) * (1.0 - opacity);
    color += tint * absorb;
    opacity += absorb;
  }
  smoke = vec4(color, opacity) * clip * 0.86;
}`;

type SmokeRenderer = { canvas: HTMLCanvasElement; resize?(): void; advance(delta: number): void; draw(): void; destroy?(): void };

type SmokeSource = {
  start: number; duration: number; x: number; z: number; width: number; strength: number;
};

function newSource(time: number, x = 0.19 + Math.random() * 0.62): SmokeSource {
  return {
    start: time, duration: 1.9 + Math.random() * 1.8, x, z: 0.22 + Math.random() * 0.56,
    width: 0.044 + Math.random() * 0.048, strength: 3.2 + Math.random() * 2.1,
  };
}

function createFlow() {
  const sources = [newSource(-0.2, 0.37 + Math.random() * 0.22), newSource(0.4)];
  const sourceData = new Float32Array(8);
  const eddyData = new Float32Array(12);
  const phases = Array.from({ length: 3 }, () => Math.random() * Math.PI * 2);
  let time = 0;
  return {
    sourceData, eddyData,
    advance(delta: number) {
      time += delta;
      for (let i = 0; i < sources.length; i++) {
        let source = sources[i];
        if (time > source.start + source.duration) sources[i] = source = newSource(time + Math.random() * 0.65);
        const age = Math.max(0, (time - source.start) / source.duration);
        const pulse = Math.sin(Math.PI * age) ** 1.25;
        const rate = source.strength * pulse * (0.84 + 0.16 * Math.sin(time * 4.3 + i * 2));
        const offset = i * 4;
        sourceData[offset] = source.x + Math.sin(time * 1.29 + i * 3) * 0.019;
        sourceData[offset + 1] = source.z;
        sourceData[offset + 2] = source.width;
        sourceData[offset + 3] = rate;
      }
      for (let i = 0; i < phases.length; i++) {
        const phase = phases[i] + time * (0.23 + 0.073 * i);
        const offset = i * 4;
        eddyData[offset] = 0.20 + i * 0.28 + 0.11 * Math.sin(phase);
        eddyData[offset + 1] = 0.23 + i * 0.115 + 0.12 * Math.cos(phase * 0.89);
        eddyData[offset + 2] = (i % 2 ? -1 : 1) * (0.80 + 0.24 * Math.sin(phase * 1.3));
        eddyData[offset + 3] = 13 + i * 2.5;
      }
      return time;
    },
  };
}

function compileProgram(gl: WebGL2RenderingContext, source: string) {
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (vertex && fragment && program) {
    gl.shaderSource(vertex, VERTEX);
    gl.shaderSource(fragment, source);
    gl.compileShader(vertex);
    gl.compileShader(fragment);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (program && gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
}

function createVolume(layer: HTMLElement): SmokeRenderer | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'smoke-volume';
  const gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power', failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return null;

  const advect = compileProgram(gl, ADVECT);
  const composite = compileProgram(gl, COMPOSITE);
  const textures = [gl.createTexture(), gl.createTexture()];
  const buffers = [gl.createFramebuffer(), gl.createFramebuffer()];
  const destroy = () => {
    for (const texture of textures) gl.deleteTexture(texture);
    for (const buffer of buffers) gl.deleteFramebuffer(buffer);
    gl.deleteProgram(advect);
    gl.deleteProgram(composite);
  };
  if (!advect || !composite || textures.some((t) => !t) || buffers.some((f) => !f)) {
    destroy();
    return null;
  }

  gl.disable(gl.DITHER);
  for (let i = 0; i < 2; i++) {
    gl.bindTexture(gl.TEXTURE_2D, textures[i]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ATLAS_WIDTH, ATLAS_HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[i]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[i], 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      destroy();
      return null;
    }
  }

  const stepDelta = gl.getUniformLocation(advect, 'delta');
  const stepTime = gl.getUniformLocation(advect, 'time');
  const stepAspect = gl.getUniformLocation(advect, 'aspect');
  const stepSources = gl.getUniformLocation(advect, 'sources[0]');
  const stepEddies = gl.getUniformLocation(advect, 'eddies[0]');
  const resolution = gl.getUniformLocation(composite, 'resolution');
  const drawTime = gl.getUniformLocation(composite, 'time');
  const flow = createFlow();
  let active = 0, aspect = 1, time = 0;

  const resize = () => {
    const width = Math.max(1, layer.clientWidth);
    const height = Math.max(1, layer.clientHeight);
    aspect = Math.max(0.67, Math.min(2.4, width / height));
    const cap = matchMedia('(pointer: coarse)').matches ? 320 : 400;
    const scale = Math.min(1, cap / Math.max(width, height), Math.sqrt(85_000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
  };

  return {
    canvas, resize, destroy,
    advance(delta) {
      time = flow.advance(delta);
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[1 - active]);
      gl.viewport(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
      gl.useProgram(advect);
      gl.bindTexture(gl.TEXTURE_2D, textures[active]);
      gl.uniform1f(stepTime, time);
      gl.uniform1f(stepDelta, delta);
      gl.uniform1f(stepAspect, aspect);
      gl.uniform4fv(stepSources, flow.sourceData);
      gl.uniform4fv(stepEddies, flow.eddyData);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      active = 1 - active;
    },
    draw() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(composite);
      gl.bindTexture(gl.TEXTURE_2D, textures[active]);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(drawTime, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
// The CPU fallback transports a small two-dimensional density grid through the same currents.
function createFlatSmoke(): SmokeRenderer | null {
  const width = 88, height = 64;
  const canvas = document.createElement('canvas');
  canvas.className = 'smoke-fallback';
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const frame = ctx.createImageData(width, height);
  const flow = createFlow();
  let field = new Float32Array(width * height);
  let next = new Float32Array(field.length);

  const sample = (x: number, y: number) => {
    if (x < 0 || x >= width - 1 || y < 0 || y >= height - 1) return 0;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy, at = iy * width + ix;
    const bottom = field[at] * (1 - fx) + field[at + 1] * fx;
    const top = field[at + width] * (1 - fx) + field[at + width + 1] * fx;
    return bottom * (1 - fy) + top * fy;
  };

  return {
    canvas,
    advance(delta) {
      const time = flow.advance(delta);
      for (let y = 0; y < height; y++) {
        const v = y / (height - 1);
        const drift = 0.065 + 0.080 * Math.sin(time * 0.71 + v * 4.5);
        const retention = Math.exp(-delta * (0.25 + 0.65 * v * v));
        for (let x = 0; x < width; x++) {
          const u = x / (width - 1), at = y * width + x;
          let wind = drift;
          let lift = 0.10 + 0.065 * field[at];
          for (let offset = 0; offset < flow.eddyData.length; offset += 4) {
            const dx = u - flow.eddyData[offset], dy = v - flow.eddyData[offset + 1];
            const turn = flow.eddyData[offset + 2] * Math.exp(-(dx * dx + dy * dy) * flow.eddyData[offset + 3]);
            wind -= dy * turn;
            lift += dx * turn;
          }
          let density = sample(x - wind * delta * width, y - lift * delta * height) * retention;
          if (v < 0.16) {
            for (let offset = 0; offset < flow.sourceData.length; offset += 4) {
              const dx = (u - flow.sourceData[offset]) / flow.sourceData[offset + 2];
              const dy = (v - 0.052) / 0.034;
              density += delta * flow.sourceData[offset + 3] * 0.78 * Math.exp(-(dx * dx + dy * dy) * 1.6);
            }
          }
          next[at] = Math.min(1, density);
        }
      }
      [field, next] = [next, field];
    },
    draw() {
      for (let y = 0; y < height; y++) {
        const v = y / (height - 1);
        const fade = Math.max(0, Math.min(1, (v - 0.026) / 0.174, (0.94 - v) / 0.23));
        for (let x = 0; x < width; x++) {
          const density = field[y * width + x];
          const light = Math.max(0, Math.min(1, 0.37 + (density - sample(x + 1.5, y + 2.2)) * 1.8));
          const offset = ((height - 1 - y) * width + x) * 4;
          frame.data[offset] = 43 + light * 116;
          frame.data[offset + 1] = 45 + light * 105;
          frame.data[offset + 2] = 51 + light * 92;
          frame.data[offset + 3] = (1 - Math.exp(-density * 1.6)) * fade * 160;
        }
      }
      ctx.putImageData(frame, 0, 0);
    },
  };
}

export function initAmbientSmoke() {
  const layer = document.querySelector<HTMLElement>('[data-ambient-smoke]');
  if (!layer || layer.dataset.smokeEngine) return;
  layer.dataset.smokeEngine = 'pending';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer: SmokeRenderer | null = null;
  let initialized = false, queued = false, pageActive = true, visible = false;
  let timer = 0, frame = 0, last = 0;
  const stop = () => { clearTimeout(timer); cancelAnimationFrame(frame); timer = frame = 0; };
  const paused = () => !pageActive || !visible || document.hidden || document.documentElement.classList.contains('intro');
  const tick = () => {
    if (!renderer || paused() || motion.matches) { stop(); return; }
    const now = performance.now();
    renderer.advance(Math.min(0.13, (now - last) / 1000));
    renderer.draw();
    last = now;
    timer = window.setTimeout(() => { frame = requestAnimationFrame(tick); }, Math.max(0, 1000 / 15 - (performance.now() - now)));
  };
  const start = () => {
    if (!renderer || timer || frame || paused() || motion.matches) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const attach = (next: SmokeRenderer | null, engine: 'volume' | 'fallback') => {
    stop();
    renderer?.destroy?.();
    renderer = next;
    if (!next) {
      layer.replaceChildren();
      return;
    }
    next.resize?.();
    // Warm up the invisible field before showing the first frame.
    for (let step = 0; step < 24; step++) next.advance(0.12);
    next.draw();
    layer.replaceChildren(next.canvas);
    layer.dataset.smokeEngine = engine;
    start();
  };
  const initialize = () => {
    queued = false;
    if (paused()) return;
    initialized = true;
    let volume: SmokeRenderer | null = null;
    try { volume = createVolume(layer); } catch { /* Use the small CPU grid without WebGL. */ }
    if (volume) {
      volume.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        attach(createFlatSmoke(), 'fallback');
      }, { once: true });
      attach(volume, 'volume');
    } else attach(createFlatSmoke(), 'fallback');
  };
  const syncVisibility = () => {
    if (paused()) { stop(); return; }
    if (initialized) { start(); return; }
    if (queued) return;
    queued = true;
    if ('requestIdleCallback' in window) requestIdleCallback(initialize, { timeout: 1600 });
    else setTimeout(initialize, 150);
  };
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncVisibility(); });
  observer.observe(layer);
  const resize = new ResizeObserver(() => {
    if (!renderer?.resize) return;
    renderer.resize();
    if (!paused()) renderer.draw();
  });
  resize.observe(layer);
  window.addEventListener('intro:done', syncVisibility, { once: true });
  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pagehide', () => { pageActive = false; syncVisibility(); });
  window.addEventListener('pageshow', () => { pageActive = true; syncVisibility(); });
  motion.addEventListener('change', () => { stop(); syncVisibility(); });
}
