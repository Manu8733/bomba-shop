// Hero set (Liquid: assets/hero-set.js): the product as a real 3D model in a dark studio. The model is built from the
// product's own photo: round products (a fountain cone, a smoke canister) are lathed from their silhouette row by row,
// bundles (roman candles, bengal sticks, cake fountains) are a row of tubes; the photo is projected onto the front, so
// the model looks exactly like the product from the front (it does not turn: no photo shows its sides or back).
// It stands on a black glossy floor that mirrors it, under the effect's own light (a point light at the nozzle) and
// two rim lights; the floor runs off into a seamless dark backdrop. The camera is solved from the invisible DOM image of the slide, so the
// model lands where the layout puts it, verticals kept vertical (shifted lens, no tilt). Rendered on the stage's frame.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** 'lathe' = a round product; a number = that many tubes side by side */
export type Model = 'lathe' | number;
/** glb: a model made in Blender (tools/blender/make_models.py); without one the model is built here from the photo */
export type SetShot = { img: HTMLImageElement; obj: number[]; nozzle: number[]; color: string; model: Model; glb?: string };
type Prod = { group: THREE.Group; fade: number; dir: 1 | -1; aspect: number; mats: THREE.Material[] };

const EYE = .9;                // camera height above the floor, in product heights
const LIGHTS: Record<string, string> = { silver: '#e8e6ff', gold: '#ffc06a' };

function rectIn(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0, n: HTMLElement | null = el;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

/** The product's outline, row by row, inside its body box (the baked 2D shadow below the base is left out). */
function outline(img: HTMLImageElement, obj: number[], rows = 96) {
  const s = Math.min(1, 700 / img.naturalHeight), W = Math.round(img.naturalWidth * s), H = Math.round(img.naturalHeight * s);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, W, H);
  const a = g.getImageData(0, 0, W, H).data;
  const X0 = Math.round(obj[0] * W), X1 = Math.round(obj[2] * W), Y0 = Math.round(obj[1] * H), Y1 = Math.round(obj[3] * H);
  const span: [number, number][] = [];
  for (let k = 0; k <= rows; k++) {
    const y = Math.min(Y1 - 1, Math.round(Y0 + ((Y1 - Y0) * k) / rows));
    let l = -1, r = -1;
    for (let x = X0; x < X1; x++) if (a[(y * W + x) * 4 + 3] > 140) { if (l < 0) l = x; r = x; }
    span.push([l, r]);
  }
  const top = (x0: number, x1: number) => { // first opaque row across the middle of a column band
    for (let y = Y0; y < Y1; y++) { let n = 0; for (let x = x0; x < x1; x++) if (a[(y * W + x) * 4 + 3] > 140) n++; if (n > (x1 - x0) * .5) return y; }
    return Y0;
  };
  return { W, H, X0, X1, Y0, Y1, span, top, rows };
}

