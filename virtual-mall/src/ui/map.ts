import { CENTRE, FACILITIES, RESTAURANTS, STORES, type Category, type PlaceRef } from '../data/mall';
import type { P } from '../nav/pathfinding';

const NS = 'http://www.w3.org/2000/svg';

export const CATEGORY_COLORS: Record<Category, string> = {
  Fashion: '#c2410c',
  Technology: '#1d4ed8',
  Food: '#b45309',
  Beauty: '#be185d',
  Sport: '#0f766e',
  Entertainment: '#6d28d9',
};

const FACILITY_GLYPH: Record<string, [string, string]> = {
  restroom: ['WC', '#0f766e'],
  baby: ['♡', '#0f766e'],
  lift: ['⇅', '#1d4ed8'],
  escalator: ['⇵', '#475569'],
  entrance: ['⇄', '#1d4ed8'],
  parking: ['P', '#1d4ed8'],
  info: ['i', '#1d4ed8'],
};

function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text) el.textContent = text;
  return el;
}

export interface MallMap {
  el: SVGSVGElement;
  setPlayer(x: number, z: number, yaw: number): void;
  setRoute(path: P[] | null): void;
}

export function createMap(opts: { onSelect?: (ref: PlaceRef) => void; compact?: boolean; label: string }): MallMap {
  const vb = { x: -54, y: -25, w: 112, h: 53 };
  const svg = s('svg', { viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`, class: `mall-map${opts.compact ? ' compact' : ''}`, role: 'group', 'aria-label': opts.label });
  const interactive = !!opts.onSelect && !opts.compact;

  const place = (el: SVGElement, ref: PlaceRef, label: string) => {
    if (!interactive) return;
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', label);
    el.classList.add('map-hit');
    const go = () => opts.onSelect!(ref);
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        go();
      }
    });
  };

  // Base plan
  svg.append(s('rect', { x: -48, y: -21.3, width: 96, height: 45.6, class: 'm-shell', rx: 0.6 }));
  svg.append(s('rect', { x: -48, y: -7, width: 96, height: 14, class: 'm-floor' }));
  svg.append(s('rect', { x: CENTRE.amenities.x1, y: -12, width: 16, height: 5, class: 'm-floor' }));
  svg.append(s('rect', { x: -4, y: 7, width: 8, height: 13, class: 'm-floor' }));
  const fc = CENTRE.foodCourt;
  const fcRect = s('rect', { x: fc.x1, y: fc.z1, width: fc.x2 - fc.x1, height: fc.z2 - fc.z1, class: 'm-food' });
  svg.append(fcRect);
  if (!opts.compact) svg.append(s('text', { x: 26, y: 14.6, class: 'm-label m-dark', 'text-anchor': 'middle' }, 'FOOD COURT'));
  // Atrium / escalators
  const a = CENTRE.atrium;
  svg.append(s('rect', { x: a.x1, y: a.z1, width: a.x2 - a.x1, height: a.z2 - a.z1, class: 'm-esc', rx: 0.4 }));

  // Parking & outside labels
  svg.append(s('rect', { x: 49.5, y: -12, width: 7.5, height: 24, class: 'm-park', rx: 0.8 }));
  svg.append(s('text', { x: 53.25, y: -1, class: 'm-label m-dark', 'text-anchor': 'middle' }, 'P1–P3'));
  if (!opts.compact) {
    svg.append(s('text', { x: 53.25, y: 1.6, class: 'm-small m-dark', 'text-anchor': 'middle' }, 'Parking'));
    const w = s('text', { x: -51, y: 0, class: 'm-small m-dark', 'text-anchor': 'middle', transform: 'rotate(-90 -51 0)' }, 'Harbour St');
    svg.append(w);
    svg.append(s('text', { x: 0, y: 24.2, class: 'm-small m-dark', 'text-anchor': 'middle' }, 'Bus interchange'));
  }

  for (const st of STORES) {
    const r = st.rect;
    const g = s('g', {});
    const color = CATEGORY_COLORS[st.categories[0]];
    g.append(s('rect', { x: r.x1 + 0.3, y: r.z1 + 0.3, width: r.x2 - r.x1 - 0.6, height: r.z2 - r.z1 - 0.6, fill: color, class: 'm-store', rx: 0.5 }));
    const cy = (r.z1 + r.z2) / 2;
    g.append(s('text', { x: (r.x1 + r.x2) / 2, y: cy, class: 'm-label', 'text-anchor': 'middle' }, st.name));
    if (!opts.compact) g.append(s('text', { x: (r.x1 + r.x2) / 2, y: cy + 2.2, class: 'm-small', 'text-anchor': 'middle' }, `${st.unit} · ${st.categories[0]}`));
    // doorway notch
    const dz = st.side === 'north' ? r.z2 - 0.5 : r.z1 - 0.1;
    g.append(s('rect', { x: st.doorX - 2.5, y: dz, width: 5, height: 0.6, class: 'm-door' }));
    place(g, { kind: 'store', id: st.id }, `${st.name}, ${st.categories.join(' and ')}, unit ${st.unit}. Get directions.`);
    svg.append(g);
  }

  for (const r of RESTAURANTS) {
    const g = s('g', {});
    g.append(s('rect', { x: r.x - 3.8, y: 20.6, width: 7.6, height: 3.2, fill: CATEGORY_COLORS.Food, class: 'm-store', rx: 0.4 }));
    g.append(s('text', { x: r.x, y: 22.6, class: 'm-small m-tiny', 'text-anchor': 'middle' }, r.name));
    place(g, { kind: 'restaurant', id: r.id }, `${r.name}, ${r.cuisine}, food court. Get directions.`);
    svg.append(g);
  }

  for (const f of FACILITIES) {
    const [glyph, color] = FACILITY_GLYPH[f.kind];
    const g = s('g', { class: 'm-fac' });
    const x = f.kind === 'entrance' || f.kind === 'parking' ? f.x - Math.sign(f.x) * 1.6 : f.x;
    const z = f.kind === 'entrance' && f.z > 0 ? f.z - 1.6 : f.kind === 'escalator' ? 0 : f.z;
    g.append(s('circle', { cx: x, cy: z, r: opts.compact ? 1.6 : 1.4, fill: color }));
    g.append(s('text', { x, y: z + 0.05, class: 'm-glyph', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, glyph));
    place(g, { kind: 'facility', id: f.id }, `${f.name}. Get directions.`);
    svg.append(g);
  }

  const route = s('polyline', { class: 'm-route', points: '' });
  svg.append(route);
  const routeEnd = s('circle', { class: 'm-route-end', r: 1.1, cx: -999, cy: -999 });
  svg.append(routeEnd);

  const player = s('g', { class: 'm-player' });
  player.append(s('path', { d: 'M0 0 L-4 -7 A8 8 0 0 1 4 -7 Z', class: 'm-cone' }));
  player.append(s('circle', { r: opts.compact ? 1.5 : 1.2, class: 'm-dot' }));
  player.append(s('path', { d: 'M0 -2.2 L1.2 0.6 L0 0 L-1.2 0.6 Z', class: 'm-arrow' }));
  const youLabel = s('text', { class: 'm-you', 'text-anchor': 'middle', y: 3.6 }, 'You');
  if (!opts.compact) player.append(youLabel);
  svg.append(player);

  return {
    el: svg,
    setPlayer(x, z, yaw) {
      player.setAttribute('transform', `translate(${x.toFixed(2)} ${z.toFixed(2)})`);
      const deg = (-yaw * 180) / Math.PI;
      (player.children[0] as SVGElement).setAttribute('transform', `rotate(${deg.toFixed(1)})`);
      (player.children[2] as SVGElement).setAttribute('transform', `rotate(${deg.toFixed(1)})`);
    },
    setRoute(path) {
      if (!path) {
        route.setAttribute('points', '');
        routeEnd.setAttribute('cx', '-999');
        return;
      }
      route.setAttribute('points', path.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(' '));
      const end = path[path.length - 1];
      routeEnd.setAttribute('cx', String(end.x));
      routeEnd.setAttribute('cy', String(end.z));
    },
  };
}
