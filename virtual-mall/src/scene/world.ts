import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CENTRE,
  FACILITIES,
  PROMOTIONS,
  RESTAURANTS,
  STORES,
  money,
  type Rect,
  type Store,
} from '../data/mall';
import { createProductMesh, mat } from './products3d';
import {
  AdScreen,
  floorTexture,
  kioskTexture,
  priceTagTexture,
  signTexture,
  skyTexture,
  stepsTexture,
  wayfindingTexture,
  woodTexture,
  canvasTexture,
} from './textures';
import { People } from './people';

export type InteractKind = 'store' | 'product' | 'restaurant' | 'facility' | 'kiosk' | 'ad';
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
}

const WALL = '#f2eee7';
const TRIM = '#2b2d33';
const H = 8; // concourse ceiling height
const SH = 4.6; // store ceiling height

export function buildWorld(renderer: THREE.WebGLRenderer): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dfe7ef');
  scene.fog = new THREE.Fog('#e8edf2', 45, 120);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  scene.add(new THREE.HemisphereLight('#fffaf0', '#8a8f99', 1.5));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.1);
  sun.position.set(-20, 40, 10);
  scene.add(sun);

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
  const lightMat = new THREE.MeshBasicMaterial({ color: '#fffdf5' });
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture() });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  // ---------- floor ----------
  const b = CENTRE.bounds;
  const ft = floorTexture();
  ft.repeat.set((b.x2 - b.x1) / 4, (b.z2 - b.z1) / 4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(b.x2 - b.x1, b.z2 - b.z1),
    new THREE.MeshStandardMaterial({ map: ft, roughness: 0.28, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((b.x1 + b.x2) / 2, 0, (b.z1 + b.z2) / 2);
  scene.add(floor);

  // ---------- concourse ceiling, skylights & lights ----------
  const at = { x1: -8, z1: -5, x2: 8, z2: 5 }; // atrium void in the ceiling
  const ceil = (x1: number, z1: number, x2: number, z2: number, y: number) => {
    const m = plane(x2 - x1, z2 - z1, ceilMat, [(x1 + x2) / 2, y, (z1 + z2) / 2]);
    m.rotation.x = Math.PI / 2;
  };
  ceil(-48, -7, at.x1, 7, H);
  ceil(at.x2, -7, 48, 7, H);
  ceil(at.x1, -7, at.x2, at.z1, H);
  ceil(at.x1, at.z2, at.x2, 7, H);
  for (const [x1, x2] of [
    [-46, -10],
    [10, 46],
  ]) {
    const sky = plane(x2 - x1, 3, new THREE.MeshBasicMaterial({ color: '#eaf6ff' }), [(x1 + x2) / 2, H - 0.02, 0]);
    sky.rotation.x = Math.PI / 2;
    for (let x = x1; x <= x2; x += 4) slab(x - 0.06, -1.5, x + 0.06, 1.5, H - 0.25, H - 0.02, trimMat);
  }
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
  const voidMat = new THREE.MeshStandardMaterial({ color: '#f6f3ee', roughness: 0.9, side: THREE.BackSide });
  const voidBox = new THREE.Mesh(new THREE.BoxGeometry(at.x2 - at.x1, 6, at.z2 - at.z1), voidMat);
  voidBox.position.set(0, H + 3, 0);
  dynamicRoot.add(voidBox);
  const topSky = plane(14, 8, new THREE.MeshBasicMaterial({ color: '#eaf6ff' }), [0, H + 5.95, 0]);
  topSky.rotation.x = Math.PI / 2;
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
    const scr = plane(2.2, 3.6, new THREE.MeshBasicMaterial({ map: ad.texture }), [x, 2.4, face + (z < 0 ? 0.1 : -0.1)], z < 0 ? 0 : Math.PI, dynamicRoot);
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
    const fin = s.categories.includes('Fashion') || s.categories.includes('Beauty') ? woodTexture('#c8a27a') : null;
    if (fin) fin.repeat.set(w / 4, d / 4);
    const floorMat = fin
      ? new THREE.MeshStandardMaterial({ map: fin, roughness: 0.5 })
      : mat(s.id === 'volt' ? '#2b2d33' : '#d9dde2', 0.4);
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
    const slots: [number, number][] = [
      [-4.2, 4.5],
      [4.2, 4.5],
      [-3.4, 8.2],
      [3.4, 8.2],
      [0, 9.2],
    ];
    s.products.forEach((p, i) => {
      const [ox, depth] = slots[i % slots.length];
      const x = s.doorX + ox;
      const z = zf + inward * depth;
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
    if (isLift) slab(f.x - 0.02, am.z1 + 0.01, f.x + 0.02, am.z1 + 0.04, 0, 2.4, trimMat);
    const glyph = f.kind === 'restroom' ? 'WC' : f.kind === 'baby' ? '♡' : '⇅';
    const s = plane(2.6, 0.65, new THREE.MeshBasicMaterial({ map: wayfindingTexture(glyph, f.kind === 'lift' ? 'Lifts · P1–P3' : f.name, f.kind === 'lift' ? '#2563eb' : '#0f766e') }), [f.x, 2.95, am.z1 + 0.03], 0, dynamicRoot);
    tag(s, { kind: 'facility', id: f.id, label: f.name });
  }
  const amSign = plane(4.2, 1.05, new THREE.MeshBasicMaterial({ map: wayfindingTexture('WC', 'Restrooms · Lifts', '#0f766e') }), [0, 4.1, am.z2 + 0.03 - 0.4 - 0.02], 0, dynamicRoot);
  amSign.position.z = -7.43 + 0.45;
  tag(amSign, { kind: 'facility', id: 'restrooms', label: 'Restrooms' });

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
  const fcc = plane(fc.x2 - fc.x1, fc.z2 - fc.z1, ceilMat, [(fc.x1 + fc.x2) / 2, H, (fc.z1 + fc.z2) / 2]);
  fcc.rotation.x = Math.PI / 2;
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
      const scr = plane(1.7, 2.84, new THREE.MeshBasicMaterial({ map: ad.texture }), [x + side * 0.21, 1.9, 0], side * Math.PI / 2, dynamicRoot);
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

  // ---------- merge static geometry into a few draw calls ----------
  mergeStatic(staticRoot);

  // Pickables: interactables plus the merged static meshes as occluders.
  const pickables: THREE.Object3D[] = [...interactables, ...staticRoot.children, floor];

  let adTimer = 0;
  let highlighted: string | null = null;
  return {
    scene,
    colliders,
    pickables,
    update(dt, t, reducedMotion) {
      if (!reducedMotion) {
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
