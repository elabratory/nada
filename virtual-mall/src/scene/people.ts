import * as THREE from 'three';

/**
 * Shoppers and security guards.
 *
 * Each person is an articulated low-poly human (head, hair, torso, arms,
 * legs, shoes, optional shopping bag or guard cap) with a walk cycle. To keep
 * the frame rate high, every body part is one InstancedMesh shared by the
 * whole crowd, so ~45 animated people cost about 9 draw calls.
 */

type Kind = 'walker' | 'seated' | 'guard' | 'guard-post';

interface Person {
  kind: Kind;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  speed: number;
  targetX: number;
  lane: number;
  pause: number;
  phase: number;
  visible: boolean;
  bag: boolean;
  /** Patrol route for guards: list of [x, z] points. */
  patrol?: [number, number][];
  patrolIdx?: number;
  colors: { skin: THREE.Color; hair: THREE.Color; top: THREE.Color; legs: THREE.Color; shoes: THREE.Color; bag: THREE.Color };
}

const SKIN = ['#f1c7a5', '#e0ac8a', '#c68863', '#a86b48', '#8d5524', '#6b3f22', '#4a2c1a', '#f5d6c1'];
const HAIR = ['#1b1512', '#2d2019', '#4a3526', '#7a5234', '#b98a55', '#d9c27f', '#8c8c8c', '#a33b20'];
const TOPS = ['#e63946', '#f1faee', '#457b9d', '#1d3557', '#2a9d8f', '#e9c46a', '#f4a261', '#6d597a', '#222222', '#adb5bd', '#90be6d', '#f28482'];
const LEGS = ['#1d3557', '#2b2d42', '#3d405b', '#6c757d', '#c8b48a', '#111111', '#264653'];
const BAGS = ['#ff5a36', '#d62839', '#ffd400', '#1a1a1a', '#e9ecef', '#f7c8d8'];
const LANES = [-5.8, -5.0, 5.0, 5.8, -4.4, 4.4];
const SEATED: [number, number, number][] = [
  [14.9, 12.7, 2.4],
  [19.3, 15.5, -0.8],
  [26.7, 12.7, 2.4],
  [31.3, 16.9, 3.9],
  [38.7, 11.3, 0.8],
  [20.7, 11.3, 0.8],
  [32.7, 12.7, 2.4],
  [13.3, 16.9, 3.9],
];

// Part names in draw order.
const PARTS = ['torso', 'head', 'hair', 'armL', 'armR', 'legL', 'legR', 'shoeL', 'shoeR', 'bag', 'cap', 'vest'] as const;
type Part = (typeof PARTS)[number];

const pick = <T,>(a: T[], i: number) => a[i % a.length];

export class People {
  readonly group = new THREE.Group();
  private people: Person[] = [];
  private meshes = {} as Record<Part, THREE.InstancedMesh>;
  private m = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private blob: THREE.InstancedMesh;

