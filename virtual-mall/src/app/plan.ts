import {
  RESTAURANTS,
  money,
  openStatus,
  productById,
  restaurantById,
  storeById,
  storeInside,
  facilityById,
} from '../data/mall';
import type { P } from '../nav/pathfinding';
import { button, h, toast } from '../ui/dom';

/**
 * "Shop before you go": turns a shopping list into a timed itinerary for a
 * real visit — entrance, stores in the best order, optional food and
 * facility stops, and the time you'll be back at the exit.
 */

export interface PlanOptions {
  day: number; // 0 = Sunday
  start: number; // hour, e.g. 10.5 = 10:30
  arrival: 'car' | 'bus' | 'walk';
  productIds: string[];
  food: string | null; // restaurant id
  restroom: boolean;
  parentsRoom: boolean;
}

export interface PlanStep {
  time: string;
  title: string;
  detail: string;
  warn?: string;
  kind: 'enter' | 'store' | 'food' | 'facility' | 'exit';
}

export interface Itinerary {
  steps: PlanStep[];
  totalMinutes: number;
  walkMetres: number;
  total: number;
  finish: string;
  opts: PlanOptions;
}

const ENTRANCE_FOR = { car: 'east-entrance', bus: 'south-entrance', walk: 'west-entrance' } as const;
const WALK_SPEED = 1.2;

