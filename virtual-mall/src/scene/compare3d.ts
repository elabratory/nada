import * as THREE from 'three';
import { money, storeById, type Product } from '../data/mall';
import { createProductMesh } from './products3d';
import { canvasTexture } from './textures';

/**
 * Holographic comparison stage that materialises in front of the shopper:
 * up to three products side by side on glowing plinths, each with a floating
 * card (price, rating, stock, store) and a badge for the cheapest, best rated
 * and best value. Products can be clicked to open their details.
 */
export class CompareDisplay {
  readonly group = new THREE.Group();
  /** Objects the raycaster should test while the display is visible. */
  pickables: THREE.Object3D[] = [];
  private spinners: THREE.Object3D[] = [];
  private appear = 0;

  show(products: Product[], x: number, z: number, yaw: number) {
    this.hide();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    this.group.position.set(x + fx * 3.2, 0, z + fz * 3.2);
    this.group.rotation.y = yaw;
    const cheapest = [...products].sort((a, b) => a.price - b.price)[0];
    const best = [...products].sort((a, b) => b.rating! - a.rating!)[0];
    const value = [...products].sort((a, b) => b.rating! / b.price - a.rating! / a.price)[0];
    const gap = 1.7;
    products.forEach((p, i) => {
      const ox = (i - (products.length - 1) / 2) * gap;
      const slot = new THREE.Group();
      slot.position.set(ox, 0, 0);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.62, 0.9, 32),
        new THREE.MeshStandardMaterial({ color: '#10131c', roughness: 0.25, metalness: 0.6 }),
      );
      base.position.y = 0.45;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.02, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.9, 2.8) }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.91;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.55, 1.6, 32, 1, true),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.7, 1.1), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.position.y = 1.7;
      const model = createProductMesh(p.shape, p.color, p.accent);
      model.scale.multiplyScalar(1.35);
      model.position.y = 0.95;
      this.spinners.push(model);
      const badges: string[] = [];
      if (p === cheapest) badges.push('CHEAPEST');
      if (p === best) badges.push('BEST RATED');
      if (p === value && p !== cheapest && p !== best) badges.push('BEST VALUE');
      const card = new THREE.Sprite(new THREE.SpriteMaterial({ map: cardTexture(p, badges), depthWrite: false }));
      card.scale.set(1.5, 1.05, 1);
      card.position.y = 2.35;
      const interact = { kind: 'product', id: p.id, label: `${p.name} — ${money(p.price)} · open details` };
      for (const o of [base, model, card]) {
        o.userData.interact = interact;
        this.pickables.push(o);
      }
      slot.add(base, ring, beam, model, card);
      this.group.add(slot);
    });
    const floorGlow = new THREE.Mesh(
      new THREE.RingGeometry(0.2, products.length * gap * 0.62, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.6, 1.0), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = 0.02;
    this.group.add(floorGlow);
    this.group.traverse((o) => (o.castShadow = false));
    this.group.visible = true;
    this.appear = 0;
    this.group.scale.setScalar(0.01);
  }

  hide() {
    this.group.clear();
    this.pickables = [];
    this.spinners = [];
    this.group.visible = false;
  }

  get visible() {
    return this.group.visible;
  }

  update(dt: number, reducedMotion: boolean) {
    if (!this.group.visible) return;
    this.appear = Math.min(1, this.appear + dt * (reducedMotion ? 100 : 2.5));
    const e = 1 - (1 - this.appear) ** 3;
    this.group.scale.setScalar(Math.max(0.01, e));
    if (!reducedMotion) for (const s of this.spinners) s.rotation.y += dt * 0.6;
  }
}

function cardTexture(p: Product, badges: string[]) {
  const s = storeById(p.storeId)!;
  return canvasTexture(512, 360, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(8,12,24,0.88)';
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,210,255,0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillText(p.name.length > 24 ? `${p.name.slice(0, 23)}…` : p.name, 28, 58);
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(`${s.name} · ${p.type}`, 28, 92);
    ctx.fillStyle = '#ffd166';
    ctx.font = '800 56px system-ui, sans-serif';
    ctx.fillText(money(p.price), 28, 160);
    if (p.wasPrice) {
      ctx.fillStyle = '#9fb3c8';
      ctx.font = '600 24px system-ui, sans-serif';
      ctx.fillText(`was ${money(p.wasPrice)}`, 40 + ctx.measureText(money(p.price)).width * 2.3, 158);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(`★ ${p.rating?.toFixed(1)}  (${p.reviews} demo reviews)`, 28, 208);
    ctx.fillStyle = p.availability === 'In stock' ? '#4ade80' : p.availability === 'Low stock' ? '#fbbf24' : '#f87171';
    ctx.fillText(p.availability, 28, 248);
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(p.colors?.length ? `Colour: ${p.colors.join(', ')}` : '', 220, 248);
    let bx = 28;
    for (const b of badges) {
      ctx.font = '800 20px system-ui, sans-serif';
      const bw = ctx.measureText(b).width + 24;
      ctx.fillStyle = b === 'CHEAPEST' ? '#16a34a' : b === 'BEST RATED' ? '#d97706' : '#2563eb';
      ctx.beginPath();
      ctx.roundRect(bx, 280, bw, 40, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(b, bx + 12, 307);
      bx += bw + 10;
    }
  });
}
