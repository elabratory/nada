import * as THREE from 'three';
import { money, productById, storeById, restaurantById, facilityById, openStatus } from '../data/mall';
import type { Interact } from '../scene/world';
import { canvasTexture } from '../scene/textures';

/**
 * WebXR (VR headset) mode — a progressive enhancement. Desktop and mobile
 * never touch this code path unless the browser reports immersive-vr support.
 *
 * - Camera rig: the camera sits in a "dolly" that follows the player's
 *   position/heading; the headset adds real head movement on top.
 * - Locomotion: point at the floor and pull the trigger to teleport (only to
 *   walkable spots), left thumbstick for smooth movement, right thumbstick
 *   for 30° snap turns (most comfortable for most people).
 * - Interaction: point at a product, store sign or screen and pull the
 *   trigger to show a floating info card; trigger again on a product card to
 *   add it to the cart.
 */
export interface XRDeps {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  player: { x: number; z: number; yaw: number; nudge(dx: number, dz: number): void; place(x: number, z: number, yaw: number): void };
  pickables: () => THREE.Object3D[];
  canStand(x: number, z: number): boolean;
  addToCart(id: string): void;
  onStart(): void;
  onEnd(): void;
}

export class XRMode {
  readonly dolly = new THREE.Group();
  private controllers: THREE.Group[] = [];
  private raycaster = new THREE.Raycaster();
  private marker: THREE.Mesh;
  private card: THREE.Mesh;
  private cardFor: Interact | null = null;
  private snapReady = true;
  supported = false;

