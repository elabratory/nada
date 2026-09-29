import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import {
  CENTRE,
  FACILITIES,
  PROMOTIONS,
  RESTAURANTS,
  STORES,
  money,
  productSpot,
  type Rect,
  type Store,
} from '../data/mall';
import { createProductMesh, mat } from './products3d';
import {
  AdScreen,
  type AdSlide,
  kioskTexture,
  marbleFloor,
  oakFloor,
  priceTagTexture,
  signTexture,
  skyTexture,
  stepsTexture,
  wayfindingTexture,
  canvasTexture,
} from './textures';
import { People } from './people';

export type InteractKind = 'store' | 'product' | 'restaurant' | 'facility' | 'kiosk' | 'ad' | 'companion' | 'event';
export interface Interact {
  kind: InteractKind;
  id: string;
  label: string;
}

export interface World {
  scene: THREE.Scene;
  colliders: Rect[];
  /** Everything the raycaster should test (interactables + occluders). */
  pickables: THREE.Object3D[];
  update(dt: number, t: number, reducedMotion: boolean): void;
  highlightProduct(id: string | null): void;
  productAnchor(id: string): THREE.Vector3 | undefined;
  /** Toggle the expensive effects owned by the world (reflections, light shafts, sun shadows). */
  setQuality(q: Quality): void;
  /** Size of the planar-reflection buffer, normally half the screen. */
  setReflectionSize(w: number, h: number): void;
  /** Simulated time of day (0–24), weather and crowd level (0–1). */
  setAmbience(a: { hour: number; weather: Weather; crowd: number }): void;
  /** Lower the shutter, dim the lights and block the door of a closed store. */
  setStoreOpen(id: string, open: boolean): void;
  /** Take over the digital ad screens with an event slide (null restores promotions). */
  setEventSlide(slide: AdSlide | null): void;
  people: People;
  stores: {
    shutters: Map<string, THREE.Mesh>;
    storeLights: Map<string, THREE.PointLight>;
    storeLeds: Map<string, { mat: THREE.MeshBasicMaterial; on: THREE.Color }>;
  };
}

export type Weather = 'clear' | 'cloudy' | 'rain';

export type Quality = 'high' | 'medium' | 'low';

/** Direction the sunlight travels (down and towards the south-east). */
const SUN_DIR = new THREE.Vector3(0.42, -1, 0.3).normalize();
const SHADOW_SIZE: Record<Quality, number> = { high: 4096, medium: 2048, low: 1024 };

let oakCache: ReturnType<typeof oakFloor> | null = null;

const WALL = '#f2eee7';
const TRIM = '#2b2d33';
const H = 8; // concourse ceiling height
const SH = 4.6; // store ceiling height

