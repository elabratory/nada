import * as THREE from 'three';
import { productById } from '../data/mall';
import type { MallEvent } from '../data/events';
import { createProductMesh, mat } from './products3d';
import { canvasTexture } from './textures';

/**
 * Temporary event set-pieces. Only the active event's group exists in the
 * scene; switching events disposes the old one. Everything is decorative
 * (no colliders) and sits on the concourse centre line between furniture.
 */
export class EventStage {
  readonly group = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  private animated: ((t: number, dt: number) => void)[] = [];
  private current: string | null = null;

  set(e: MallEvent | null) {
    if ((e?.id ?? null) === this.current) return;
    this.current = e?.id ?? null;
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.group.clear();
    this.pickables = [];
    this.animated = [];
    if (!e) return;
    const g = new THREE.Group();
    g.position.set(e.x, 0, e.z);
    this.group.add(g);
    const tagAll = (o: THREE.Object3D) => {
      o.userData.interact = { kind: 'event', id: e.id, label: `${e.name} — ${e.tagline}` };
      this.pickables.push(o);
    };
    switch (e.kind) {
      case 'sneaker-launch':
        this.sneakerLaunch(g, e, tagAll);
        break;
      case 'gaming':
        this.gaming(g, e, tagAll);
        break;
      case 'fashion':
        this.fashion(g, e, tagAll);
        break;
      case 'food-festival':
        this.foodFestival(g, e, tagAll);
        break;
      case 'christmas':
        this.christmas(g, e, tagAll);
        break;
    }
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = true;
      }
    });
  }

  update(t: number, dt: number, reducedMotion: boolean) {
    if (reducedMotion) return;
    for (const f of this.animated) f(t, dt);
  }

  // ------------------------------------------------------------------ set-pieces
  /** Double-sided banner that reads correctly from both sides. */
  private banner(text: string, sub: string, colors: [string, string], w = 5, h = 1) {
    const front = this.bannerFace(text, sub, colors, w, h);
    const back = front.clone();
    back.rotation.y = Math.PI;
    const g = new THREE.Group();
    g.add(front, back);
    return g;
  }

  private bannerFace(text: string, sub: string, colors: [string, string], w: number, h: number) {
    return new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.3, 1.3, 1.3),
        map: canvasTexture(1024, 205, (ctx, cw, ch) => {
          const gr = ctx.createLinearGradient(0, 0, cw, 0);
          gr.addColorStop(0, colors[0]);
          gr.addColorStop(1, shade(colors[0], -40));
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, cw, ch);
          ctx.fillStyle = colors[1];
          ctx.textAlign = 'center';
          ctx.font = '900 84px system-ui, sans-serif';
          ctx.fillText(text.toUpperCase(), cw / 2, 108);
          ctx.font = '700 34px system-ui, sans-serif';
          ctx.globalAlpha = 0.85;
          ctx.fillText(sub, cw / 2, 172);
        }),
      }),
    );
  }

  private spotlight(color: THREE.ColorRepresentation, h = 7, r = 1.1) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    cone.position.y = h / 2;
    return cone;
  }

  private sneakerLaunch(g: THREE.Group, e: MallEvent, tag: (o: THREE.Object3D) => void) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 0.35, 48), mat('#111318', 0.25, 0.5));
    base.position.y = 0.17;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.5) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.36;
    const p = productById(e.productIds[0])!;
    const hero = createProductMesh(p.shape, p.color, p.accent);
    hero.scale.setScalar(3.2);
    hero.position.y = 0.9;
    const holder = new THREE.Group();
    holder.add(hero);
    const banner = this.banner('Launch day', `${p.name} · available now at Sneaker Vault`, e.colors, 5.2, 1.04);
    banner.position.set(0, 4.3, 0);
    banner.rotation.y = Math.PI / 2;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.8, 8), mat('#1b1b1f', 0.4, 0.6));
      post.position.set(0, 2.4, s * 2.7);
      g.add(post);
    }
    const beam = this.spotlight(new THREE.Color(1.2, 0.3, 0.35), 7.5, 1.3);
    // Queue barriers
    for (let i = 0; i < 5; i++) {
      const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8), mat('#c9ced6', 0.2, 0.9));
      stanchion.position.set(-2.2 + i * 1.1, 0.47, 2.4);
      g.add(stanchion);
      if (i < 4) {
        const rope = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.05), mat('#b91c1c', 0.6));
        rope.position.set(-1.65 + i * 1.1, 0.88, 2.4);
        g.add(rope);
      }
    }
    g.add(base, ring, holder, banner, beam);
    tag(base);
    tag(hero);
    tag(banner);
    this.animated.push((t, dt) => {
      holder.rotation.y += dt * 0.6;
      hero.position.y = 0.9 + Math.sin(t * 1.5) * 0.08;
    });
  }

  private gaming(g: THREE.Group, e: MallEvent, tag: (o: THREE.Object3D) => void) {
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 512;
    screenCanvas.height = 288;
    const sctx = screenCanvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(screenCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.0), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5), side: THREE.DoubleSide }));
    screen.position.set(0, 3.2, 0);
    screen.rotation.y = Math.PI / 2;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 3.8), mat('#0b0b10', 0.3));
    frame.position.set(0, 3.2, 0);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.1, 0.3), mat('#0b0b10', 0.3));
    stand.position.set(0, 1.05, 0);
    g.add(frame, screen, stand);
    const banner = this.banner('Game on', 'Free play · tournament finals tonight', e.colors, 3.6, 0.72);
    banner.position.set(0, 4.7, 0);
    banner.rotation.y = Math.PI / 2;
    g.add(banner);
    const neon = [new THREE.Color(1.8, 0.2, 3), new THREE.Color(0, 2.6, 2.1)];
    for (const [x, z, i] of [
      [-1.2, -1.6, 0],
      [1.2, -1.6, 1],
      [-1.2, 1.6, 1],
      [1.2, 1.6, 0],
    ] as const) {
      const pod = new THREE.Group();
      pod.position.set(x, 0, z);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), mat('#15151c', 0.5));
      seat.position.y = 0.25;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.12), mat('#15151c', 0.5));
      back.position.set(0, 0.75, x < 0 ? -0.25 : 0.25);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.58), new THREE.MeshBasicMaterial({ color: neon[i] }));
      glow.position.y = 0.02;
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.04), new THREE.MeshBasicMaterial({ color: neon[1 - i].clone().multiplyScalar(0.5) }));
      mon.position.set(0, 1.0, x < 0 ? 0.55 : -0.55);
      pod.add(seat, back, glow, mon);
      g.add(pod);
    }
    const console = createProductMesh('console', '#f8f9fa');
    console.scale.setScalar(1.6);
    console.position.set(0, 2.1, 0);
    g.add(console);
    tag(screen);
    tag(banner);
    tag(console);
    let acc = 0;
    let frameN = 0;
    this.animated.push((t, dt) => {
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      frameN++;
      // Simple synthwave "gameplay" loop.
      const w = 512;
      const h = 288;
      const gr = sctx.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#12002b');
      gr.addColorStop(0.55, '#5a189a');
      gr.addColorStop(0.56, '#10002b');
      gr.addColorStop(1, '#240046');
      sctx.fillStyle = gr;
      sctx.fillRect(0, 0, w, h);
      sctx.fillStyle = '#ff9e00';
      sctx.beginPath();
      sctx.arc(w / 2, h * 0.55, 60, Math.PI, 0);
      sctx.fill();
      sctx.strokeStyle = '#00f5d4';
      sctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const y = h * 0.56 + ((i * 14 + frameN * 3) % 130);
        sctx.beginPath();
        sctx.moveTo(0, y);
        sctx.lineTo(w, y);
        sctx.stroke();
      }
      for (let i = -8; i <= 8; i++) {
        sctx.beginPath();
        sctx.moveTo(w / 2 + i * 12, h * 0.56);
        sctx.lineTo(w / 2 + i * 70, h);
        sctx.stroke();
      }
      const carX = w / 2 + Math.sin(t * 1.3) * 90;
      sctx.fillStyle = '#f72585';
      sctx.fillRect(carX - 30, h - 60, 60, 26);
      sctx.fillStyle = '#fff';
      sctx.font = '800 22px system-ui, sans-serif';
      sctx.fillText(`TOURNAMENT · ROUND ${1 + (Math.floor(t / 20) % 4)}`, 16, 32);
      sctx.fillText(`SCORE ${String(Math.floor(t * 137) % 100000).padStart(5, '0')}`, w - 170, 32);
      tex.needsUpdate = true;
    });
  }

  private fashion(g: THREE.Group, e: MallEvent, tag: (o: THREE.Object3D) => void) {
    const runway = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 1.8), mat('#fafafa', 0.15));
    runway.position.y = 0.15;
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 2.4) });
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(6, 0.04, 0.04), strip);
      l.position.set(0, 0.31, s * 0.88);
      g.add(l);
    }
    g.add(runway);
    tag(runway);
    const models: THREE.Group[] = [];
    e.productIds.slice(0, 3).forEach((id, i) => {
      const p = productById(id)!;
      const m = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.9, 4, 10), mat('#e8e8e8', 0.3));
      body.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), mat('#e8e8e8', 0.3));
      head.position.y = 1.72;
      const outfit = createProductMesh(p.shape, p.color, p.accent);
      outfit.scale.setScalar(1.25);
      outfit.position.set(0, 0.8, 0.13);
      m.add(body, head, outfit);
      m.position.set(-2 + i * 2, 0.3, 0);
      m.rotation.y = Math.PI / 2;
      g.add(m);
      models.push(m);
      tag(m);
    });
    const arch = this.banner('Style walk', 'New season looks · stylists on hand at Thread & Co', e.colors, 4.6, 0.92);
    arch.position.set(0, 4.2, 0);
    arch.rotation.y = Math.PI / 2;
    g.add(arch);
    for (const s of [-2.6, 2.6]) g.add(Object.assign(this.spotlight(new THREE.Color(0.9, 0.85, 0.8), 7, 0.8), { position: new THREE.Vector3(s, 3.5, 0) }));
    this.animated.push((t) => {
      models.forEach((m, i) => {
        m.position.x = -2.4 + ((t * 0.4 + i * 1.6) % 4.8);
        m.position.y = 0.3 + Math.abs(Math.sin(t * 3 + i)) * 0.02;
      });
    });
  }

  private foodFestival(g: THREE.Group, e: MallEvent, tag: (o: THREE.Object3D) => void) {
    // Bunting strung across the food court.
    const cols = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#457b9d'];
    for (let row = 0; row < 3; row++) {
      const z = -2 + row * 5;
      for (let i = 0; i < 26; i++) {
        const flag = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 3), new THREE.MeshBasicMaterial({ color: cols[i % cols.length] }));
        const x = -16 + i * 1.3;
        flag.position.set(x, 6.2 - Math.sin((i / 25) * Math.PI) * 0.8, z);
        flag.rotation.x = Math.PI;
        g.add(flag);
      }
    }
    // Pop-up stalls with striped awnings.
    const awning = new THREE.MeshStandardMaterial({
      map: canvasTexture(64, 64, (ctx) => {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? '#ffffff' : e.colors[0];
          ctx.fillRect(i * 8, 0, 8, 64);
        }
      }),
      roughness: 0.8,
    });
    for (const x of [-12, 12]) {
      const stall = new THREE.Group();
      stall.position.set(x, 0, -1.5);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 1), mat('#8d6e63', 0.7));
      counter.position.y = 0.5;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 1.6), awning);
      roof.position.set(0, 2.5, 0);
      roof.rotation.x = -0.2;
      for (const px of [-1.2, 1.2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6), mat('#5d4037', 0.8));
        post.position.set(px, 1.25, -0.4);
        stall.add(post);
      }
      stall.add(counter, roof);
      g.add(stall);
      tag(counter);
    }
    const banner = this.banner('Food festival', 'Tasting plates · live music · Sunday', e.colors, 5, 1);
    banner.position.set(0, 5.2, -3.3);
    banner.rotation.y = Math.PI;
    g.add(banner);
    tag(banner);
    // Festoon lights
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 2.6, 1.2) });
    for (let i = 0; i < 40; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), bulbMat);
      b.position.set(-16 + i * 0.85, 6.7 - Math.sin((i / 39) * Math.PI) * 1.2, 2.5);
      g.add(b);
    }
  }

  private christmas(g: THREE.Group, e: MallEvent, tag: (o: THREE.Object3D) => void) {
    const tree = new THREE.Group();
    const green = mat('#1b4332', 0.8);
    for (let i = 0; i < 5; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7 - i * 0.3, 1.6, 20), green);
      cone.position.y = 1.0 + i * 0.95;
      tree.add(cone);
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.6, 10), mat('#5b4636', 0.9));
    trunk.position.y = 0.3;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 0.8) }));
    star.position.y = 5.9;
    tree.add(trunk, star);
    const baubles: THREE.Mesh[] = [];
    const bCols = [new THREE.Color(3, 0.4, 0.4), new THREE.Color(3.2, 2.6, 0.6), new THREE.Color(0.6, 1.5, 3), new THREE.Color(2.8, 2.8, 2.8)];
    for (let i = 0; i < 60; i++) {
      const h = 0.7 + (i / 60) * 4.6;
      const r = 1.7 * (1 - (h - 0.4) / 5.4) + 0.05;
      const a = i * 2.4;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: bCols[i % 4].clone() }));
      b.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
      tree.add(b);
      baubles.push(b);
    }
    g.add(tree);
    tag(tree);
    // Market huts either side of the tree.
    const roofMat = mat('#9d0208', 0.7);
    const woodMat = mat('#a47148', 0.8);
    for (const [x, z] of [
      [-12, 0],
      [-8, 0],
    ]) {
      const hut = new THREE.Group();
      hut.position.set(x, 0, z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.9, 1.6), woodMat);
      body.position.y = 0.95;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 4), roofMat);
      roof.position.y = 2.35;
      roof.rotation.y = Math.PI / 4;
      const snow = new THREE.Mesh(new THREE.ConeGeometry(1.62, 0.25, 4), mat('#ffffff', 0.9));
      snow.position.y = 2.72;
      snow.rotation.y = Math.PI / 4;
      hut.add(body, roof, snow);
      g.add(hut);
      tag(body);
    }
    const banner = this.banner('Christmas market', 'Gifts · wrapping · every day in December', e.colors, 5, 1);
    banner.position.set(0, 6.9, 0);
    banner.rotation.y = Math.PI / 2;
    g.add(banner);
    this.animated.push((t) => {
      star.rotation.y = t;
      baubles.forEach((b, i) => {
        const on = Math.sin(t * 2 + i * 0.7) > -0.3;
        (b.material as THREE.MeshBasicMaterial).color.copy(bCols[i % 4]).multiplyScalar(on ? 1 : 0.25);
      });
    });
  }
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