const fmt = (hours: number) => {
  const h = Math.floor(hours) % 24;
  const m = Math.round((hours - Math.floor(hours)) * 60);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m === 60 ? 0 : m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export function buildItinerary(o: PlanOptions, pathLen: (a: P, b: P) => number): Itinerary {
  const entrance = facilityById(ENTRANCE_FOR[o.arrival])!;
  const startPt = entrance.approach ?? { x: entrance.x, z: entrance.z };
  const products = o.productIds.map((id) => productById(id)!).filter(Boolean);
  const storeIds = [...new Set(products.map((p) => p.storeId))];
  interface Stop {
    kind: PlanStep['kind'];
    id: string;
    pt: P;
    minutes: number;
  }
  const stops: Stop[] = storeIds.map((id) => ({
    kind: 'store',
    id,
    pt: storeInside(storeById(id)!),
    minutes: 6 + products.filter((p) => p.storeId === id).length * 3,
  }));
  if (o.food) {
    const r = restaurantById(o.food)!;
    stops.push({ kind: 'food', id: r.id, pt: { x: r.x, z: r.z - 3.5 }, minutes: 30 });
  }
  if (o.restroom) stops.push({ kind: 'facility', id: 'restrooms', pt: facilityById('restrooms')!.approach!, minutes: 5 });
  if (o.parentsRoom) stops.push({ kind: 'facility', id: 'parents-room', pt: facilityById('parents-room')!.approach!, minutes: 15 });

  // Exact best order (start and finish at the chosen entrance).
  const n = stops.length;
  const d0 = stops.map((s) => pathLen(startPt, s.pt));
  const dm = stops.map((a) => stops.map((b) => (a === b ? 0 : pathLen(a.pt, b.pt))));
  let bestOrder = [...Array(n).keys()];
  let best = Infinity;
  const perm = (arr: number[], k: number) => {
    if (k === arr.length) {
      let m = n ? d0[arr[0]] + d0[arr[n - 1]] : 0;
      for (let i = 1; i < n; i++) m += dm[arr[i - 1]][arr[i]];
      // Prefer eating after the first hour of shopping rather than first thing.
      const foodIdx = arr.findIndex((i) => stops[i].kind === 'food');
      if (foodIdx === 0 && n > 2) m += 60;
      if (m < best) {
        best = m;
        bestOrder = [...arr];
      }
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      perm(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  if (n && n <= 9) perm([...Array(n).keys()], 0);
  const date = new Date();
  date.setDate(date.getDate() + ((o.day - date.getDay() + 7) % 7));
  const at = (hours: number) => {
    const d = new Date(date);
    d.setHours(Math.floor(hours), Math.round((hours % 1) * 60), 0, 0);
    return d;
  };

  let t = o.start;
  let walk = 0;
  const steps: PlanStep[] = [];
  const park = o.arrival === 'car' ? ' Park on P1 (first 2 hours free, demo) and take the East Entrance.' : o.arrival === 'bus' ? ' The bus interchange is outside the South Entrance.' : '';
  steps.push({ time: fmt(t), title: `Arrive: ${entrance.name}`, detail: `Enter the centre.${park}`, kind: 'enter' });
  let prev = startPt;
  for (const idx of bestOrder) {
    const s = stops[idx];
    const metres = pathLen(prev, s.pt);
    walk += metres;
    t += metres / WALK_SPEED / 3600 + 1 / 60;
    let title = '';
    let detail = '';
    let warn: string | undefined;
    if (s.kind === 'store') {
      const st = storeById(s.id)!;
      const items = products.filter((p) => p.storeId === s.id);
      title = st.name;
      detail = items.map((p) => `${p.name} (${money(p.price)})`).join(', ');
      if (!openStatus(st.hours, at(t)).open) warn = `${st.name} is closed at this time (${openStatus(st.hours, at(t)).text}).`;
    } else if (s.kind === 'food') {
      const r = restaurantById(s.id)!;
      title = `Food break: ${r.name}`;
      detail = `Popular: ${r.menu.flatMap((m) => m.items).filter((i) => i.popular).map((i) => i.name).slice(0, 2).join(', ')}`;
      if (!openStatus(r.hours, at(t)).open) warn = `${r.name} is closed at this time.`;
    } else {
      const f = facilityById(s.id)!;
      title = f.name;
      detail = f.description.split('.')[0] + '.';
    }
    steps.push({ time: fmt(t), title, detail, warn, kind: s.kind });
    t += s.minutes / 60;
    prev = s.pt;
  }
  const back = n ? pathLen(prev, startPt) : 0;
  walk += back;
  t += back / WALK_SPEED / 3600 + 1 / 60;
  steps.push({ time: fmt(t), title: `Leave: ${entrance.name}`, detail: `${Math.round(walk)} m of walking in total.`, kind: 'exit' });
  return {
    steps,
    totalMinutes: Math.round((t - o.start) * 60),
    walkMetres: Math.round(walk),
    total: products.reduce((s, p) => s + p.price, 0),
    finish: fmt(t),
    opts: o,
  };
}

export function itineraryText(it: Itinerary) {
  const lines = ['Your Shopping Plan — Harbour Central (demo)', ''];
  for (const s of it.steps) lines.push(`${s.time} — ${s.title}${s.detail ? `: ${s.detail}` : ''}${s.warn ? ` [!] ${s.warn}` : ''}`);
  lines.push('', `Trip time: about ${it.totalMinutes} minutes · Estimated spend: ${money(it.total)}`);
  return lines.join('\n');
}

const KEY = 'vm-plan-v1';
export function savePlan(it: Itinerary) {
  try {
    localStorage.setItem(KEY, JSON.stringify(it));
    return true;
  } catch {
    return false;
  }
}
export function loadPlan(): Itinerary | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** The planner panel body. */
export function planView(o: {
  productIds: string[];
  pathLen: (a: P, b: P) => number;
  onStart: (it: Itinerary) => void;
  onAddItems: () => void;
}) {
  const saved = loadPlan();
  const now = new Date();
  const opts: PlanOptions = saved?.opts
    ? { ...saved.opts, productIds: o.productIds.length ? o.productIds : saved.opts.productIds }
    : { day: (now.getDay() + 1) % 7, start: 10, arrival: 'car', productIds: o.productIds, food: 'coffee-lab', restroom: false, parentsRoom: false };
  const out = h('div', { class: 'plan-out', 'aria-live': 'polite' });
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const sel = (id: string, label: string, options: [string, string][], value: string, on: (v: string) => void) =>
    h(
      'div',
      { class: 'field' },
      h('label', { for: id }, label),
      h('select', { id, class: 'select', onchange: (e: Event) => (on((e.target as HTMLSelectElement).value), draw()) }, options.map(([v, t]) => h('option', { value: v, selected: v === value }, t))),
    );
  const check = (id: string, label: string, value: boolean, on: (v: boolean) => void) =>
    h('label', { class: 'check', for: id }, h('input', { type: 'checkbox', id, checked: value, onchange: (e: Event) => (on((e.target as HTMLInputElement).checked), draw()) }), label);

  const times: [string, string][] = [];
  for (let t = 9; t <= 20; t += 0.5) times.push([String(t), fmt(t)]);
  const form = h(
    'div',
    { class: 'plan-form' },
    sel('plan-day', 'Day', days.map((d, i) => [String(i), d]), String(opts.day), (v) => (opts.day = Number(v))),
    sel('plan-time', 'Arrive at', times, String(opts.start), (v) => (opts.start = Number(v))),
    sel('plan-arrival', 'Getting there', [['car', 'By car (Parking P1)'], ['bus', 'By bus (South Entrance)'], ['walk', 'On foot (Main Entrance)']], opts.arrival, (v) => (opts.arrival = v as PlanOptions['arrival'])),
    sel('plan-food', 'Food break', [['', 'No food break'], ...RESTAURANTS.map((r) => [r.id, r.name] as [string, string])], opts.food ?? '', (v) => (opts.food = v || null)),
    h('div', { class: 'field checks' }, check('plan-wc', 'Restroom stop', opts.restroom, (v) => (opts.restroom = v)), check('plan-baby', 'Parents’ room', opts.parentsRoom, (v) => (opts.parentsRoom = v))),
  );
  let current: Itinerary | null = null;
  function draw() {
    out.innerHTML = '';
    if (!opts.productIds.length) {
      out.append(h('p', { class: 'notice' }, 'Your shopping list is empty. Add products to your cart, or ask Scout for a mission, then come back here.'), button('Ask Scout for ideas', o.onAddItems, { variant: 'primary' }));
      return;
    }
    const it = buildItinerary(opts, o.pathLen);
    current = it;
    out.append(
      h(
        'dl',
        { class: 'mission-stats' },
        h('div', {}, h('dt', {}, 'Trip'), h('dd', {}, `${it.totalMinutes} min`)),
        h('div', {}, h('dt', {}, 'Finish'), h('dd', {}, it.finish)),
        h('div', {}, h('dt', {}, 'Walking'), h('dd', {}, `${it.walkMetres} m`)),
        h('div', {}, h('dt', {}, 'Spend'), h('dd', {}, money(it.total))),
      ),
      h(
        'ol',
        { class: 'itinerary' },
        it.steps.map((s) =>
          h('li', { class: `it-${s.kind}` }, h('time', {}, s.time), h('div', {}, h('strong', {}, s.title), h('small', {}, s.detail), s.warn ? h('small', { class: 'warn' }, `⚠ ${s.warn}`) : null)),
        ),
      ),
      h(
        'div',
        { class: 'actions' },
        button('Save plan', () => toast(savePlan(it) ? 'Plan saved on this device.' : 'Couldn’t save here (private browsing?). Use Copy plan instead.'), { variant: 'primary' }),
        button('Copy plan', async () => {
          try {
            await navigator.clipboard.writeText(itineraryText(it));
            toast('Plan copied. Paste it into your notes or messages.');
          } catch {
            toast('Copy isn’t available here. Select the plan text and copy it manually.');
          }
        }, { variant: 'ghost' }),
        button('Walk this plan in 3D', () => current && o.onStart(current), { icon: 'walk', variant: 'ghost' }),
      ),
      h('p', { class: 'muted small' }, 'Times use demo opening hours and a relaxed walking pace. Nothing is booked.'),
    );
  }
  draw();
  return h(
    'div',
    { class: 'view' },
    h('p', {}, `Plan a real visit from home. ${opts.productIds.length} item${opts.productIds.length === 1 ? '' : 's'} from your cart go on the list.`),
    form,
    out,
  );
}
