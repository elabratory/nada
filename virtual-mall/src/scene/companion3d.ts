import * as THREE from 'three';

/**
 * "Scout", the shopping companion: a small hovering light drone that
 * follows the shopper at shoulder height, slightly ahead and to the right,
 * and pulses while it is talking. Clicking it opens the companion chat.
 */
export class CompanionOrb {
  readonly group = new THREE.Group();
  private core: THREE.Mesh;
  private halo: THREE.Mesh;
  private ring: THREE.Mesh;
  private glow: THREE.Sprite;
  private talk = 0;
  private placed = false;
  private coreMat: THREE.MeshStandardMaterial;

  constructor() {
    this.coreMat = new THREE.MeshStandardMaterial({ color: '#dff6ff', emissive: new THREE.Color(0.4, 1.6, 2.4), roughness: 0.2, metalness: 0.1 });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), this.coreMat);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#b7e4ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.012, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 3) }));
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.006, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.2, 0.3), transparent: true, opacity: 0.8 }));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(140,220,255,0.9)');
    g.addColorStop(1, 'rgba(140,220,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.scale.setScalar(0.9);
    this.group.add(this.glow, this.core, shell, this.halo, this.ring);
    this.group.traverse((o) => (o.castShadow = false));
    this.group.userData.interact = { kind: 'companion', id: 'scout', label: 'Scout, your shopping companion — ask for help' };
    // A larger invisible target makes the small orb easy to click or tap.
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.group.add(hit);
  }

  /** Called when the companion starts speaking; makes it pulse for a moment. */
  speak() {
    this.talk = 2.2;
  }

  update(dt: number, t: number, px: number, pz: number, yaw: number, reducedMotion: boolean) {
    // Target: 1.1 m ahead, 0.75 m to the right, just below eye level.
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const tx = px + fx * 1.25 + rx * 0.8;
    const tz = pz + fz * 1.25 + rz * 0.8;
    const ty = 1.45 + (reducedMotion ? 0 : Math.sin(t * 1.7) * 0.05);
    if (!this.placed) {
      this.group.position.set(tx, ty, tz);
      this.placed = true;
    }
    const k = Math.min(1, dt * 3.5);
    this.group.position.x += (tx - this.group.position.x) * k;
    this.group.position.z += (tz - this.group.position.z) * k;
    this.group.position.y += (ty - this.group.position.y) * k;
    this.talk = Math.max(0, this.talk - dt);
    const pulse = this.talk > 0 && !reducedMotion ? 1 + Math.sin(t * 14) * 0.12 : 1;
    this.core.scale.setScalar(pulse);
    this.coreMat.emissiveIntensity = this.talk > 0 ? 1.4 : 1;
    if (!reducedMotion) {
      this.halo.rotation.set(t * 0.9, t * 1.3, 0);
      this.ring.rotation.set(Math.PI / 2 + Math.sin(t) * 0.3, 0, t * 0.6);
    }
  }

  /** Screen position (for the speech bubble), or null when behind the camera. */
  screenPos(camera: THREE.Camera, w: number, h: number) {
    const v = this.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)).project(camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }
}
