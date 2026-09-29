import * as THREE from 'three';

/** Stylised shopper silhouettes that stroll along the concourse. */
interface Walker {
  obj: THREE.Group;
  targetX: number;
  speed: number;
  pause: number;
  phase: number;
}

const LANES = [-5.8, -5.0, 5.0, 5.8];
const SEATED: [number, number][] = [
  [14.9, 12.4],
  [19.2, 15.6],
  [26.8, 12.6],
  [31.3, 16.8],
  [38.8, 11.4],
];

export class People {
  readonly group = new THREE.Group();
  private walkers: Walker[] = [];

  constructor(count = 14) {
    const tones = ['#39404d', '#4a4f5c', '#2f3440', '#5a5f6b', '#3d4658'];
    const body = new THREE.CapsuleGeometry(0.21, 0.95, 4, 10);
    const head = new THREE.SphereGeometry(0.13, 12, 10);
    const make = (i: number, h = 1) => {
      const m = new THREE.MeshStandardMaterial({ color: tones[i % tones.length], roughness: 0.9, transparent: true, opacity: 0.88 });
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, m);
      b.position.y = 0.78 * h;
      b.scale.y = h;
      const hd = new THREE.Mesh(head, m);
      hd.position.y = 1.52 * h;
      g.add(b, hd);
      // Silhouettes never block clicks.
      g.traverse((o) => (o.raycast = () => {}));
      return g;
    };
    for (let i = 0; i < count; i++) {
      const obj = make(i, 0.9 + ((i * 7) % 5) * 0.05);
      obj.position.set(-44 + ((i * 37) % 88), 0, LANES[i % LANES.length]);
      this.group.add(obj);
      this.walkers.push({ obj, targetX: this.pick(), speed: 0.9 + ((i * 13) % 6) * 0.1, pause: 0, phase: i });
    }
    SEATED.forEach(([x, z], i) => {
      const p = make(i + 2, 0.72);
      p.position.set(x, 0.05, z);
      this.group.add(p);
    });
  }

  private pick() {
    return -44 + Math.random() * 88;
  }

  update(dt: number, reducedMotion: boolean) {
    if (reducedMotion) return;
    for (const w of this.walkers) {
      w.phase += dt;
      if (w.pause > 0) {
        w.pause -= dt;
        continue;
      }
      const dx = w.targetX - w.obj.position.x;
      if (Math.abs(dx) < 0.2) {
        w.targetX = this.pick();
        w.pause = Math.random() * 3;
        continue;
      }
      const dir = Math.sign(dx);
      w.obj.position.x += dir * w.speed * dt;
      w.obj.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      w.obj.position.y = Math.abs(Math.sin(w.phase * 6)) * 0.03;
    }
  }
}