export function startSet(canvas: HTMLCanvasElement, root: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050407');
  scene.fog = new THREE.Fog('#050407', 4, 13);
  const camera = new THREE.PerspectiveCamera(40, 1, .05, 60);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // ---- studio: a black glossy floor that mirrors the product, darkening into a seamless backdrop
  const mirror = new Reflector(new THREE.PlaneGeometry(30, 30), { color: 0x4a4a52, textureWidth: 512, textureHeight: 512, clipBias: .002 });
  mirror.rotation.x = -Math.PI / 2; scene.add(mirror);
  const fadeTex = canvasTexture(256, 256, (g) => { // clear near the product, opaque black far away: the reflection fades out
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, '#000'); gr.addColorStop(.12, '#1e1e1e'); gr.addColorStop(.45, '#bdbdbd'); gr.addColorStop(1, '#fff');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }, false);
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: '#050407', alphaMap: fadeTex, transparent: true, depthWrite: false }));
  finish.rotation.x = -Math.PI / 2; finish.position.y = .0008; finish.renderOrder = 1; scene.add(finish);
  const aoTex = canvasTexture(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(.4, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  });
  // a soft pool of light on the backdrop behind the product gives the studio its depth
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ fog: false, transparent: true, depthWrite: false,
    map: canvasTexture(512, 256, (g) => {
      const gr = g.createRadialGradient(256, 110, 0, 256, 110, 240);
      gr.addColorStop(0, 'rgba(26,23,34,1)'); gr.addColorStop(.55, 'rgba(14,12,19,.55)'); gr.addColorStop(1, 'rgba(5,4,7,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    }) }));
  halo.position.set(0, 3.2, -7); scene.add(halo);

  // ---- light: the effect's point light, a cool rim from behind-left, a warm one from behind-right, a soft key from the
  // front so every product stays readable, and almost no ambient. (A point light's shadow would cost six renders a frame
  // and falls under the product anyway; the contact shadow does that job.)
  const fx = new THREE.PointLight('#ffffff', 0, 0, 2); scene.add(fx);
  const rimL = new THREE.DirectionalLight('#8ea3ff', 1.1); rimL.position.set(-2.5, 1.6, -2.2); scene.add(rimL);
  const rimR = new THREE.DirectionalLight('#ffcf9a', .7); rimR.position.set(2.6, 1.3, -1.8); scene.add(rimR);
  const key = new THREE.DirectionalLight('#d8dcf2', .55); key.position.set(-1.2, 1.8, 3); scene.add(key);
  scene.add(new THREE.HemisphereLight('#22283a', '#030305', .25));

  let W = 0, H = 0, cur: Prod | null = null, shot: SetShot | null = null;
  const leaving: Prod[] = [];
  const fxColor = new THREE.Color('#ffffff');
  const loader = new THREE.TextureLoader();
  const gltf = new GLTFLoader();

  /** a Blender model: 1 unit tall, base at 0, facing the camera; it fades in once loaded */
  const fromGlb = (s: SetShot): Prod => {
    const group = new THREE.Group(), prod: Prod = { group, fade: 0, dir: 1, aspect: .5, mats: [] };
    scene.add(group);
    gltf.load(s.glb!, (g) => {
      g.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of ([] as THREE.Material[]).concat(mesh.material)) {
          m.transparent = true; m.opacity = 0; prod.mats.push(m);
          const map = (m as THREE.MeshStandardMaterial).map; if (map) map.anisotropy = aniso;
        }
      });
      const size = new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3());
      prod.aspect = size.x;
      const ao = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.5, Math.max(.25, size.z * 1.6)), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, opacity: 0 }));
      ao.rotation.x = -Math.PI / 2; ao.position.y = .002; ao.renderOrder = 3;
      group.add(g.scene, ao); prod.mats.push(ao.material as THREE.Material);
      if (prod === cur) layout();
    }, undefined, () => { // no model file: fall back to the one built from the photo
      const p = build({ ...s, glb: undefined }); scene.remove(group);
      Object.assign(prod, p, { fade: prod.fade, dir: prod.dir });
    });
    return prod;
  };

  const build = (s: SetShot): Prod => {
    if (s.glb) return fromGlb(s);
    const o = outline(s.img, s.obj);
    const Hb = o.Y1 - o.Y0, cx = (o.X0 + o.X1) / 2;
    const tex = loader.load(s.img.currentSrc || s.img.src, () => render());
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
    // projected mapping: a point at world (x, y) shows the photo pixel in front of it, so the front reads like the photo
    const project = (geo: THREE.BufferGeometry, dx = 0) => {
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const u = (cx + (p.getX(i) + dx) * Hb) / o.W, v = 1 - (o.Y0 + (1 - p.getY(i)) * Hb) / o.H;
        uv.setXY(i, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)));
      }
      uv.needsUpdate = true;
    };
    const skin = new THREE.MeshStandardMaterial({ map: tex, roughness: .5, metalness: 0, transparent: true, opacity: 0 });
    const cap = new THREE.MeshStandardMaterial({ color: '#2a2630', roughness: .8, transparent: true, opacity: 0 });
    const group = new THREE.Group();
    let aspect = (o.X1 - o.X0) / Hb;
    if (s.model === 'lathe') {
      // radius per row, lightly smoothed, from the base (y = 0) to the top (y = 1), closed at both ends
      const rad = o.span.map(([l, r]) => (l < 0 ? 0 : (r - l + 1) / 2 / Hb * .985));
      const sm = rad.map((v, i) => (rad[Math.max(0, i - 1)] + v * 2 + rad[Math.min(rad.length - 1, i + 1)]) / 4);
      const pts = [new THREE.Vector2(0, 0)];
      for (let k = o.rows; k >= 0; k--) pts.push(new THREE.Vector2(Math.max(.001, sm[k]), 1 - k / o.rows));
      pts.push(new THREE.Vector2(0, 1));
      const geo = new THREE.LatheGeometry(pts, 96);
      geo.rotateY(Math.PI / 2); // lathe starts on +x; turn so the seam sits at the back
      project(geo);
      const mesh = new THREE.Mesh(geo, skin); group.add(mesh);
      aspect = Math.max(...sm) * 2;
    } else {
      const n = s.model, pw = (o.X1 - o.X0) / n;
      for (let k = 0; k < n; k++) {
        const x0 = o.X0 + pw * k, x1 = x0 + pw, r = pw / 2 / Hb * .97;
        const h = (o.Y1 - o.top(Math.round(x0 + pw * .3), Math.round(x1 - pw * .3))) / Hb;
        const geo = new THREE.CylinderGeometry(r, r, h, 40, 1, false);
        geo.translate(0, h / 2, 0);
        const xc = ((x0 + x1) / 2 - cx) / Hb;
        project(geo, xc);
        const mesh = new THREE.Mesh(geo, [skin, cap, cap]); mesh.position.x = xc; mesh.position.z = (k % 2) * -r * .35;
        group.add(mesh);
      }
    }
    const ao = new THREE.Mesh(new THREE.PlaneGeometry(aspect * 1.5, Math.max(.25, aspect * .7)), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, opacity: 0 }));
    ao.rotation.x = -Math.PI / 2; ao.position.y = .002; ao.renderOrder = 3; group.add(ao);
    scene.add(group);
    return { group, fade: 0, dir: 1, aspect, mats: [skin, cap, ao.material as THREE.Material] };
  };

  /** solve the camera so the model (1 unit tall, base on the floor) projects onto the DOM image's body box */
  const layout = () => {
    W = root.clientWidth; H = root.clientHeight;
    renderer.setSize(W, H, false);
    mirror.getRenderTarget().setSize(Math.round(W * dpr * .5), Math.round(H * dpr * .5));
    if (!shot) return;
    const r = rectIn(shot.img, root), [x0, , x1, y1] = shot.obj;
    const h = r.h * y1, cx = r.x + r.w * (x0 + x1) / 2, yBase = r.y + h;
    const f = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const D = f / h;
    camera.aspect = W / H;
    camera.position.set(0, EYE, D);
    camera.lookAt(0, EYE, 0);
    camera.setViewOffset(W, H, W / 2 - cx, H / 2 - (yBase - h * EYE), W, H);
    camera.updateProjectionMatrix();
    const aspect = cur?.aspect ?? .5;
    fx.position.set((shot.nozzle[0] - .5) * aspect, 1 - shot.nozzle[1] + .14, .42);
  };

  const render = () => renderer.render(scene, camera);
  let lastT = performance.now();

  const api = {
    show(s: SetShot) {
      shot = s;
      if (cur) { cur.dir = -1; leaving.push(cur); }
      cur = build(s);
      fxColor.set(LIGHTS[s.color] ?? s.color); fx.color.copy(fxColor);
      layout(); render();
    },
    /** called by the stage engine every frame with the effect's light level (0 = off, ~1 = full flame) */
    frame(heat: number) {
      const now = performance.now(), dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
      fx.intensity = Math.max(0, heat) * 4.2;
      if (cur && cur.fade < 1) cur.fade = Math.min(1, cur.fade + dt / .5);
      for (const p of [cur, ...leaving]) {
        if (!p) continue;
        if (p.dir < 0) p.fade = Math.max(0, p.fade - dt / .35);
        p.mats.forEach((m) => { m.opacity = p.fade; });
      }
      for (let i = leaving.length - 1; i >= 0; i--) if (leaving[i].fade <= 0) {
        const p = leaving[i]; scene.remove(p.group);
        p.group.traverse((m) => { const mesh = m as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); });
        p.mats.forEach((m) => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); }); leaving.splice(i, 1);
      }
      render();
    },
    relayout() { layout(); render(); },
    destroy() { renderer.dispose(); },
  };
  new ResizeObserver(() => api.relayout()).observe(root);
  return api;
}