  constructor(walkers = 30) {
    let seed = 17;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const person = (kind: Kind, i: number, x: number, z: number, yaw = 0): Person => {
      const guard = kind === 'guard' || kind === 'guard-post';
      return {
        kind,
        x,
        z,
        yaw,
        scale: guard ? 1.02 : 0.86 + rnd() * 0.2,
        speed: guard ? 0.85 : 0.9 + rnd() * 0.6,
        targetX: -44 + rnd() * 88,
        lane: pick(LANES, i),
        pause: 0,
        phase: rnd() * 10,
        visible: true,
        bag: !guard && rnd() < 0.45,
        colors: {
          skin: new THREE.Color(pick(SKIN, Math.floor(rnd() * 97))),
          hair: new THREE.Color(pick(HAIR, Math.floor(rnd() * 89))),
          top: new THREE.Color(guard ? '#1f2a44' : pick(TOPS, Math.floor(rnd() * 101))),
          legs: new THREE.Color(guard ? '#1b2233' : pick(LEGS, Math.floor(rnd() * 71))),
          shoes: new THREE.Color(guard ? '#0d0d0d' : rnd() < 0.5 ? '#f5f5f5' : '#2a2a2a'),
          bag: new THREE.Color(pick(BAGS, Math.floor(rnd() * 53))),
        },
      };
    };
    for (let i = 0; i < walkers; i++) this.people.push(person('walker', i, -44 + rnd() * 88, pick(LANES, i)));
    SEATED.forEach(([x, z, yaw], i) => this.people.push(person('seated', i + 3, x, z, yaw)));
    // Security: two patrols along the concourse and one at the front desk.
    const g1 = person('guard', 1, -40, -2.8);
    g1.patrol = [
      [-40, -2.8],
      [-8, -3.2],
      [-8, 3.2],
      [-40, 3.0],
    ];
    const g2 = person('guard', 2, 40, 3.2);
    g2.patrol = [
      [42, 3.2],
      [9, 3.4],
      [9, 9.5],
      [40, 9.5],
      [42, 3.2],
    ];
    const post = person('guard-post', 3, -44.0, -5.75, 0.9);
    this.people.push(g1, g2, post);
    for (const p of [g1, g2]) p.patrolIdx = 1;

    const n = this.people.length;
    const std = (color = '#ffffff', rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
    const geos: Record<Part, THREE.BufferGeometry> = {
      torso: new THREE.CapsuleGeometry(0.16, 0.36, 4, 12).scale(1.15, 1, 0.72),
      head: new THREE.SphereGeometry(0.105, 16, 12).scale(0.92, 1.08, 1),
      hair: new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, 1.05, 1.02),
      armL: new THREE.CapsuleGeometry(0.052, 0.5, 3, 8).translate(0, -0.3, 0),
      armR: new THREE.CapsuleGeometry(0.052, 0.5, 3, 8).translate(0, -0.3, 0),
      legL: new THREE.CapsuleGeometry(0.072, 0.72, 3, 8).translate(0, -0.44, 0),
      legR: new THREE.CapsuleGeometry(0.072, 0.72, 3, 8).translate(0, -0.44, 0),
      shoeL: new THREE.BoxGeometry(0.1, 0.07, 0.25).translate(0, -0.87, 0.04),
      shoeR: new THREE.BoxGeometry(0.1, 0.07, 0.25).translate(0, -0.87, 0.04),
      bag: new THREE.BoxGeometry(0.26, 0.3, 0.09).translate(0, -0.72, 0),
      cap: new THREE.CylinderGeometry(0.115, 0.12, 0.07, 14),
      vest: new THREE.CapsuleGeometry(0.165, 0.3, 4, 12).scale(1.18, 1, 0.76),
    };
    for (const part of PARTS) {
      const mat = part === 'head' ? std('#ffffff', 0.6) : part === 'vest' ? new THREE.MeshStandardMaterial({ color: '#d4ff00', emissive: '#3a4a00', roughness: 0.6 }) : std();
      const mesh = new THREE.InstancedMesh(geos[part], mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      mesh.castShadow = false;
      this.meshes[part] = mesh;
      this.group.add(mesh);
    }
    // Soft contact shadows.
    this.blob = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.38, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.26, depthWrite: false }),
      n,
    );
    this.blob.frustumCulled = false;
    this.blob.raycast = () => {};
    this.group.add(this.blob);
    this.people.forEach((p, i) => {
      const c = p.colors;
      const set = (part: Part, col: THREE.Color) => this.meshes[part].setColorAt(i, col);
      set('torso', c.top);
      set('head', c.skin);
      set('hair', c.hair);
      // Short sleeves show skin on warm-coloured tops, otherwise sleeves match the top.
      set('armL', i % 3 === 0 && p.kind !== 'guard' && p.kind !== 'guard-post' ? c.skin : c.top);
      set('armR', i % 3 === 0 && p.kind !== 'guard' && p.kind !== 'guard-post' ? c.skin : c.top);
      set('legL', c.legs);
      set('legR', c.legs);
      set('shoeL', c.shoes);
      set('shoeR', c.shoes);
      set('bag', c.bag);
      set('cap', new THREE.Color('#141a2b'));
      set('vest', new THREE.Color('#ffffff'));
    });
    for (const part of PARTS) if (this.meshes[part].instanceColor) this.meshes[part].instanceColor!.needsUpdate = true;
    this.setCrowd(0.5);
    this.pose(0);
  }

  /** 0 = empty centre, 1 = peak-hour crowds. Guards are always on duty. */
  setCrowd(level: number) {
    const lv = THREE.MathUtils.clamp(level, 0, 1);
    const walkers = this.people.filter((p) => p.kind === 'walker');
    const seated = this.people.filter((p) => p.kind === 'seated');
    const nw = Math.round(lv * walkers.length);
    walkers.forEach((p, i) => (p.visible = i < nw));
    const ns = Math.round(lv * seated.length);
    seated.forEach((p, i) => (p.visible = i < ns));
    this.pose(0);
  }

  get count() {
    return this.people.filter((p) => p.visible && p.kind === 'walker').length;
  }

  update(dt: number, reducedMotion: boolean) {
    if (reducedMotion) return;
    for (const p of this.people) {
      if (!p.visible || p.kind === 'seated' || p.kind === 'guard-post') {
        p.phase += dt * 0.3;
        continue;
      }
      if (p.pause > 0) {
        p.pause -= dt;
        continue;
      }
      let tx: number;
      let tz: number;
      if (p.patrol) {
        [tx, tz] = p.patrol[p.patrolIdx!];
      } else {
        tx = p.targetX;
        tz = p.lane;
      }
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) {
        if (p.patrol) {
          p.patrolIdx = (p.patrolIdx! + 1) % p.patrol.length;
          p.pause = 1.5 + Math.random() * 2;
        } else {
          p.targetX = -44 + Math.random() * 88;
          p.pause = Math.random() * 3;
        }
        continue;
      }
      const step = Math.min(d, p.speed * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      const want = Math.atan2(dx, dz);
      let delta = want - p.yaw;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      p.yaw += delta * Math.min(1, dt * 6);
      p.phase += dt * p.speed * 5.2;
    }
    this.pose(dt);
  }

  private pose(_dt: number) {
    const { m, tmp, q, e, v, s } = this;
    this.people.forEach((p, i) => {
      const moving = (p.kind === 'walker' || p.kind === 'guard') && p.pause <= 0;
      const swing = moving ? Math.sin(p.phase) * 0.55 : 0;
      const bob = moving ? Math.abs(Math.cos(p.phase)) * 0.03 : Math.sin(p.phase) * 0.004;
      const seated = p.kind === 'seated';
      const base = new THREE.Matrix4().compose(
        v.set(p.x, seated ? -0.4 * p.scale : bob, p.z),
        q.setFromEuler(e.set(0, p.yaw, 0)),
        s.setScalar(p.visible ? p.scale : 0),
      );
      const place = (part: Part, px: number, py: number, pz: number, rx = 0, rz = 0, sc = 1) => {
        tmp.compose(v.set(px, py, pz), q.setFromEuler(e.set(rx, 0, rz)), s.setScalar(sc));
        m.multiplyMatrices(base, tmp);
        this.meshes[part].setMatrixAt(i, m);
      };
      const guard = p.kind === 'guard' || p.kind === 'guard-post';
      place('torso', 0, 1.2, 0);
      place('vest', 0, 1.22, 0, 0, 0, guard ? 1 : 0);
      place('head', 0, 1.6, 0.01);
      place('hair', 0, 1.625, -0.005, -0.12);
      place('cap', 0, 1.7, 0.01, -0.08, 0, guard ? 1 : 0);
      const legRot = seated ? -1.45 : swing;
      place('legL', -0.085, 0.92, 0, legRot);
      place('legR', 0.085, 0.92, 0, seated ? -1.45 : -swing);
      place('shoeL', -0.085, 0.92, 0, legRot);
      place('shoeR', 0.085, 0.92, 0, seated ? -1.45 : -swing);
      const armSwing = guard && !moving ? 0 : -swing * 0.8;
      place('armL', -0.235, 1.43, 0, seated ? -0.6 : armSwing, 0.08);
      place('armR', 0.235, 1.43, 0, seated ? -0.6 : -armSwing, -0.08);
      // Bag hangs from the right hand.
      place('bag', 0.3, 1.43, 0, -armSwing * 0.6, -0.08, p.bag && !seated ? 1 : 0);
      tmp.compose(v.set(p.x, 0.012, p.z), q.identity(), s.setScalar(p.visible ? p.scale : 0));
      this.blob.setMatrixAt(i, tmp);
    });
    for (const part of PARTS) this.meshes[part].instanceMatrix.needsUpdate = true;
    this.blob.instanceMatrix.needsUpdate = true;
  }
}
