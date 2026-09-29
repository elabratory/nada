import type * as THREE from 'three';
import type { Rect } from '../data/mall';
import type { P } from '../nav/pathfinding';

const EYE = 1.65;
const RADIUS = 0.35;

export interface PlayerOptions {
  canvas: HTMLCanvasElement;
  joystick: HTMLElement;
  colliders: Rect[];
  /** Tap/click (without dragging) at a screen position. */
  onTap(x: number, y: number): void;
  onHover(x: number, y: number): void;
  onInteractKey(): void;
  /** Movement keys are ignored while this returns true (e.g. a dialog is open). */
  isBlocked(): boolean;
  isActive(): boolean;
  onUserMove(): void;
}

export class Player {
  x = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  invertLook = false;
  private vx = 0;
  private vz = 0;
  private stride = 0;
  private keys = new Set<string>();
  private joy = { x: 0, y: 0 };
  private path: P[] | null = null;
  private pathIdx = 0;
  private pathDone: (() => void) | null = null;
  moving = false;

  constructor(private o: PlayerOptions) {
    this.bindKeys();
    this.bindPointer();
    this.bindJoystick();
  }

  place(x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.pitch = 0;
    this.vx = this.vz = 0;
  }

  followPath(path: P[], onDone: () => void) {
    this.path = path;
    this.pathIdx = 1;
    this.pathDone = onDone;
  }

  cancelPath() {
    this.path = null;
    this.pathDone = null;
  }

  get following() {
    return !!this.path;
  }

  // ---------- input ----------
  private bindKeys() {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    window.addEventListener('keydown', (e) => {
      if (!this.o.isActive() || typing(e) || this.o.isBlocked() || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const movement = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Shift'];
      if (movement.includes(k)) {
        this.keys.add(k);
        if (k.startsWith('Arrow') || k.startsWith('Page')) e.preventDefault();
      }
      const onCanvasOrBody = e.target === document.body || e.target === this.o.canvas;
      if (k === 'e' || (k === 'Enter' && onCanvasOrBody)) {
        e.preventDefault();
        this.o.onInteractKey();
      }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  releaseKeys() {
    this.keys.clear();
  }

  private bindPointer() {
    const c = this.o.canvas;
    const active = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean }>();
    c.addEventListener('pointerdown', (e) => {
      if (!this.o.isActive()) return;
      c.setPointerCapture(e.pointerId);
      active.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.o.isActive()) return;
      const p = active.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') this.o.onHover(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) p.moved = true;
      if (!p.moved) return;
      // "Grab the view" style, like a street-level panorama viewer.
      const s = 0.0032 * this.sensitivity * (e.pointerType === 'touch' ? 1.3 : 1);
      this.yaw += dx * s;
      this.pitch += dy * s * (this.invertLook ? -1 : 1);
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
    });
    const end = (e: PointerEvent) => {
      const p = active.get(e.pointerId);
      active.delete(e.pointerId);
      if (!p || !this.o.isActive()) return;
      if (!p.moved && performance.now() - p.t < 600) this.o.onTap(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', (e) => active.delete(e.pointerId));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private bindJoystick() {
    const j = this.o.joystick;
    const knob = j.querySelector<HTMLElement>('.knob')!;
    let id: number | null = null;
    const set = (e: PointerEvent) => {
      const r = j.getBoundingClientRect();
      const max = r.width / 2;
      let dx = e.clientX - (r.left + max);
      let dy = e.clientY - (r.top + max);
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.x = dx / max;
      this.joy.y = dy / max;
    };
    j.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      j.setPointerCapture(e.pointerId);
      set(e);
      e.preventDefault();
    });
    j.addEventListener('pointermove', (e) => e.pointerId === id && set(e));
    const reset = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      this.joy.x = this.joy.y = 0;
      knob.style.transform = '';
    };
    j.addEventListener('pointerup', reset);
    j.addEventListener('pointercancel', reset);
  }

  // ---------- simulation ----------
  update(dt: number, camera: THREE.PerspectiveCamera, reducedMotion: boolean) {
    const k = this.keys;
    let fwd = 0;
    let side = 0;
    if (k.has('w') || k.has('ArrowUp')) fwd += 1;
    if (k.has('s') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('d')) side += 1;
    if (k.has('a')) side -= 1;
    if (k.has('ArrowLeft')) this.yaw += 1.9 * dt;
    if (k.has('ArrowRight')) this.yaw -= 1.9 * dt;
    if (k.has('PageUp')) this.pitch = Math.min(1.2, this.pitch + 1.2 * dt);
    if (k.has('PageDown')) this.pitch = Math.max(-1.2, this.pitch - 1.2 * dt);
    if (Math.abs(this.joy.x) > 0.12 || Math.abs(this.joy.y) > 0.12) {
      fwd += -this.joy.y;
      side += this.joy.x;
    }
    const mag = Math.min(1, Math.hypot(fwd, side));
    const userInput = mag > 0.01;
    if (userInput && this.path) {
      this.cancelPath();
      this.o.onUserMove();
    }

    let tx = 0;
    let tz = 0;
    if (this.path) {
      const target = this.path[this.pathIdx];
      const dx = target.x - this.x;
      const dz = target.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        this.pathIdx++;
        if (this.pathIdx >= this.path.length) {
          const done = this.pathDone;
          this.cancelPath();
          done?.();
        }
      } else {
        const speed = 3.4;
        tx = (dx / d) * speed;
        tz = (dz / d) * speed;
        const want = Math.atan2(-dx, -dz);
        let delta = want - this.yaw;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        this.yaw += delta * Math.min(1, dt * 4);
        this.pitch *= 1 - Math.min(1, dt * 3);
      }
    } else if (userInput) {
      const speed = k.has('Shift') ? 6.5 : 3.6;
      const n = Math.hypot(fwd, side) || 1;
      const f = (fwd / n) * mag * speed;
      const s = (side / n) * mag * speed;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // forward = (-sin, -cos), right = (cos, -sin)
      tx = -sin * f + cos * s;
      tz = -cos * f - sin * s;
    }
    const a = Math.min(1, dt * (this.path ? 6 : 10));
    this.vx += (tx - this.vx) * a;
    this.vz += (tz - this.vz) * a;

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.collide();

    const speedNow = Math.hypot(this.vx, this.vz);
    this.moving = speedNow > 0.2;
    this.stride += speedNow * dt;
    const bob = reducedMotion ? 0 : Math.sin(this.stride * 2.4) * 0.035 * Math.min(1, speedNow / 3);
    camera.position.set(this.x, EYE + bob, this.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private collide() {
    for (let iter = 0; iter < 3; iter++) {
      for (const r of this.o.colliders) {
        const cx = Math.max(r.x1, Math.min(this.x, r.x2));
        const cz = Math.max(r.z1, Math.min(this.z, r.z2));
        const dx = this.x - cx;
        const dz = this.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          this.x = cx + (dx / d) * RADIUS;
          this.z = cz + (dz / d) * RADIUS;
        } else {
          // Centre is inside the box: push out along the shallowest axis.
          const pushes = [
            [r.x1 - RADIUS - this.x, 0],
            [r.x2 + RADIUS - this.x, 0],
            [0, r.z1 - RADIUS - this.z],
            [0, r.z2 + RADIUS - this.z],
          ].sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]));
          this.x += pushes[0][0];
          this.z += pushes[0][1];
        }
      }
    }
  }
}
