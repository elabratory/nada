import * as THREE from 'three';
import type { P } from './pathfinding';

/** Glowing chevrons on the floor that trace the active route. */
export class RouteLine {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private material = new THREE.MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.9, depthWrite: false });
  private goal = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.8, 40),
    new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
  );
  private beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 6, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.35, depthWrite: false }),
  );
  private geo: THREE.BufferGeometry;

  constructor() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.32, -0.18);
    shape.lineTo(0, 0.2);
    shape.lineTo(0.32, -0.18);
    shape.lineTo(0.32, -0.02);
    shape.lineTo(0, 0.36);
    shape.lineTo(-0.32, -0.02);
    shape.closePath();
    this.geo = new THREE.ShapeGeometry(shape);
    this.geo.rotateX(-Math.PI / 2);
    this.goal.rotation.x = -Math.PI / 2;
    this.goal.position.y = 0.03;
    this.beacon.position.y = 3;
    this.group.add(this.goal, this.beacon);
    this.group.visible = false;
    this.group.traverse((o) => (o.raycast = () => {}));
  }

  set(path: P[] | null) {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }
    if (!path || path.length < 2) {
      this.group.visible = false;
      return;
    }
    const spots: { x: number; z: number; yaw: number }[] = [];
    const spacing = 1.2;
    let carry = 0.8;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      let d = carry;
      while (d < len) {
        spots.push({ x: a.x + ((b.x - a.x) * d) / len, z: a.z + ((b.z - a.z) * d) / len, yaw });
        d += spacing;
      }
      carry = d - len;
    }
    this.mesh = new THREE.InstancedMesh(this.geo, this.material, Math.max(1, spots.length));
    this.mesh.raycast = () => {};
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach((s, i) => {
      // Shape points toward -z after rotateX; rotate so it points along travel.
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw + Math.PI);
      m.compose(new THREE.Vector3(s.x, 0.03, s.z), q, new THREE.Vector3(1, 1, 1));
      this.mesh!.setMatrixAt(i, m);
    });
    this.mesh.count = spots.length;
    this.group.add(this.mesh);
    const end = path[path.length - 1];
    this.goal.position.x = this.beacon.position.x = end.x;
    this.goal.position.z = this.beacon.position.z = end.z;
    this.group.visible = true;
  }

  update(t: number, reducedMotion: boolean) {
    if (!this.group.visible) return;
    this.material.opacity = reducedMotion ? 0.9 : 0.65 + Math.sin(t * 4) * 0.25;
    const s = reducedMotion ? 1 : 1 + Math.sin(t * 3) * 0.12;
    this.goal.scale.set(s, s, s);
  }
}
