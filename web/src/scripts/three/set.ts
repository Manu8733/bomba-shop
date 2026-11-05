// The hero's Blender models keep the original product photography. The DOM photo stays visible until the
// selected model has rendered successfully. The camera is aligned to the photo so the layout stays fixed.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STACKED } from '../stage';

type SetShot = { img: HTMLImageElement; obj: number[]; nozzle: number[]; color: string; glb: string };

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

export function startSet(canvas: HTMLCanvasElement, root: HTMLElement, context: WebGL2RenderingContext) {
  const compact = matchMedia('(max-width: 767px), (pointer: coarse)');
  const stacked = matchMedia(STACKED);
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true });
  renderer.setClearColor(0x000000, 0); // the page's night backdrop shows through
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .05, 60);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // Reflect only the product into a small, softly fading patch. Empty reflection pixels stay transparent,
  // so loading a model never paints a different sky or an opaque floor over the page's photograph.
  // The bundled Reflector exposes this shader, but its type declarations omit the static property.
  const builtInShader = (Reflector as typeof Reflector & { ReflectorShader: {
    uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string;
  } }).ReflectorShader;
  const reflectionShader = {
    ...builtInShader,
    vertexShader: builtInShader.vertexShader
      .replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 floorUv;')
      .replace('vUv = textureMatrix', 'floorUv = uv * 2.0 - 1.0; vUv = textureMatrix'),
    fragmentShader: builtInShader.fragmentShader
      .replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 floorUv;')
      .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );', `
        float footprint = 1.0 - smoothstep(0.15, 1.0, length(floorUv));
        float alpha = base.a * footprint * 0.32;
        if (alpha < 0.003) discard;
        vec3 reflected = base.rgb / max(base.a, 0.0001);
        gl_FragColor = vec4(blendOverlay(reflected, color), alpha);
      `),
  };
  const mirror = new Reflector(new THREE.PlaneGeometry(2, 2), { color: 0x4a4a52, shader: reflectionShader,
    textureWidth: 512, textureHeight: 512, multisample: compact.matches ? 0 : 4, clipBias: .002 });
  const mirrorMaterial = mirror.material as THREE.ShaderMaterial;
  mirrorMaterial.transparent = true;
  mirrorMaterial.depthWrite = false;
  mirror.rotation.x = -Math.PI / 2; scene.add(mirror);
  const aoTex = canvasTexture(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(.4, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  });

  // ---- light: the effect's point light, a cool rim from behind-left, a warm one from behind-right, a soft key from the
  // front so every product stays readable, and almost no ambient. (A point light's shadow would cost six renders a frame
  // and falls under the product anyway; the contact shadow does that job.)
  const fx = new THREE.PointLight('#ffffff', 0, 0, 2); scene.add(fx);
  const rimL = new THREE.DirectionalLight('#8ea3ff', 1.1); rimL.position.set(-2.5, 1.6, -2.2); scene.add(rimL);
  const rimR = new THREE.DirectionalLight('#ffcf9a', .7); rimR.position.set(2.6, 1.3, -1.8); scene.add(rimR);
  const key = new THREE.DirectionalLight('#d8dcf2', .55); key.position.set(-1.2, 1.8, 3); scene.add(key);
  scene.add(new THREE.HemisphereLight('#22283a', '#030305', .25));

  let W = 0, H = 0, dpr = 0, productWidth = .5, cur: THREE.Group | null = null, shot: SetShot | null = null;
  let turnTo = 0, pending: AbortController | null = null;
  const gltf = new GLTFLoader();

  const disposeProduct = (product: THREE.Object3D) => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const bitmaps = new Set<ImageBitmap>();
    product.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const material of ([] as THREE.Material[]).concat(mesh.material)) materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture && value !== aoTex) textures.add(value);
      material.dispose();
    }
    for (const texture of textures) {
      const image = texture.source.data;
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) bitmaps.add(image);
      texture.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const image of bitmaps) image.close();
  };
  const clear = () => {
    pending?.abort(); pending = null;
    if (cur) { scene.remove(cur); disposeProduct(cur); cur = null; }
    shot = null;
  };

  /** solve the camera so the model (1 unit tall, base on the floor) projects onto the DOM image's body box */
  const layout = () => {
    const w = root.clientWidth, height = root.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, compact.matches ? 1 : 1.5);
    if (!w || !height) return;
    if (w !== W || height !== H || ratio !== dpr) {
      W = w; H = height; dpr = ratio;
      renderer.setDrawingBufferSize(W, H, dpr);
      const reflectionScale = compact.matches ? .35 : .5;
      mirror.getRenderTarget().setSize(Math.max(1, Math.round(W * dpr * reflectionScale)), Math.max(1, Math.round(H * dpr * reflectionScale)));
    }
    if (!shot) return;
    const r = rectIn(shot.img, root), [x0, , x1, y1] = shot.obj;
    const h = r.h * y1, cx = r.x + r.w * (x0 + x1) / 2, yBase = r.y + h;
    if (h <= 0) return;
    const f = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const D = f / h;
    camera.aspect = W / H;
    camera.position.set(0, EYE, D);
    camera.lookAt(0, EYE, 0);
    camera.setViewOffset(W, H, W / 2 - cx, H / 2 - (yBase - h * EYE), W, H);
    camera.updateProjectionMatrix();
    // A point at height y reflects onto the floor D*y/(EYE+y) in front of the product. End the local patch
    // after a short part of the product's reflection, before the copy in the stacked layout.
    const phone = stacked.matches, REFL = phone ? .22 : .42;
    const reach = D * REFL / (EYE + REFL);
    mirror.scale.set(Math.max(.14, productWidth * .95), reach, 1);
  };

  const show = async (next: SetShot) => {
    clear(); turnTo = 0;
    const load = new AbortController(); pending = load;
    const url = new URL(next.glb, location.href);
    let model: THREE.Group | null = null;
    try {
      const response = await fetch(url, { signal: load.signal });
      if (!response.ok) return;
      const bytes = await response.arrayBuffer();
      if (load.signal.aborted) return;
      model = (await gltf.parseAsync(bytes, new URL('.', url).href)).scene;
      if (load.signal.aborted || context.isContextLost()) return;

      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of ([] as THREE.Material[]).concat(mesh.material)) {
          const skin = m as THREE.MeshStandardMaterial, map = skin.map;
          if (!skin.isMeshStandardMaterial || !map) continue;
          // The exported skin can have cut-out pixels even when its GLB material is marked opaque.
          skin.transparent = true;
          // The photograph already carries its own studio light. Scene lights only add form.
          map.anisotropy = aniso;
          skin.emissive.set('#ffffff'); skin.emissiveMap = map; skin.emissiveIntensity = .72; skin.color.setScalar(.38); skin.roughness = .45;
        }
      });
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      if (!(size.x > 0 && size.y > 0)) return;
      productWidth = size.x;
      const ao = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.5, Math.max(.25, size.z * 1.6)), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false }));
      ao.rotation.x = -Math.PI / 2; ao.position.y = .002; ao.renderOrder = 3;
      cur = new THREE.Group(); cur.add(model, ao); scene.add(cur); model = null;
      shot = next;
      fx.color.set(LIGHTS[shot.color] ?? shot.color);
      fx.position.set((shot.nozzle[0] - .5) * size.x, 1 - shot.nozzle[1] + .14, .42);
      layout();
    } catch {
      // Keep the real photo when the request or decoding fails. An aborted request belongs to a previous slide.
      if (pending === load) clear();
    } finally {
      if (model) disposeProduct(model);
      if (pending === load) pending = null;
    }
  };

  const resize = new ResizeObserver(layout);
  resize.observe(root);
  const stage = root.querySelector<HTMLElement>('[data-stage]');
  if (stage) resize.observe(stage);
  let lastT = performance.now();
  return {
    turn(rad: number) { turnTo = rad; },
    show,
    frame(heat: number) {
      if (!cur || !W || !H || context.isContextLost()) return false;
      const now = performance.now(), dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
      fx.intensity = Math.max(0, heat) * 3.2;
      cur.rotation.y += (turnTo - cur.rotation.y) * Math.min(1, dt * 7);
      renderer.render(scene, camera);
      return true;
    },
    destroy() {
      resize.disconnect(); clear();
      mirror.geometry.dispose(); mirror.dispose();
      aoTex.dispose();
      renderer.dispose();
    },
  };
}