  constructor(private d: XRDeps) {
    d.renderer.xr.enabled = true;
    d.scene.add(this.dolly);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.32, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.8, 2.6), transparent: true, opacity: 0.9 }),
    );
    this.marker.visible = false;
    d.scene.add(this.marker);
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), new THREE.MeshBasicMaterial({ transparent: true }));
    this.card.visible = false;
    this.card.userData.xrCard = true;
    d.scene.add(this.card);

    for (let i = 0; i < 2; i++) {
      const c = d.renderer.xr.getController(i);
      const ray = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: '#7dd3fc' }),
      );
      ray.scale.z = 8;
      c.add(ray);
      c.addEventListener('selectstart', () => this.select(c));
      this.dolly.add(c);
      this.controllers.push(c);
      const grip = d.renderer.xr.getControllerGrip(i);
      grip.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: '#334155' })));
      this.dolly.add(grip);
    }

    d.renderer.xr.addEventListener('sessionstart', () => {
      this.dolly.add(d.camera);
      d.camera.position.set(0, 0, 0);
      d.camera.rotation.set(0, 0, 0);
      d.onStart();
    });
    d.renderer.xr.addEventListener('sessionend', () => {
      this.dolly.remove(d.camera);
      this.card.visible = false;
      this.marker.visible = false;
      d.onEnd();
    });
  }

  async detect() {
    try {
      this.supported = !!(await navigator.xr?.isSessionSupported('immersive-vr'));
    } catch {
      this.supported = false;
    }
    return this.supported;
  }

  async enter() {
    if (!navigator.xr) throw new Error('WebXR not available');
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    this.d.renderer.xr.setReferenceSpaceType('local-floor');
    await this.d.renderer.xr.setSession(session);
  }

  get presenting() {
    return this.d.renderer.xr.isPresenting;
  }

  private rayFrom(c: THREE.Object3D) {
    const m = new THREE.Matrix4().extractRotation(c.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m);
    this.raycaster.far = 30;
  }

  private hit(c: THREE.Object3D) {
    this.rayFrom(c);
    const hits = this.raycaster.intersectObjects([this.card, ...this.d.pickables()], true);
    for (const h of hits) {
      if (h.object === this.card && this.card.visible) return { card: true as const, point: h.point };
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.interact) o = o.parent;
      if (o) return { interact: o.userData.interact as Interact, point: h.point };
      const m = (h.object as THREE.Mesh).material as THREE.Material | undefined;
      if (m && m.transparent) continue;
      // Floor (normal pointing up) → teleport target.
      if (h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).y > 0.9) return { floor: true as const, point: h.point };
      return null;
    }
    return null;
  }

  private select(c: THREE.Object3D) {
    const r = this.hit(c);
    if (!r) return;
    if ('card' in r) {
      if (this.cardFor?.kind === 'product') this.d.addToCart(this.cardFor.id);
      this.card.visible = false;
      return;
    }
    if ('floor' in r) {
      if (this.d.canStand(r.point.x, r.point.z)) this.d.player.place(r.point.x, r.point.z, this.d.player.yaw);
      return;
    }
    this.showCard(r.interact, r.point);
  }

  private showCard(i: Interact, at: THREE.Vector3) {
    this.cardFor = i;
    let title = i.label;
    let lines: string[] = [];
    let action = 'Trigger on this card to close';
    if (i.kind === 'product') {
      const p = productById(i.id)!;
      title = p.name;
      lines = [`${money(p.price)}${p.wasPrice ? `  (was ${money(p.wasPrice)})` : ''}   ★ ${p.rating?.toFixed(1)}`, `${storeById(p.storeId)!.name} · ${p.availability}`, p.description.slice(0, 70)];
      action = 'Trigger on this card: add to cart';
    } else if (i.kind === 'store') {
      const s = storeById(i.id)!;
      title = s.name;
      lines = [s.categories.join(' · '), openStatus(s.hours).text, s.tagline];
    } else if (i.kind === 'restaurant' && restaurantById(i.id)) {
      const r = restaurantById(i.id)!;
      title = r.name;
      lines = [r.cuisine, openStatus(r.hours).text, r.menu[0].items.slice(0, 2).map((x) => `${x.name} ${money(x.price)}`).join(' · ')];
    } else if (i.kind === 'facility' && facilityById(i.id)) {
      const f = facilityById(i.id)!;
      title = f.name;
      lines = [f.description.slice(0, 80)];
    }
    const tex = canvasTexture(900, 560, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(8,12,24,0.92)';
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, 40);
      ctx.fill();
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '800 58px system-ui, sans-serif';
      ctx.fillText(title.slice(0, 26), 40, 100);
      ctx.font = '600 38px system-ui, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      lines.forEach((l, k) => ctx.fillText(l.slice(0, 44), 40, 190 + k * 64));
      ctx.fillStyle = '#fbbf24';
      ctx.font = '700 34px system-ui, sans-serif';
      ctx.fillText(action, 40, h - 50);
    });
    const mat = this.card.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = tex;
    mat.needsUpdate = true;
    const head = new THREE.Vector3();
    this.d.camera.getWorldPosition(head);
    this.card.position.copy(at).lerp(head, 0.35);
    this.card.position.y = Math.max(1.1, Math.min(2.2, this.card.position.y));
    this.card.lookAt(head);
    this.card.visible = true;
  }

  /** Per-frame: move the rig with the player, handle thumbsticks and the teleport marker. */
  update(dt: number) {
    const { player } = this.d;
    const session = this.d.renderer.xr.getSession();
    if (session) {
      for (const src of session.inputSources) {
        const gp = src.gamepad;
        if (!gp || gp.axes.length < 4) continue;
        const x = gp.axes[2];
        const y = gp.axes[3];
        if (src.handedness === 'left' && (Math.abs(x) > 0.15 || Math.abs(y) > 0.15)) {
          // Move relative to where the head is facing.
          const q = new THREE.Quaternion();
          this.d.camera.getWorldQuaternion(q);
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q).setY(0).normalize();
          const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
          const speed = 2.4 * dt;
          player.nudge((fwd.x * -y + right.x * x) * speed, (fwd.z * -y + right.z * x) * speed);
        }
        if (src.handedness === 'right') {
          if (Math.abs(x) > 0.7 && this.snapReady) {
            player.yaw -= Math.sign(x) * (Math.PI / 6);
            this.snapReady = false;
          } else if (Math.abs(x) < 0.3) this.snapReady = true;
        }
      }
    }
    this.dolly.position.set(player.x, 0, player.z);
    this.dolly.rotation.set(0, player.yaw, 0);
    // Teleport preview marker from the right-hand controller.
    const c = this.controllers[1] ?? this.controllers[0];
    const r = c ? this.hit(c) : null;
    if (r && 'floor' in r && this.d.canStand(r.point.x, r.point.z)) {
      this.marker.visible = true;
      this.marker.position.set(r.point.x, 0.02, r.point.z);
    } else this.marker.visible = false;
  }
}
