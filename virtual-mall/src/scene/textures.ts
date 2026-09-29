import * as THREE from 'three';

/**
 * All signage, screens and floor patterns are drawn on canvases at runtime,
 * so the prototype ships with zero image assets and no third-party logos.
 */

const FONT = `"Inter", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif`;

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 800) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${FONT}`;
    s -= 2;
  } while (ctx.measureText(text).width > maxW && s > 10);
  return s + 2;
}

/** Storefront fascia sign: store name in brand colours, no logos. */
export function signTexture(name: string, bg: string, fg: string, sub?: string) {
  return canvasTexture(1024, 160, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, name.toUpperCase(), w - 120, sub ? 76 : 88);
    ctx.fillText(name.toUpperCase(), w / 2, sub ? h * 0.42 : h / 2);
    if (sub) {
      ctx.globalAlpha = 0.75;
      ctx.font = `600 26px ${FONT}`;
      ctx.fillText(sub, w / 2, h * 0.8);
      ctx.globalAlpha = 1;
    }
  });
}

/** Simple wayfinding sign (dark panel with icon glyph + text). */
export function wayfindingTexture(glyph: string, text: string, color = '#2563eb') {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1f2430';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(12, 12, h - 24, h - 24);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${glyph.length > 2 ? 34 : 56}px ${FONT}`;
    ctx.fillText(glyph, h / 2, h / 2 + 2);
    ctx.textAlign = 'left';
    fitText(ctx, text, w - h - 20, 40, 700);
    ctx.fillText(text, h + 4, h / 2 + 2);
  });
}

export function priceTagTexture(name: string, price: string, highlight: boolean) {
  return canvasTexture(512, 192, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    roundRect(ctx, 6, 6, w - 12, h - 12, 28);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, name, w - 60, 44, 700);
    ctx.fillText(name, w / 2, 66);
    ctx.fillStyle = highlight ? '#d6336c' : '#111';
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText(price, w / 2, 136);
  });
}

export function floorTexture() {
  const tex = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#e8e3da';
    ctx.fillRect(0, 0, w, h);
    const n = 4;
    const s = w / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = 226 + ((i * 7 + j * 13) % 5) * 3;
        ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      }
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo(i * s, h);
      ctx.moveTo(0, i * s);
      ctx.lineTo(w, i * s);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function woodTexture(base = '#b08968') {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + (i % 3) * 0.02})`;
      ctx.fillRect(0, i * 32, w, 30);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, i * 32 + 30, w, 2);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function stepsTexture() {
  const tex = canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a3d44';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = '#8a8f99';
      ctx.fillRect(0, i * 16, w, 2);
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(0, i * 16 + 14, w, 2);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function skyTexture() {
  return canvasTexture(16, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8ec5ff');
    g.addColorStop(0.55, '#dff1ff');
    g.addColorStop(0.56, '#9aa5ad');
    g.addColorStop(1, '#6e767c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Directory kiosk screen with a tiny "you are here" style map. */
export function kioskTexture(title: string, lines: string[], accent = '#4f7cff') {
  return canvasTexture(384, 640, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0f172a');
    g.addColorStop(1, '#1e293b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 90);
    ctx.fillStyle = '#fff';
    ctx.font = `800 34px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 24, 46);
    ctx.font = `600 24px ${FONT}`;
    lines.forEach((l, i) => {
      ctx.fillStyle = i % 2 ? '#cbd5e1' : '#ffffff';
      ctx.fillText(l, 24, 140 + i * 44);
    });
    ctx.fillStyle = '#fbbf24';
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText('Tap / click for the map', 24, h - 40);
  });
}

export interface AdSlide {
  title: string;
  sub: string;
  from: string;
  to: string;
}

/** Digital advertising screen that can redraw itself with the next slide. */
export class AdScreen {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private i = 0;
  constructor(private slides: AdSlide[], start = 0) {
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 640;
    this.ctx = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.i = start % slides.length;
    this.draw();
  }
  next() {
    this.i = (this.i + 1) % this.slides.length;
    this.draw();
  }
  private draw() {
    const { ctx } = this;
    const { width: w, height: h } = ctx.canvas;
    const s = this.slides[this.i];
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, s.from);
    g.addColorStop(1, s.to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.25, 160, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText('DEMO PROMOTION', 28, 32);
    wrap(ctx, s.title, 28, 250, w - 56, 50, `800 44px ${FONT}`);
    ctx.globalAlpha = 0.9;
    wrap(ctx, s.sub, 28, 470, w - 56, 32, `600 24px ${FONT}`);
    ctx.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, font: string) {
  ctx.font = font;
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lh;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