export function buildWorld(renderer: THREE.WebGLRenderer): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dfe7ef');
  scene.fog = new THREE.Fog('#e8edf2', 45, 120);

  const pmrem = new THREE.PMREMGenerator(renderer);
  // Temporary studio environment; replaced at the end by one baked from the mall itself.
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const hemi = new THREE.HemisphereLight('#fff6ea', '#8a8078', 0.8);
  scene.add(hemi);
  // Afternoon sun. It only reaches the floor through the skylights, where the
  // mullions cast crisp striped shadows (the shadow map is rendered once).
  const sun = new THREE.DirectionalLight('#ffe6c4', 4.2);
  sun.target.position.set(0, 0, 2);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, -90);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 42, bottom: -42, near: 20, far: 180 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(SHADOW_SIZE.high, SHADOW_SIZE.high);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);

  const staticRoot = new THREE.Group();
  const dynamicRoot = new THREE.Group();
  scene.add(staticRoot, dynamicRoot);

  const colliders: Rect[] = [];
  const interactables: THREE.Object3D[] = [];
  const productMeshes = new Map<string, THREE.Object3D>();
  const productRings = new Map<string, THREE.Mesh>();
  const spinners: THREE.Object3D[] = [];
  const ads: AdScreen[] = [];

  const solid = (x1: number, z1: number, x2: number, z2: number) =>
    colliders.push({ x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2) });

  /** Axis-aligned box between two floor corners and two heights. */
  function slab(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    y1: number,
    y2: number,
    material: THREE.Material,
    opts: { collide?: boolean; parent?: THREE.Object3D } = {},
  ) {
    const w = Math.max(Math.abs(x2 - x1), 0.01);
    const d = Math.max(Math.abs(z2 - z1), 0.01);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, y2 - y1, d), material);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    (opts.parent ?? staticRoot).add(m);
    if (opts.collide) solid(x1, z1, x2, z2);
    return m;
  }

  function plane(w: number, h: number, material: THREE.Material, pos: [number, number, number], rotY = 0, parent = staticRoot) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(...pos);
    m.rotation.y = rotY;
    parent.add(m);
    return m;
  }

  function tag(obj: THREE.Object3D, interact: Interact) {
    obj.userData.interact = interact;
    interactables.push(obj);
  }

  const glass = new THREE.MeshStandardMaterial({
    color: '#cfe8ff',
    roughness: 0.05,
    metalness: 0.2,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const wallMat = mat(WALL, 0.85);
  const trimMat = mat(TRIM, 0.5, 0.3);
  const ceilMat = mat('#fbfaf7', 0.95);
  // HDR (> 1.0) colours so the bloom pass makes light fittings glow.
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 3.9, 3.4) });
  const skyGlass = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 2.05, 2.25) });
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture() });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const shutterMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(64, 256, (ctx, w, h) => {
      ctx.fillStyle = '#9aa1ab';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) {
        ctx.fillStyle = '#6b727c';
        ctx.fillRect(0, y + 6, w, 2);
        ctx.fillStyle = '#c3c8cf';
        ctx.fillRect(0, y, w, 1);
      }
    }),
    metalness: 0.6,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });
  const storeLights = new Map<string, THREE.PointLight>();
  const storeLeds = new Map<string, { mat: THREE.MeshBasicMaterial; on: THREE.Color }>();
  const shutters = new Map<string, THREE.Mesh>();
  const doorBlocks = new Map<string, Rect>();
  const liftTickers: (() => void)[] = [];
  let liftTimer = 0;

  // ---------- floor ----------
  // Polished marble (1.2 m tiles) with a real-time planar reflection mixed
  // into the standard PBR shader, softened and broken up by the grout.
  const b = CENTRE.bounds;
  const marble = marbleFloor();
  for (const t of [marble.map, marble.normalMap, marble.roughnessMap]) t.repeat.set((b.x2 - b.x1) / 2.4, (b.z2 - b.z1) / 2.4);
  const floorGeo = new THREE.PlaneGeometry(b.x2 - b.x1, b.z2 - b.z1);
  const floorMat = new THREE.MeshStandardMaterial({
    map: marble.map,
    normalMap: marble.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: marble.roughnessMap,
    roughness: 1,
    metalness: 0,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((b.x1 + b.x2) / 2, 0, (b.z1 + b.z2) / 2);
  scene.add(floor);

  const reflector = new Reflector(floorGeo, { textureWidth: 1024, textureHeight: 512, clipBias: 0.003, multisample: 0 });
  reflector.rotation.copy(floor.rotation);
  reflector.position.copy(floor.position);
  const reflectorMat = reflector.material as THREE.ShaderMaterial;
  reflectorMat.colorWrite = false;
  reflectorMat.depthWrite = false;
  reflector.raycast = () => {};
  // Render the reflection at most once per frame (AO and other passes also draw the scene).
  let reflectedThisFrame = false;
  const renderReflection = reflector.onBeforeRender.bind(reflector);
  reflector.onBeforeRender = (...args: Parameters<THREE.Object3D['onBeforeRender']>) => {
    if (reflectedThisFrame) return;
    reflectedThisFrame = true;
    renderReflection(...args);
  };
  reflector.visible = false;
  scene.add(reflector);
  const reflUniforms = {
    tReflect: { value: reflector.getRenderTarget().texture },
    textureMatrix: reflectorMat.uniforms.textureMatrix,
    reflStrength: { value: 0 },
  };
  floorMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, reflUniforms);
    sh.vertexShader =
      'uniform mat4 textureMatrix;\nvarying vec4 vReflUv;\n' +
      sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vReflUv = textureMatrix * vec4(position, 1.0);');
    sh.fragmentShader =
      'uniform sampler2D tReflect;\nuniform float reflStrength;\nvarying vec4 vReflUv;\n' +
      sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `if (reflStrength > 0.0) {
          vec4 ruv = vReflUv;
          #ifdef USE_NORMALMAP_TANGENTSPACE
            ruv.xy += mapN.xy * 0.025 * ruv.w;
          #endif
          vec2 ruv2 = ruv.xy / ruv.w;
          vec2 px = vec2(0.0018, 0.0026);
          vec3 rc = texture2D(tReflect, ruv2).rgb * 0.36
            + texture2D(tReflect, ruv2 + px).rgb * 0.16 + texture2D(tReflect, ruv2 - px).rgb * 0.16
            + texture2D(tReflect, ruv2 + vec2(px.x, -px.y)).rgb * 0.16 + texture2D(tReflect, ruv2 + vec2(-px.x, px.y)).rgb * 0.16;
          float gloss = 1.0 - clamp((roughnessFactor - 0.12) * 2.2, 0.0, 1.0);
          float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          float k = reflStrength * gloss * mix(0.45, 1.0, fres);
          outgoingLight = outgoingLight * (1.0 - 0.5 * k) + rc * k;
        }
        #include <opaque_fragment>`,
      );
  };

  // ---------- concourse ceiling, skylights & lights ----------
  const at = { x1: -8, z1: -5, x2: 8, z2: 5 }; // atrium void in the ceiling
  const ceil = (x1: number, z1: number, x2: number, z2: number, y = H) => {
    const m = plane(x2 - x1, z2 - z1, ceilMat, [(x1 + x2) / 2, y, (z1 + z2) / 2]);
    m.rotation.x = Math.PI / 2;
  };
  /** Ceiling rectangle with a rectangular opening cut out of it. */
  const ceilWithHole = (o: Rect, hole: Rect, y = H) => {
    ceil(o.x1, o.z1, o.x2, hole.z1, y);
    ceil(o.x1, hole.z2, o.x2, o.z2, y);
    ceil(o.x1, hole.z1, hole.x1, hole.z2, y);
    ceil(hole.x2, hole.z1, o.x2, hole.z2, y);
  };
  const skylights: { r: Rect; top: number; grid: number }[] = [];
  /** Raised glass lantern over an opening, with mullions that cast sun stripes. */
  const skylight = (r: Rect, base = H, rise = 1.2, grid = 2) => {
    const top = base + rise;
    slab(r.x1 - 0.15, r.z1 - 0.15, r.x2 + 0.15, r.z1, base, top, ceilMat);
    slab(r.x1 - 0.15, r.z2, r.x2 + 0.15, r.z2 + 0.15, base, top, ceilMat);
    slab(r.x1 - 0.15, r.z1, r.x1, r.z2, base, top, ceilMat);
    slab(r.x2, r.z1, r.x2 + 0.15, r.z2, base, top, ceilMat);
    const roof = plane(r.x2 - r.x1, r.z2 - r.z1, skyGlass, [(r.x1 + r.x2) / 2, top, (r.z1 + r.z2) / 2]);
    roof.rotation.x = Math.PI / 2;
    for (let x = r.x1 + grid; x < r.x2 - 0.3; x += grid) slab(x - 0.06, r.z1, x + 0.06, r.z2, top - 0.3, top - 0.02, trimMat);
    for (let z = r.z1 + grid; z < r.z2 - 0.3; z += grid) slab(r.x1, z - 0.06, r.x2, z + 0.06, top - 0.3, top - 0.02, trimMat);
    skylights.push({ r, top, grid });
  };
  const westSky = { x1: -46, z1: -1.5, x2: -10, z2: 1.5 };
  const eastSky = { x1: 10, z1: -1.5, x2: 46, z2: 1.5 };
  ceilWithHole({ x1: -48, z1: -7, x2: at.x1, z2: 7 }, westSky);
  ceilWithHole({ x1: at.x2, z1: -7, x2: 48, z2: 7 }, eastSky);
  skylight(westSky, H, 1.2, 1.5);
  skylight(eastSky, H, 1.2, 1.5);
  ceil(at.x1, -7, at.x2, at.z1);
  ceil(at.x1, at.z2, at.x2, 7);
  const discGeo = new THREE.CircleGeometry(0.35, 20);
  for (let x = -44; x <= 44; x += 6) {
    if (Math.abs(x) < 9) continue;
    for (const z of [-4.6, 4.6]) {
      const d = new THREE.Mesh(discGeo, lightMat);
      d.rotation.x = Math.PI / 2;
      d.position.set(x, H - 0.02, z);
      staticRoot.add(d);
    }
  }
  // Warm accent point lights along the concourse.
  for (const x of [-30, 0, 30]) {
    const p = new THREE.PointLight('#ffe7c2', 40, 30, 1.6);
    p.position.set(x, 6.5, 0);
    scene.add(p);
  }

  // ---------- atrium void, level-2 edge & escalators ----------
  // Double-height void above the atrium, open to a big glass roof.
  const voidMat = mat('#f4f0ea', 0.9);
  slab(at.x1 - 0.3, at.z1 - 0.3, at.x2 + 0.3, at.z1, H, H + 6, voidMat);
  slab(at.x1 - 0.3, at.z2, at.x2 + 0.3, at.z2 + 0.3, H, H + 6, voidMat);
  slab(at.x1 - 0.3, at.z1, at.x1, at.z2, H, H + 6, voidMat);
  slab(at.x2, at.z1, at.x2 + 0.3, at.z2, H, H + 6, voidMat);
  skylight({ x1: at.x1, z1: at.z1, x2: at.x2, z2: at.z2 }, H + 6, 0.6, 2);
  // Level-2 slab edge and glass balustrade ring.
  slab(at.x1, at.z1 - 0.01, at.x2, at.z1 + 0.35, H - 0.45, H + 0.05, mat('#ffffff', 0.4));
  slab(at.x1, at.z2 - 0.35, at.x2, at.z2 + 0.01, H - 0.45, H + 0.05, mat('#ffffff', 0.4));
  for (const z of [at.z1 + 0.2, at.z2 - 0.2]) {
    const bal = new THREE.Mesh(new THREE.BoxGeometry(at.x2 - at.x1, 1.05, 0.04), glass);
    bal.position.set(0, H + 0.55, z);
    dynamicRoot.add(bal);
    slab(at.x1, z - 0.04, at.x2, z + 0.04, H + 1.05, H + 1.12, trimMat);
  }
  const l2 = new THREE.MeshBasicMaterial({ map: signTexture('Level 2 · coming soon', '#1f2430', '#ffffff', 'This demo has one floor') });
  plane(7, 1.1, l2, [0, H + 2.4, at.z1 + 0.02]);
  plane(7, 1.1, l2, [0, H + 2.4, at.z2 - 0.02], Math.PI);
  // Escalator wedge + landing.
  const riseX1 = -4.5;
  const riseX2 = 5.5;
  const shape = new THREE.Shape();
  shape.moveTo(riseX1, 0);
  shape.lineTo(riseX2, 0);
  shape.lineTo(riseX2, H);
  shape.lineTo(riseX1, 0);
  const wedge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 5.2, bevelEnabled: false }),
    mat('#b8bec8', 0.35, 0.7),
  );
  wedge.position.z = -2.6;
  dynamicRoot.add(wedge);
  slab(riseX2, -2.6, at.x2, 2.6, H - 0.4, H, mat('#d9dde3', 0.5));
  const slope = Math.atan2(H, riseX2 - riseX1);
  const runLen = Math.hypot(H, riseX2 - riseX1);
  const st = stepsTexture();
  st.repeat.set(1, 18);
  st.rotation = Math.PI / 2;
  const stepMat = new THREE.MeshStandardMaterial({ map: st, roughness: 0.5, metalness: 0.4 });
  for (const zc of [-1.3, 1.3]) {
    const tread = new THREE.Mesh(new THREE.PlaneGeometry(runLen, 1.1), stepMat);
    tread.rotation.set(-Math.PI / 2, 0, 0);
    const pivot = new THREE.Group();
    pivot.position.set((riseX1 + riseX2) / 2, H / 2 + 0.03, zc);
    pivot.rotation.z = slope;
    pivot.add(tread);
    dynamicRoot.add(pivot);
    const flat = plane(1.2, 1.1, stepMat, [riseX1 - 0.6, 0.03, zc]);
    flat.rotation.x = -Math.PI / 2;
    for (const side of [-0.62, 0.62]) {
      const bal = new THREE.Mesh(new THREE.BoxGeometry(runLen + 1.2, 1.0, 0.04), glass);
      const bp = new THREE.Group();
      bp.position.set((riseX1 + riseX2) / 2 - 0.3, H / 2 + 0.55, zc + side);
      bp.rotation.z = slope;
      bal.position.set(0, 0, 0);
      bp.add(bal);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(runLen + 1.2, 0.08, 0.1), mat('#111', 0.4));
      rail.position.y = 0.52;
      bp.add(rail);
      dynamicRoot.add(bp);
    }
  }
  solid(CENTRE.atrium.x1, CENTRE.atrium.z1, CENTRE.atrium.x2, CENTRE.atrium.z2);
  const escSign = wayfindingTexture('⇵', 'Escalators', '#0f766e');
  const escP = plane(2.4, 0.6, new THREE.MeshBasicMaterial({ map: escSign }), [riseX1 - 1.25, 2.6, 0], -Math.PI / 2, dynamicRoot);
  escP.rotation.y = -Math.PI / 2;
  slab(riseX1 - 1.3, -0.05, riseX1 - 1.2, 0.05, 0, 2.3, trimMat);
  tag(escP, { kind: 'facility', id: 'escalators', label: 'Escalators' });

  // ---------- concourse edges (fillers + fascia) ----------
  for (const z of [-7, 7]) {
    const zo = z < 0 ? z - 0.4 : z;
    slab(-48, zo, 48, zo + 0.4, 4.8, H, wallMat);
    slab(-48, zo - 0.02 * Math.sign(z), 48, zo + 0.42, 4.75, 4.85, trimMat);
  }
  const fillers: [number, number, number][] = [
    [-48, -44, -7],
    [-28, -24, -7],
    [24, 28, -7],
    [44, 48, -7],
    [-48, -44, 7],
    [-28, -24, 7],
    [-8, -4, 7],
    [4, 8, 7],
    [44, 48, 7],
  ];
  for (const [x1, x2, z] of fillers) {
    const zo = z < 0 ? z - 0.4 : z;
    slab(x1, zo, x2, zo + 0.4, 0, 4.8, mat('#e7e1d7', 0.8), { collide: true });
  }

  // Wall-mounted digital ads on the fillers between shops.
  const adSlides = PROMOTIONS.map((p, i) => ({
    title: p.title,
    sub: p.detail,
    from: ['#ff4d6d', '#4361ee', '#2a9d8f', '#f77f00', '#7209b7', '#1d3557', '#e76f51', '#06d6a0'][i % 8],
    to: ['#7b2cbf', '#3a0ca3', '#264653', '#d62828', '#3f37c9', '#457b9d', '#9d0208', '#118ab2'][i % 8],
  }));
  const wallAds: [number, number][] = [
    [-26, -7],
    [26, -7],
    [-26, 7],
    [46, -7],
  ];
  wallAds.forEach(([x, z], i) => {
    const ad = new AdScreen(adSlides, i * 2);
    ads.push(ad);
    const face = z < 0 ? z + 0.03 : z - 0.03;
    slab(x - 1.25, z < 0 ? z : z - 0.12, x + 1.25, z < 0 ? z + 0.12 : z, 0.5, 4.3, mat('#15171c', 0.4));
    const scr = plane(2.2, 3.6, new THREE.MeshBasicMaterial({ map: ad.texture, color: new THREE.Color(1.5, 1.5, 1.5) }), [x, 2.4, face + (z < 0 ? 0.1 : -0.1)], z < 0 ? 0 : Math.PI, dynamicRoot);
    tag(scr, { kind: 'ad', id: 'deals', label: 'Digital advertising screen — view deals' });
  });

  // ---------- entrances ----------
  function entrance(x: number, facilityId: string, label: string, glyph: string, color: string) {
    const dir = Math.sign(x); // +1 east end, -1 west end
    const xo = x + dir * 0.2;
    slab(xo - 0.2, -7, xo + 0.2, -3, 0, H, wallMat, { collide: true });
    slab(xo - 0.2, 3, xo + 0.2, 7, 0, H, wallMat, { collide: true });
    slab(xo - 0.2, -3, xo + 0.2, 3, 3.3, H, wallMat);
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.3, 6), glass);
    g.position.set(xo, 1.65, 0);
    dynamicRoot.add(g);
    solid(xo - 0.2, -3, xo + 0.2, 3);
    for (const z of [-3, -1.5, 0, 1.5, 3]) slab(xo - 0.08, z - 0.06, xo + 0.08, z + 0.06, 0, 3.3, trimMat);
    const sky = plane(30, 16, skyMat, [x + dir * 6, 6, 0], -dir * Math.PI / 2, dynamicRoot);
    sky.material = skyMat;
    const s = plane(5, 1.25, new THREE.MeshBasicMaterial({ map: wayfindingTexture(glyph, label, color) }), [x - dir * 0.02, 4.2, 0], -dir * Math.PI / 2, dynamicRoot);
    tag(s, { kind: 'facility', id: facilityId, label });
    tag(g, { kind: 'facility', id: facilityId, label });
  }
  entrance(-48, 'west-entrance', 'Main Entrance', '⇦', '#2563eb');
  entrance(48, 'east-entrance', 'Parking P1–P3', 'P', '#2563eb');

  // ---------- stores ----------
  for (const s of STORES) buildStore(s);

  function buildStore(s: Store) {
    const r = s.rect;
    const north = s.side === 'north';
    const zf = north ? r.z2 : r.z1; // frontage line on the concourse
    const zb = north ? r.z1 : r.z2; // back wall
    const inward = north ? -1 : 1;
    const t = 0.3;
    const cx = (r.x1 + r.x2) / 2;
    const cz = (r.z1 + r.z2) / 2;
    const w = r.x2 - r.x1;
    const d = r.z2 - r.z1;
    const store: Interact = { kind: 'store', id: s.id, label: `${s.name} — view store` };

    // Shell
    slab(r.x1 - t, r.z1, r.x1, r.z2, 0, SH, wallMat, { collide: true });
    slab(r.x2, r.z1, r.x2 + t, r.z2, 0, SH, wallMat, { collide: true });
    slab(r.x1 - t, zb - (north ? t : 0), r.x2 + t, zb + (north ? 0 : t), 0, SH, wallMat, { collide: true });
    const c = plane(w, d, mat('#ffffff', 0.9), [cx, SH, cz]);
    c.rotation.x = Math.PI / 2;
    // Store floor finish
    let floorMat: THREE.Material;
    if (s.categories.includes('Fashion') || s.categories.includes('Beauty')) {
      if (!oakCache) {
        oakCache = oakFloor('#c29a70');
        oakCache.map.repeat.set(w / 4, d / 4);
        oakCache.normalMap.repeat.set(w / 4, d / 4);
      }
      floorMat = new THREE.MeshStandardMaterial({ map: oakCache.map, normalMap: oakCache.normalMap, roughness: 0.38 });
    } else floorMat = mat(s.id === 'volt' ? '#26282e' : '#d9dde2', s.id === 'volt' ? 0.25 : 0.3);
    const f = plane(w, d, floorMat, [cx, 0.005, cz]);
    f.rotation.x = -Math.PI / 2;
    for (let x = r.x1 + 3; x < r.x2 - 1; x += 5) {
      for (let z = Math.min(zf, zb) + 3; z < Math.max(zf, zb) - 1; z += 4.5) {
        const p = plane(2.4, 0.5, lightMat, [x + 0.5, SH - 0.01, z]);
        p.rotation.x = Math.PI / 2;
      }
    }
    const pl = new THREE.PointLight('#fff1dc', 25, 16, 1.5);
    pl.position.set(cx, SH - 0.6, cz);
    scene.add(pl);
    storeLights.set(s.id, pl);

    // Glass frontage with a 5 m open doorway.
    const dz = zf + (north ? -0.1 : 0.1);
    for (const [x1, x2] of [
      [r.x1, s.doorX - 2.5],
      [s.doorX + 2.5, r.x2],
    ]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, 3.1, 0.06), glass);
      g.position.set((x1 + x2) / 2, 0.3 + 1.55, dz);
      dynamicRoot.add(g);
      tag(g, store);
      solid(x1, dz - 0.15, x2, dz + 0.15);
      slab(x1, dz - 0.12, x2, dz + 0.12, 0, 0.3, mat(s.color, 0.5));
      for (let x = x1; x <= x2 + 0.01; x += (x2 - x1) / 2) slab(x - 0.05, dz - 0.08, x + 0.05, dz + 0.08, 0, 3.4, trimMat);
    }
    slab(s.doorX - 2.6, dz - 0.15, s.doorX - 2.4, dz + 0.15, 0, 3.4, mat(s.color, 0.4));
    slab(s.doorX + 2.4, dz - 0.15, s.doorX + 2.6, dz + 0.15, 0, 3.4, mat(s.color, 0.4));
    // Fascia + sign
    slab(r.x1, dz - 0.25, r.x2, dz + 0.25, 3.4, 4.8, mat(s.accent === '#ffffff' ? '#20242c' : '#ece8e1', 0.7));
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture(s.name, s.color, s.accent, s.categories.join(' · ')) });
    const sign = plane(8.5, 1.33, signMat, [s.doorX, 4.1, dz + (north ? 0.27 : -0.27)], north ? 0 : Math.PI, dynamicRoot);
    tag(sign, store);
    // Projecting blade sign so the store is visible down the concourse.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 2.2), mat(s.color, 0.5));
    blade.position.set(r.x1 + 0.6, 3.0, zf + (north ? 1.2 : -1.2));
    dynamicRoot.add(blade);
    const bladeTex = signTexture(s.name, s.color, s.accent);
    for (const side of [-1, 1]) {
      const bp = plane(2.2, 0.34, new THREE.MeshBasicMaterial({ map: bladeTex }), [blade.position.x + side * 0.045, 3.0, blade.position.z], side * Math.PI / 2, dynamicRoot);
      tag(bp, store);
    }
    slab(r.x1 + 0.55, zf - 0.05, r.x1 + 0.65, zf + 0.05, 3.35, 4.8, trimMat);
    // Glowing LED strip under the fascia in the brand colour (picked up by bloom).
    const ledCol = new THREE.Color(stripeColor(s.color, s.accent)).multiplyScalar(3.2);
    const led = new THREE.MeshBasicMaterial({ color: ledCol });
    const fz = dz + (north ? 0.26 : -0.26);
    slab(r.x1 + 0.2, fz - 0.03, r.x2 - 0.2, fz + 0.03, 3.36, 3.43, led);
    storeLeds.set(s.id, { mat: led, on: ledCol.clone() });
    // Roller shutter across the doorway, lowered when the store is closed.
    const shutter = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.4), shutterMat);
    shutter.position.set(s.doorX, 1.7, dz);
    if (!north) shutter.rotation.y = Math.PI;
    shutter.visible = false;
    dynamicRoot.add(shutter);
    shutters.set(s.id, shutter);

    // Feature wall inside with the store name.
    const featureZ = zb - inward * 0.02 + (north ? 0 : 0);
    slab(cx - 5, featureZ, cx + 5, featureZ + inward * -0.08, 0.2, SH - 0.3, mat(s.color, 0.6));
    const inner = plane(6, 0.94, new THREE.MeshBasicMaterial({ map: signTexture(s.name, s.color, s.accent) }), [cx, 3.4, featureZ - inward * 0.1], north ? 0 : Math.PI, dynamicRoot);
    tag(inner, store);

    // Back-wall shelving with miniature stock (merged into the static mesh later).
    for (const [i, y] of [0.7, 1.7].entries()) {
      slab(cx - 4.6, featureZ - inward * 0.1, cx + 4.6, featureZ - inward * 0.55, y - 0.04, y, mat('#ffffff', 0.4));
      for (let k = 0; k < 7; k++) {
        const p = s.products[(k + i) % s.products.length];
        const mini = createProductMesh(p.shape, p.color, p.accent);
        mini.scale.setScalar(0.55);
        mini.position.set(cx - 3.9 + k * 1.3, y, featureZ - inward * 0.33);
        if (!north) mini.rotation.y = Math.PI;
        staticRoot.add(mini);
      }
    }
    solid(cx - 5, featureZ, cx + 5, featureZ - inward * 0.6);

    // Side racks: rails of garments for fashion, screens for tech, etc.
    for (const side of [-1, 1]) {
      const x = side < 0 ? r.x1 + 0.6 : r.x2 - 0.6;
      slab(x - 0.3, zf + inward * 3, x + 0.3, zf + inward * 11, 0, 1.0, mat('#f7f7f7', 0.5), { collide: true });
      for (let k = 0; k < 5; k++) {
        const p = s.products[(k + (side > 0 ? 2 : 0)) % s.products.length];
        const mini = createProductMesh(p.shape, p.color, p.accent);
        mini.scale.setScalar(0.7);
        mini.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        mini.position.set(x, 1.0, zf + inward * (4 + k * 1.6));
        staticRoot.add(mini);
      }
    }

    // Counter
    const cxCounter = s.doorX + 4.2;
    slab(cxCounter - 1.4, zb - inward * 2.2, cxCounter + 1.4, zb - inward * 3.2, 0, 1.05, mat(s.color, 0.5), { collide: true });
    slab(cxCounter - 1.45, zb - inward * 2.15, cxCounter + 1.45, zb - inward * 3.25, 1.05, 1.12, mat('#ffffff', 0.3));

    // Hero products on pedestals (these are the clickable ones).
    s.products.forEach((p) => {
      const { x, z } = productSpot(p);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 1.0, 28), mat('#ffffff', 0.25));
      ped.position.set(x, 0.5, z);
      dynamicRoot.add(ped);
      tag(ped, { kind: 'product', id: p.id, label: `${p.name} — ${money(p.price)}` });
      const ringMat = new THREE.MeshBasicMaterial({ color: s.color === '#1a1a1a' ? s.accent : s.color });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.025, 8, 40), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 1.0, z);
      dynamicRoot.add(ring);
      productRings.set(p.id, ring);
      solid(x - 0.6, z - 0.6, x + 0.6, z + 0.6);

      const model = createProductMesh(p.shape, p.color, p.accent);
      model.scale.multiplyScalar(1.25);
      model.position.set(x, 1.02, z);
      model.rotation.y = north ? 0.4 : Math.PI + 0.4;
      dynamicRoot.add(model);
      tag(model, { kind: 'product', id: p.id, label: `${p.name} — ${money(p.price)}` });
      productMeshes.set(p.id, model);
      // Generous invisible hit volume so the whole display is easy to click/tap.
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.4, 12), hitMat);
      hit.position.set(x, 1.2, z);
      dynamicRoot.add(hit);
      tag(hit, { kind: 'product', id: p.id, label: `${p.name} — ${money(p.price)}` });
      spinners.push(model);

      const tagSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: priceTagTexture(p.name, money(p.price), !!p.wasPrice), depthWrite: false }),
      );
      tagSprite.scale.set(1.1, 0.41, 1);
      tagSprite.position.set(x, 2.05, z);
      dynamicRoot.add(tagSprite);
      tag(tagSprite, { kind: 'product', id: p.id, label: `${p.name} — ${money(p.price)}` });
    });
  }

  // ---------- amenities alcove ----------
  const am = CENTRE.amenities;
  slab(am.x1, am.z1 - 0.3, am.x2, am.z1, 0, 4.5, wallMat, { collide: true });
  const amc = plane(am.x2 - am.x1, am.z2 - am.z1, ceilMat, [0, 4.5, (am.z1 + am.z2) / 2]);
  amc.rotation.x = Math.PI / 2;
  slab(am.x1, am.z1 - 0.01, am.x2, am.z1 + 0.01, 3.4, 4.5, mat('#e7e1d7', 0.8));
  for (const f of FACILITIES.filter((f) => ['restroom', 'baby', 'lift'].includes(f.kind))) {
    const isLift = f.kind === 'lift';
    const doorMat = isLift ? mat('#b8bec8', 0.25, 0.8) : mat('#5c677d', 0.6);
    const door = plane(isLift ? 2.4 : 1.6, 2.4, doorMat, [f.x, 1.2, am.z1 + 0.02], 0, dynamicRoot);
    tag(door, { kind: 'facility', id: f.id, label: f.name });
    if (isLift) {
      slab(f.x - 0.02, am.z1 + 0.01, f.x + 0.02, am.z1 + 0.04, 0, 2.4, trimMat);
      // Floor indicator that cycles as the lift travels between G and P1–P3.
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 64;
      const lctx = c.getContext('2d')!;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const floors = ['G', 'P1', 'P2', 'P3', 'P2', 'P1'];
      let k = 0;
      const drawLift = () => {
        const up = k < 3;
        lctx.fillStyle = '#050608';
        lctx.fillRect(0, 0, 160, 64);
        lctx.fillStyle = '#ff9f1c';
        lctx.font = '800 40px ui-monospace, monospace';
        lctx.fillText(`${up ? '▲' : '▼'} ${floors[k]}`, 16, 46);
        tex.needsUpdate = true;
      };
      drawLift();
      liftTickers.push(() => {
        k = (k + 1) % floors.length;
        drawLift();
      });
      plane(0.6, 0.24, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6) }), [f.x, 2.5, am.z1 + 0.03], 0, dynamicRoot);
    }
    const glyph = f.kind === 'restroom' ? 'WC' : f.kind === 'baby' ? '♡' : '⇅';
    const s = plane(2.6, 0.65, new THREE.MeshBasicMaterial({ map: wayfindingTexture(glyph, f.kind === 'lift' ? 'Lifts · P1–P3' : f.name, f.kind === 'lift' ? '#2563eb' : '#0f766e') }), [f.x, 2.95, am.z1 + 0.03], 0, dynamicRoot);
    tag(s, { kind: 'facility', id: f.id, label: f.name });
  }
  const amSign = plane(4.2, 1.05, new THREE.MeshBasicMaterial({ map: wayfindingTexture('WC', 'Restrooms · Lifts', '#0f766e') }), [0, 4.1, am.z2 + 0.03 - 0.4 - 0.02], 0, dynamicRoot);
  amSign.position.z = -7.43 + 0.45;
  tag(amSign, { kind: 'facility', id: 'restrooms', label: 'Restrooms' });

  // ---------- security desk & CCTV ----------
  const secDesk = slab(-46.5, -6.95, -44.5, -6.15, 0, 1.1, mat('#1f2a44', 0.4), { collide: true });
  dynamicRoot.attach(secDesk);
  tag(secDesk, { kind: 'facility', id: 'security', label: 'Security & First Aid' });
  slab(-46.55, -7.0, -44.45, -6.1, 1.1, 1.15, mat('#e5e7eb', 0.3));
  // Monitors on the desk.
  for (const x of [-46.1, -45.5]) {
    slab(x - 0.22, -6.9, x + 0.22, -6.86, 1.15, 1.45, mat('#0b0d12', 0.3));
    plane(0.4, 0.26, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.55, 0.7) }), [x, 1.3, -6.85], 0, dynamicRoot);
  }
  const secSign = plane(2.6, 0.65, new THREE.MeshBasicMaterial({ map: wayfindingTexture('+', 'Security & First Aid', '#b91c1c') }), [-45.5, 2.7, -6.98], 0, dynamicRoot);
  tag(secSign, { kind: 'facility', id: 'security', label: 'Security & First Aid' });
  // Ceiling CCTV domes along the concourse and in the food court.
  const camBody = mat('#f5f5f5', 0.3);
  const camLens = new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.05, metalness: 0.5 });
  for (const [x, z, y] of [
    [-38, -6.2, H],
    [-18, 6.2, H],
    [-4, -6.2, H],
    [18, -6.2, H],
    [38, 6.2, H],
    [26, 20, H],
    [-45, -6.5, 4.6],
  ] as const) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), camLens);
    dome.position.set(x, y - 0.02, z);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), camBody);
    collar.position.set(x, y - 0.03, z);
    staticRoot.add(dome, collar);
  }

  // ---------- information desk ----------
  const desk = slab(-10.5, -6.4, -7.5, -4.6, 0, 1.1, mat('#ffffff', 0.3), { collide: true });
  dynamicRoot.attach(desk);
  tag(desk, { kind: 'facility', id: 'info-desk', label: 'Information Desk' });
  slab(-10.55, -6.45, -7.45, -4.55, 1.1, 1.16, mat('#2563eb', 0.4));
  const infoSign = plane(2.6, 0.65, new THREE.MeshBasicMaterial({ map: wayfindingTexture('i', 'Information', '#2563eb') }), [-9, 2.6, -6.3], 0, dynamicRoot);
  tag(infoSign, { kind: 'facility', id: 'info-desk', label: 'Information Desk' });
  slab(-9.05, -6.35, -8.95, -6.25, 1.1, 2.3, trimMat);

  // ---------- south entrance hall ----------
  const sh = CENTRE.southHall;
  slab(sh.x1 - 0.3, sh.z1, sh.x1, sh.z2, 0, 5, wallMat, { collide: true });
  slab(sh.x2, sh.z1, sh.x2 + 0.3, sh.z2, 0, 5, wallMat, { collide: true });
  const shc = plane(sh.x2 - sh.x1, sh.z2 - sh.z1, ceilMat, [0, 5, (sh.z1 + sh.z2) / 2]);
  shc.rotation.x = Math.PI / 2;
  const sGlass = new THREE.Mesh(new THREE.BoxGeometry(8, 3.3, 0.06), glass);
  sGlass.position.set(0, 1.65, sh.z2);
  dynamicRoot.add(sGlass);
  solid(sh.x1, sh.z2 - 0.2, sh.x2, sh.z2 + 0.2);
  slab(sh.x1, sh.z2 - 0.1, sh.x2, sh.z2 + 0.1, 3.3, 5, wallMat);
  for (const x of [-4, -2, 0, 2, 4]) slab(x - 0.06, sh.z2 - 0.08, x + 0.06, sh.z2 + 0.08, 0, 3.3, trimMat);
  plane(30, 16, skyMat, [0, 6, sh.z2 + 6], Math.PI, dynamicRoot);
  const sSign = plane(4.6, 1.15, new THREE.MeshBasicMaterial({ map: wayfindingTexture('⇩', 'South Entrance · Bus', '#2563eb') }), [0, 4.2, sh.z2 - 0.12], Math.PI, dynamicRoot);
  tag(sSign, { kind: 'facility', id: 'south-entrance', label: 'South Entrance' });
  tag(sGlass, { kind: 'facility', id: 'south-entrance', label: 'South Entrance' });
  const sSign2 = plane(4.2, 1.05, new THREE.MeshBasicMaterial({ map: wayfindingTexture('⇩', 'South Entrance · Bus', '#2563eb') }), [0, 4.1, 7.45], Math.PI, dynamicRoot);
  tag(sSign2, { kind: 'facility', id: 'south-entrance', label: 'South Entrance' });

  // ---------- food court ----------
  const fc = CENTRE.foodCourt;
  slab(fc.x1, fc.z2, fc.x2, fc.z2 + 0.3, 0, H, wallMat, { collide: true });
  slab(fc.x2, fc.z1, fc.x2 + 0.3, fc.z2, 0, H, wallMat, { collide: true });
  slab(fc.x1 - 0.3, fc.z1, fc.x1, fc.z2, 0, H, wallMat, { collide: true });
  const fcSky = { x1: 10, z1: 12.5, x2: 42, z2: 16.5 };
  ceilWithHole(fc, fcSky);
  skylight(fcSky, H, 1.2, 2);
  const fcFloor = plane(fc.x2 - fc.x1, fc.z2 - fc.z1, mat('#d6cbb8', 0.45), [(fc.x1 + fc.x2) / 2, 0.004, (fc.z1 + fc.z2) / 2]);
  fcFloor.rotation.x = -Math.PI / 2;
  for (const x of [17, 26, 35]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.8, 20), mat('#ffffff', 0.4));
    col.position.set(x, 2.4, 7.2);
    staticRoot.add(col);
    solid(x - 0.4, 6.8, x + 0.4, 7.6);
  }
  const fcSign = plane(
    8,
    1.25,
    new THREE.MeshBasicMaterial({ map: signTexture('Food Court', '#1f2430', '#ffd166', 'Burgers · Sushi · Pizza · Coffee') }),
    [26, 4.15, 6.58],
    0,
    dynamicRoot,
  );
  fcSign.rotation.y = Math.PI;
  fcSign.position.z = 6.98 - 0.02 + 0.0;
  tag(fcSign, { kind: 'restaurant', id: 'food-court', label: 'Food Court' });
  // Counters along the back wall
  solid(fc.x1, 21.4, fc.x2, fc.z2);
  for (const r of RESTAURANTS) {
    const counter = slab(r.x - 3.8, 21.4, r.x + 3.8, 22.4, 0, 1.05, mat(r.color, 0.5));
    dynamicRoot.attach(counter);
    tag(counter, { kind: 'restaurant', id: r.id, label: `${r.name} — view menu` });
    slab(r.x - 3.85, 21.35, r.x + 3.85, 22.45, 1.05, 1.12, mat('#f8f9fa', 0.3));
    slab(r.x - 4, 22.4, r.x + 4, fc.z2, 0, 4.5, mat('#2b2d33', 0.8));
    slab(r.x - 4.3, fc.z2 - 0.1, r.x - 4, 21.3, 0, 4.5, mat(r.color, 0.5));
    const sign = plane(7.4, 1.16, new THREE.MeshBasicMaterial({ map: signTexture(r.name, r.color, r.accent, r.cuisine) }), [r.x, 3.9, 22.38], Math.PI, dynamicRoot);
    tag(sign, { kind: 'restaurant', id: r.id, label: `${r.name} — view menu` });
    const menuLines = r.menu.flatMap((m) => m.items).slice(0, 7).map((i) => `${i.name.slice(0, 22)}  ${money(i.price)}`);
    const board = plane(3.4, 1.6, new THREE.MeshBasicMaterial({ map: menuBoard(r.name, menuLines) }), [r.x, 2.35, 23.6], Math.PI, dynamicRoot);
    board.position.z = 22.38;
    board.position.x = r.x;
    board.position.y = 2.3;
    tag(board, { kind: 'restaurant', id: r.id, label: `${r.name} — view menu` });
    const pl = new THREE.PointLight('#ffd9a8', 14, 10, 1.6);
    pl.position.set(r.x, 3.4, 20);
    scene.add(pl);
  }
  // Tables & chairs
  const tableTop = mat('#f1ede4', 0.4);
  const chair = mat('#2a9d8f', 0.6);
  for (const x of [14, 20, 26, 32, 38]) {
    for (const z of [12, 16.2]) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 24), tableTop);
      top.position.set(x, 0.75, z);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.25, 0.75, 12), trimMat);
      leg.position.set(x, 0.37, z);
      staticRoot.add(top, leg);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const cx = x + Math.cos(a) * 0.95;
        const cz = z + Math.sin(a) * 0.95;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), chair);
        seat.position.set(cx, 0.45, cz);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.05), chair);
        back.position.set(cx + Math.cos(a) * 0.2, 0.7, cz + Math.sin(a) * 0.2);
        back.lookAt(x, 0.7, z);
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.45, 0.36), trimMat);
        legs.scale.set(0.15, 1, 0.15);
        legs.position.set(cx, 0.22, cz);
        staticRoot.add(seat, back, legs);
      }
      solid(x - 1.35, z - 1.35, x + 1.35, z + 1.35);
    }
  }
  // Pendant lights
  for (let x = 12; x <= 40; x += 7) {
    for (const z of [11, 17]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3, 4), trimMat);
      cord.position.set(x, H - 1.5, z);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.4, 20, 1, true), mat('#1f2430', 0.5));
      shade.position.set(x, H - 3.1, z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), lightMat);
      bulb.position.set(x, H - 3.28, z);
      staticRoot.add(cord, shade, bulb);
    }
  }

  // ---------- concourse furniture: planters, benches, kiosks, ad totems ----------
  const planterMat = mat('#6b4f3a', 0.7);
  const leaf = [mat('#2d6a4f', 0.8), mat('#40916c', 0.8), mat('#52b788', 0.8)];
  function planter(x: number) {
    slab(x - 1.4, -1.1, x + 1.4, 1.1, 0, 0.6, planterMat, { collide: true });
    slab(x - 1.3, -1.0, x + 1.3, 1.0, 0.6, 0.62, mat('#3b2a1f', 1));
    for (let k = 0; k < 7; k++) {
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + (k % 3) * 0.1, 0), leaf[k % 3]);
      bush.position.set(x - 1 + (k % 4) * 0.66, 0.85, (k < 4 ? -0.45 : 0.45) + ((k * 37) % 10) * 0.02);
      staticRoot.add(bush);
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.2, 8), mat('#5b4636', 0.9));
    trunk.position.set(x, 2.2, 0);
    staticRoot.add(trunk);
    for (let k = 0; k < 4; k++) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 - k * 0.1, 1), leaf[k % 3]);
      crown.position.set(x + Math.cos(k * 2.1) * 0.5, 3.6 + k * 0.35, Math.sin(k * 2.1) * 0.5);
      staticRoot.add(crown);
    }
    for (const z of [-1.9, 1.9]) bench(x, z);
  }
  function bench(x: number, z: number) {
    const wood = mat('#b5835a', 0.6);
    slab(x - 1.2, z - 0.28, x + 1.2, z + 0.28, 0.42, 0.5, wood, { collide: true });
    slab(x - 1.1, z - 0.2, x - 0.95, z + 0.2, 0, 0.42, trimMat);
    slab(x + 0.95, z - 0.2, x + 1.1, z + 0.2, 0, 0.42, trimMat);
  }
  function kiosk(x: number) {
    slab(x - 0.25, -0.7, x + 0.25, 0.7, 0, 2.3, mat('#1f2430', 0.4), { collide: true });
    const lines = ['Stride Athletics  N01', 'Orchard Tech  N02', 'Thread & Co  N03', 'Lumière Beauty  N04', 'Sneaker Vault  S01', 'Volt Hi-Fi  S02', 'Food Court  →', 'Restrooms · Lifts'];
    const tex = kioskTexture(`${CENTRE.name}`, lines);
    for (const side of [-1, 1]) {
      const scr = plane(1.2, 2.0, new THREE.MeshBasicMaterial({ map: tex }), [x + side * 0.26, 1.25, 0], side * Math.PI / 2, dynamicRoot);
      tag(scr, { kind: 'kiosk', id: 'map', label: 'Directory screen — open the map' });
    }
  }
  function adTotem(x: number, start: number) {
    slab(x - 0.2, -0.95, x + 0.2, 0.95, 0, 3.4, mat('#15171c', 0.4), { collide: true });
    for (const side of [-1, 1]) {
      const ad = new AdScreen(adSlides, start + (side > 0 ? 1 : 0));
      ads.push(ad);
      const scr = plane(1.7, 2.84, new THREE.MeshBasicMaterial({ map: ad.texture, color: new THREE.Color(1.5, 1.5, 1.5) }), [x + side * 0.21, 1.9, 0], side * Math.PI / 2, dynamicRoot);
      tag(scr, { kind: 'ad', id: 'deals', label: 'Digital advertising screen — view deals' });
    }
  }
  kiosk(-31);
  planter(-21);
  adTotem(-12, 0);
  planter(11.5);
  kiosk(21);
  adTotem(31, 3);
  planter(41);

  // ---------- people silhouettes ----------
  const people = new People();
  scene.add(people.group);

  // ---------- volumetric-looking light shafts under the skylights ----------
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffe9c8') }, uOpacity: { value: 0.07 } },
    vertexShader: `attribute float aH; varying float vH; varying float vDepth;
      void main() { vH = aH; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    // Fade with distance so shafts seen end-on down the concourse don't pile up into glare.
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vH; varying float vDepth;
      void main() {
        float a = smoothstep(0.0, 0.45, vH) * smoothstep(1.0, 0.8, vH) * (1.0 - smoothstep(8.0, 30.0, vDepth));
        gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shafts = new THREE.Mesh(new THREE.BufferGeometry(), shaftMat);
  shafts.raycast = () => {};
  shafts.frustumCulled = false;
  scene.add(shafts);
  const sunDir = SUN_DIR.clone();
  function rebuildShafts() {
    const pos: number[] = [];
    const hAttr: number[] = [];
    const k = 1 / Math.max(0.25, -sunDir.y);
    for (const { r, top, grid } of skylights) {
      const off = { x: sunDir.x * top * k, z: sunDir.z * top * k };
      for (let x = r.x1; x < r.x2 - 0.1; x += grid)
        for (let z = r.z1; z < r.z2 - 0.1; z += grid) {
          const x1 = x + 0.1;
          const x2 = Math.min(x + grid, r.x2) - 0.1;
          const z1 = z + 0.1;
          const z2 = Math.min(z + grid, r.z2) - 0.1;
          const T = [
            [x1, z1],
            [x2, z1],
            [x2, z2],
            [x1, z2],
          ];
          for (let i = 0; i < 4; i++) {
            const [ax, az] = T[i];
            const [bx, bz] = T[(i + 1) % 4];
            // quad: top a, top b, bottom b, bottom a
            const quad = [
              [ax, top, az, 1],
              [bx, top, bz, 1],
              [bx + off.x, 0, bz + off.z, 0],
              [ax + off.x, 0, az + off.z, 0],
            ];
            for (const idx of [0, 1, 2, 0, 2, 3]) {
              const q = quad[idx];
              pos.push(q[0], q[1], q[2]);
              hAttr.push(q[3]);
            }
          }
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hAttr, 1));
    shafts.geometry.dispose();
    shafts.geometry = g;
  }
  rebuildShafts();

  // ---------- rain seen through the entrance glass ----------
  const rain = new THREE.Group();
  const rainTex = canvasTexture(128, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(220,230,245,0.55)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 90; i++) {
      const x = (i * 53) % w;
      const y = (i * 97) % h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 26);
      ctx.stroke();
    }
  });
  rainTex.wrapS = rainTex.wrapT = THREE.RepeatWrapping;
  rainTex.repeat.set(6, 2);
  const rainMat = new THREE.MeshBasicMaterial({ map: rainTex, transparent: true, depthWrite: false });
  for (const [x, z, ry] of [
    [-50.5, 0, Math.PI / 2],
    [50.5, 0, -Math.PI / 2],
    [0, 22, Math.PI],
  ] as const) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), rainMat);
    p.position.set(x, 4, z);
    p.rotation.y = ry;
    p.raycast = () => {};
    rain.add(p);
  }
  rain.visible = false;
  scene.add(rain);

  // ---------- merge static geometry into a few draw calls ----------
  mergeStatic(staticRoot);

  // Shadows: everything solid casts and receives; glass, glows, screens and
  // helpers don't cast. The sun never moves between frames, so the shadow map
  // is only re-rendered when the time of day or quality changes.
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const material = m.material as THREE.Material;
    m.receiveShadow = true;
    m.castShadow =
      !(material as THREE.MeshBasicMaterial).isMeshBasicMaterial &&
      !(material as THREE.ShaderMaterial).isShaderMaterial &&
      !material.transparent &&
      material.visible !== false;
  });
  people.group.traverse((o) => (o.castShadow = false));
  floor.castShadow = false;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  // Bake an environment map from the finished mall so every glossy surface
  // (glass, metal, marble) reflects the real surroundings.
  scene.environment = pmrem.fromScene(scene, 0.03, 0.1, 160, { position: new THREE.Vector3(-18, 3.2, 0), size: 256 }).texture;
  scene.environmentIntensity = 0.9;
  renderer.shadowMap.needsUpdate = true;

  // Pickables: interactables plus the merged static meshes as occluders.
  const pickables: THREE.Object3D[] = [...interactables, ...staticRoot.children, floor];

  // ---------- time of day, weather and crowds ----------
  const skyGlassBase = skyGlass.color.clone();
  let quality: Quality = 'high';
  let sunFactor = 1;
  function applySun() {
    sun.castShadow = quality !== 'low';
    // Without shadows the sun would light every surface indoors, so it is dimmed.
    sun.intensity = (quality === 'low' ? 1.0 : 4.2) * sunFactor;
    shafts.visible = quality === 'high' && sunFactor > 0.25;
    shaftMat.uniforms.uOpacity.value = 0.045 * Math.min(1, sunFactor);
    renderer.shadowMap.needsUpdate = true;
  }

  let adTimer = 0;
  let highlighted: string | null = null;
  return {
    scene,
    colliders,
    pickables,
    people,
    stores: { shutters, storeLights, storeLeds },
    setQuality(q) {
      quality = q;
      reflector.visible = q === 'high';
      reflUniforms.reflStrength.value = q === 'high' ? 0.34 : 0;
      const size = SHADOW_SIZE[q];
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.map?.dispose();
        (sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
        sun.shadow.mapSize.set(size, size);
      }
      applySun();
    },
    setReflectionSize(w, h) {
      reflector.getRenderTarget().setSize(Math.max(64, Math.round(w)), Math.max(64, Math.round(h)));
    },
    setAmbience({ hour, weather, crowd }) {
      // Sun arcs from east (morning) to west (evening).
      const dayT = THREE.MathUtils.clamp((hour - 6) / 13, 0, 1);
      const elev = Math.sin(dayT * Math.PI);
      const daylight = THREE.MathUtils.smoothstep(elev, 0.02, 0.35);
      const cloud = weather === 'clear' ? 1 : weather === 'cloudy' ? 0.3 : 0.12;
      sunDir.set(-Math.cos(dayT * Math.PI) * 0.9, -Math.max(0.3, elev), 0.32).normalize();
      sun.position.copy(sun.target.position).addScaledVector(sunDir, -90);
      const warm = 1 - THREE.MathUtils.smoothstep(elev, 0.15, 0.6);
      sun.color.setRGB(1, 0.92 - warm * 0.2, 0.8 - warm * 0.35);
      sunFactor = daylight * cloud;
      rebuildShafts();
      applySun();
      const skyK = 0.12 + daylight * (weather === 'clear' ? 1 : weather === 'cloudy' ? 0.65 : 0.45);
      skyGlass.color.copy(skyGlassBase).multiplyScalar(skyK);
      if (daylight < 0.3) skyGlass.color.lerp(new THREE.Color(0.05, 0.08, 0.2), 1 - daylight / 0.3);
      skyMat.color.setScalar(0.25 + 0.75 * skyK);
      if (weather !== 'clear') skyMat.color.multiply(new THREE.Color(0.8, 0.85, 0.9));
      // Night: daylight fades and the centre runs on its own (warmer) lighting.
      hemi.intensity = 0.22 + 0.45 * daylight;
      hemi.color.setRGB(1, 0.93 + 0.04 * daylight, 0.82 + 0.1 * daylight);
      scene.environmentIntensity = 0.3 + 0.38 * daylight;
      scene.fog!.color.setRGB(0.5 + 0.41 * daylight, 0.5 + 0.43 * daylight, 0.55 + 0.4 * daylight);
      rain.visible = weather === 'rain';
      people.setCrowd(crowd);
    },
    setEventSlide(slide) {
      ads.forEach((a) => a.setExtra(slide));
    },
    setStoreOpen(id, open) {
      const sh = shutters.get(id);
      if (sh) sh.visible = !open;
      const pl = storeLights.get(id);
      if (pl) pl.intensity = open ? 25 : 3;
      const led = storeLeds.get(id);
      if (led) led.mat.color.copy(led.on).multiplyScalar(open ? 1 : 0.08);
      const s = STORES.find((x) => x.id === id)!;
      const zf = s.side === 'north' ? s.rect.z2 : s.rect.z1;
      if (!open && !doorBlocks.has(id)) {
        const r = { x1: s.doorX - 2.5, z1: zf - 0.25, x2: s.doorX + 2.5, z2: zf + 0.25 };
        doorBlocks.set(id, r);
        colliders.push(r);
      } else if (open && doorBlocks.has(id)) {
        const r = doorBlocks.get(id)!;
        colliders.splice(colliders.indexOf(r), 1);
        doorBlocks.delete(id);
      }
    },
    update(dt, t, reducedMotion) {
      reflectedThisFrame = false;
      if (!reducedMotion) {
        rainTex.offset.y += dt * 1.6;
        st.offset.y -= dt * 0.35; // escalator steps moving
        liftTimer += dt;
        if (liftTimer > 2.5) {
          liftTimer = 0;
          liftTickers.forEach((f) => f());
        }
        for (const s of spinners) s.rotation.y += dt * 0.35;
        adTimer += dt;
        if (adTimer > 5) {
          adTimer = 0;
          ads.forEach((a) => a.next());
        }
      }
      people.update(dt, reducedMotion);
      for (const [id, ring] of productRings) {
        const on = id === highlighted;
        const s = on ? 1.3 + (reducedMotion ? 0 : Math.sin(t * 5) * 0.15) : 1;
        ring.scale.set(s, s, s);
        ring.position.y = on ? 1.02 : 1.0;
      }
    },
    highlightProduct(id) {
      highlighted = id;
    },
    productAnchor(id) {
      const m = productMeshes.get(id);
      return m ? m.position.clone() : undefined;
    },
  };
}

/** Brand colour for glows and stripes; swaps to the accent when the brand colour is near-black or near-white. */
export function stripeColor(color: string, accent: string) {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  const pick = lum(color) > 215 || lum(color) < 40 ? accent : color;
  return lum(pick) < 40 ? '#dfe7ff' : pick;
}

function menuBoard(title: string, lines: string[]) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#111317';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd166';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText(`${title} — menu`, 20, 36);
    ctx.font = '600 20px system-ui, sans-serif';
    lines.forEach((l, i) => {
      ctx.fillStyle = '#f1f3f5';
      ctx.fillText(l, 20 + (i >= 4 ? 250 : 0), 76 + (i % 4) * 44);
    });
  });
}

/** Bake every mesh under `root` into one merged mesh per material. */
function mergeStatic(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    g.clearGroups();
    let list = buckets.get(m.material);
    if (!list) buckets.set(m.material, (list = []));
    list.push(g);
  });
  root.clear();
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (merged) root.add(new THREE.Mesh(merged, material));
  }
}
