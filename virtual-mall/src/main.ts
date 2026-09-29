import * as THREE from 'three';
import './styles.css';
import {
  CENTRE,
  STORES,
  areaAt,
  facilityById,
  placeName,
  placeTarget,
  productById,
  restaurantById,
  storeById,
  storeInside,
  storeOutside,
  productApproach,
  type Category,
  type PlaceRef,
} from './data/mall';
import { buildWorld, type Interact, type Quality, type World } from './scene/world';
import { Pipeline } from './scene/pipeline';
import { Player } from './controls/player';
import { NavGraph, describeRoute, pathLength, type P } from './nav/pathfinding';
import { RouteLine } from './nav/route3d';
import { announce, button, h, icon, toast } from './ui/dom';
import { closePanel, isPanelOpen, openPanel } from './ui/panel';
import { createMap, type MallMap } from './ui/map';
import { createSearchBox, type SearchResult } from './ui/search';
import { ProductPreview } from './ui/preview';
import { initShopping, type Shopping } from './app/shopping';
import { LiveMall } from './app/live';
import { Ambience } from './app/audio';
import { planView } from './app/plan';
import { EventStage } from './scene/events3d';
import { EVENTS } from './data/events';
import { liveView } from './ui/live-view';
import { XRMode } from './xr/xr';
import { createLLMBrain } from './ai/llm-brain';
import {
  dealsView,
  directoryView,
  facilityView,
  foodView,
  helpView,
  infoView,
  mapPanelView,
  productView,
  restaurantView,
  settingsView,
  storeView,
  type Actions,
  type Settings,
} from './ui/views';

// ---------------------------------------------------------------------------
// Settings (persisted per browser; everything works if storage is blocked)
// ---------------------------------------------------------------------------
const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, v: string) {
    try {
      localStorage.setItem(key, v);
    } catch {
      /* private mode etc. */
    }
  },
};

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const prefersContrast = window.matchMedia('(prefers-contrast: more)').matches;
const settings: Settings = {
  largeText: false,
  highContrast: prefersContrast,
  reducedMotion: prefersReduced,
  sensitivity: 1,
  invertLook: false,
  quality: 'auto',
  audio: false,
  ...(JSON.parse(store.get('vm-settings') ?? '{}') as Partial<Settings>),
};

const ambience = new Ambience();
/** Simulated time of day, weather, crowds, opening hours and events. */
const live = new LiveMall();

function applySettings() {
  const root = document.documentElement;
  root.classList.toggle('large-text', settings.largeText);
  root.classList.toggle('high-contrast', settings.highContrast);
  root.classList.toggle('reduce-motion', settings.reducedMotion);
  if (player) {
    player.sensitivity = settings.sensitivity;
    player.invertLook = settings.invertLook;
  }
  if (pipeline && settings.quality !== 'auto') setQuality(settings.quality);
  ambience.setAudio(settings.audio);
  store.set('vm-settings', JSON.stringify(settings));
}

let touch = window.matchMedia('(pointer: coarse)').matches;
const markTouch = () => {
  touch = true;
  document.documentElement.classList.add('touch');
};
if (touch) markTouch();
window.addEventListener('touchstart', markTouch, { once: true, passive: true });

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const canvas = $<HTMLCanvasElement>('#scene');
const tooltip = $('#tooltip');
const prompt = $('#prompt');
const whereEl = $('#where');
const routeCard = $('#route-card');
const storeBar = $('#store-bar');
const fadeEl = $('#fade');

// ---------------------------------------------------------------------------
// Renderer & world
// ---------------------------------------------------------------------------
let renderer: THREE.WebGLRenderer | null = null;
let world: World | null = null;
let pipeline: Pipeline | null = null;
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 220);
/** The tier actually in use ("auto" resolves to high on computers, medium on phones). */
let activeQuality: Quality = settings.quality === 'auto' ? (touch ? 'medium' : 'high') : settings.quality;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = activeQuality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  world = buildWorld(renderer);
  pipeline = new Pipeline(renderer, world, camera);
  pipeline.setQuality(activeQuality);
} catch (err) {
  console.error(err);
  document.documentElement.classList.add('no-webgl');
}

function setQuality(q: Quality, reason?: string) {
  if (!pipeline || q === activeQuality) return;
  activeQuality = q;
  pipeline.setQuality(q);
  fps.reset();
  if (reason) toast(reason);
}

/** Measures frame rate and steps quality down when "auto" can't hold ~30 fps. */
const fps = {
  frames: 0,
  time: 0,
  grace: 3,
  reset() {
    this.frames = 0;
    this.time = 0;
    this.grace = 3;
  },
  tick(dt: number) {
    if (settings.quality !== 'auto' || document.hidden) return;
    if (this.grace > 0) {
      this.grace -= dt;
      return;
    }
    this.frames++;
    this.time += dt;
    if (this.time < 4) return;
    const rate = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (activeQuality === 'high' && rate < 30) setQuality('medium', 'Graphics set to Medium for smoother movement.');
    else if (activeQuality === 'medium' && rate < 22) setQuality('low', 'Graphics set to Low for smoother movement.');
  },
};
const nav = new NavGraph(world?.colliders ?? []);
const routeLine = new RouteLine();
world?.scene.add(routeLine.group);
const preview = new ProductPreview();
const raycaster = new THREE.Raycaster();

type Mode = 'landing' | 'entering' | 'mall';
let mode: Mode = 'landing';
const inMall = () => mode === 'mall';

const player = new Player({
  canvas,
  joystick: $('#joystick'),
  colliders: world?.colliders ?? [],
  onTap: (x, y) => {
    const hit = pick(x, y);
    if (hit) interact(hit.interact);
  },
  onHover: (x, y) => hover(x, y),
  onInteractKey: () => {
    const hit = pick(window.innerWidth / 2, window.innerHeight / 2, 8);
    if (hit) interact(hit.interact);
    else toast('Nothing to interact with here. Face a store sign, product or screen, or use Search.');
  },
  isBlocked: () => isPanelOpen(),
  isActive: inMall,
  onUserMove: () => announce('Stopped auto-walk. The route is still shown.'),
});
player.place(CENTRE.start.x, CENTRE.start.z, CENTRE.start.yaw);
applySettings();

// ---------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------
function pick(x: number, y: number, maxDist = 60): { interact: Interact; point: THREE.Vector3 } | null {
  if (!world) return null;
  const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  raycaster.far = maxDist;
  const hits = raycaster.intersectObjects(world.pickables, true);
  for (const hit of hits) {
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.interact) o = o.parent;
    if (o) return { interact: o.userData.interact as Interact, point: hit.point };
    // First hit was a wall/floor: it blocks anything behind it, except
    // transparent glass which we let clicks pass through.
    const m = (hit.object as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || !m.transparent) return null;
  }
  return null;
}

let hoverQueued = false;
function hover(x: number, y: number) {
  if (hoverQueued) return;
  hoverQueued = true;
  requestAnimationFrame(() => {
    hoverQueued = false;
    const hit = pick(x, y);
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    if (hit) {
      tooltip.textContent = hit.interact.label;
      tooltip.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
      tooltip.hidden = false;
    } else tooltip.hidden = true;
  });
}

function interact(i: Interact) {
  tooltip.hidden = true;
  switch (i.kind) {
    case 'store':
      return actions.openStore(i.id);
    case 'product':
      return actions.openProduct(i.id);
    case 'restaurant':
      return i.id === 'food-court' ? openFood() : actions.openRestaurant(i.id);
    case 'facility':
      return actions.openFacility(i.id);
    case 'kiosk':
      return openMap();
    case 'ad':
      return openDeals();
    case 'companion':
      return shop?.openCompanion();
    case 'event':
      return openLive();
  }
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------
const miniMap: MallMap = createMap({ compact: true, label: 'Mini map' });
miniMap.el.setAttribute('aria-hidden', 'true');
$('#minimap').append(miniMap.el);
$('#minimap').addEventListener('click', () => openMap());
let fullMap: MallMap | null = null;

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
interface ActiveRoute {
  /** Where the route ends. */
  target: P;
  ref?: PlaceRef;
  path: P[];
  productId?: string;
  name: string;
  /** Replaces the default arrival message (used by shopping missions). */
  onArrive?: () => void;
}
let route: ActiveRoute | null = null;

function recompute(r: ActiveRoute) {
  return nav.findRoute({ x: player.x, z: player.z }, r.target);
}

/** Draw a route to any floor point and show the directions card. */
function routeTo(target: P, name: string, opts: { productId?: string; onArrive?: () => void; ref?: PlaceRef } = {}) {
  const path = nav.findRoute({ x: player.x, z: player.z }, target);
  if (!path) {
    toast(`Sorry, no route to ${name} was found.`);
    return false;
  }
  setRoute({ target, path, name, ...opts });
  const steps = describeRoute(path, name);
  announce(`Route to ${name}, ${Math.round(pathLength(path))} metres. ${steps.join('. ')}.`);
  return true;
}

function setRoute(r: ActiveRoute | null) {
  route = r;
  routeLine.set(r?.path ?? null);
  miniMap.setRoute(r?.path ?? null);
  fullMap?.setRoute(r?.path ?? null);
  world?.highlightProduct(r?.productId ?? null);
  renderRouteCard();
}

function renderRouteCard() {
  routeCard.innerHTML = '';
  routeCard.hidden = !route;
  if (!route) return;
  const dist = Math.round(pathLength(route.path));
  const secs = Math.max(5, Math.round(dist / 1.3 / 5) * 5);
  const steps = describeRoute(route.path, route.name);
  const product = route.productId ? productById(route.productId) : undefined;
  routeCard.append(
    h(
      'div',
      { class: 'route-head' },
      icon('route', 22),
      h('div', {}, h('strong', {}, `To ${route.name}`), h('small', {}, `${dist} m · about ${secs < 60 ? `${secs} s` : `${Math.round(secs / 60)} min`} walk${product ? ` · ${product.name}` : ''}`)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Clear route', onclick: () => (player.cancelPath(), setRoute(null), announce('Route cleared')) }, icon('close', 18)),
    ),
    h('details', { class: 'steps' }, h('summary', {}, 'Step-by-step directions'), h('ol', {}, steps.map((s) => h('li', {}, s)))),
    h(
      'div',
      { class: 'actions' },
      button(settings.reducedMotion ? 'Jump there' : player.following ? 'Walking…' : 'Walk me there', () => walkRoute(), { icon: 'walk', variant: 'primary' }),
      product ? button('View product', () => actions.openProduct(product.id), { variant: 'ghost' }) : null,
    ),
  );
}

function walkRoute() {
  if (!route) return;
  // Re-plan from where we are now, in case the user wandered off.
  const path = recompute(route) ?? route.path;
  setRoute({ ...route, path });
  if (settings.reducedMotion) {
    const end = path[path.length - 1];
    const prev = path[path.length - 2] ?? { x: player.x, z: player.z };
    teleport(end.x, end.z, Math.atan2(-(end.x - prev.x), -(end.z - prev.z)), () => arrive());
    return;
  }
  player.followPath(path, () => arrive());
  renderRouteCard();
  announce(`Walking to ${route.name}. Use any movement key to stop.`);
}

function arrive() {
  if (!route) return;
  const r = route;
  const product = r.productId ? productById(r.productId) : undefined;
  setRoute(null);
  if (product) {
    world?.highlightProduct(product.id);
    // Face the product.
    const at = world?.productAnchor(product.id);
    if (at) player.yaw = Math.atan2(-(at.x - player.x), -(at.z - player.z));
  }
  if (r.onArrive) r.onArrive();
  else if (product) toast(`You have arrived at ${r.name}. ${product.name} is on the highlighted display.`);
  else toast(`You have arrived at ${r.name}.`);
}

function nearPolyline(path: P[], x: number, z: number) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}

// ---------------------------------------------------------------------------
// Mode transitions
// ---------------------------------------------------------------------------
const landingCurve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(-40, 4.2, 3.8),
    new THREE.Vector3(-24, 3.4, -4.2),
    new THREE.Vector3(-6, 5.4, -4.4),
    new THREE.Vector3(10, 5.2, -4.4),
    new THREE.Vector3(24, 3.4, -3),
    new THREE.Vector3(40, 4, -2),
    new THREE.Vector3(39, 3.2, 11),
    new THREE.Vector3(20, 3.2, 17),
    new THREE.Vector3(14, 3.6, 9),
    new THREE.Vector3(6, 4.6, 4.4),
    new THREE.Vector3(-10, 4.4, 4.4),
    new THREE.Vector3(-30, 3.8, 4.4),
  ],
  true,
  'centripetal',
);
let landingT = 0.02;
const tween = { t: 0, dur: 1.8, fromPos: new THREE.Vector3(), fromQ: new THREE.Quaternion(), toPos: new THREE.Vector3(), toQ: new THREE.Quaternion(), done: null as null | (() => void) };

function placeLandingCamera() {
  if (settings.reducedMotion) {
    camera.position.set(-44, 3.8, 3);
    camera.lookAt(10, 2.4, -1);
    return;
  }
  const p = landingCurve.getPointAt(landingT % 1);
  const ahead = landingCurve.getPointAt((landingT + 0.025) % 1);
  camera.position.copy(p);
  camera.lookAt(ahead.x, 2.6, ahead.z);
}

function enterMall(after?: () => void) {
  if (!world) {
    toast('Your browser could not start 3D graphics. You can still use the store directory, map and search.');
    after?.();
    return;
  }
  if (mode === 'mall') {
    after?.();
    return;
  }
  closePanel();
  document.body.classList.add('in-mall');
  $('#landing').setAttribute('aria-hidden', 'true');
  $('#landing').setAttribute('inert', '');
  $('#hud').removeAttribute('inert');
  $('#hud').removeAttribute('aria-hidden');
  const finish = () => {
    mode = 'mall';
    canvas.focus({ preventScroll: true });
    const first = !store.get('vm-help-seen');
    announce(`You are in ${CENTRE.name}. ${areaAt(player.x, player.z).label}.`);
    if (first && !after) openHelp();
    after?.();
  };
  const probe = new THREE.PerspectiveCamera();
  probe.position.set(player.x, 1.65, player.z);
  probe.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  if (settings.reducedMotion) {
    mode = 'entering';
    fade(() => {
      camera.position.copy(probe.position);
      camera.quaternion.copy(probe.quaternion);
      finish();
    });
    return;
  }
  mode = 'entering';
  tween.t = 0;
  tween.fromPos.copy(camera.position);
  tween.fromQ.copy(camera.quaternion);
  tween.toPos.copy(probe.position);
  tween.toQ.copy(probe.quaternion);
  tween.done = finish;
}

function exitMall() {
  closePanel();
  player.cancelPath();
  player.releaseKeys();
  fade(() => {
    mode = 'landing';
    document.body.classList.remove('in-mall');
    $('#landing').removeAttribute('aria-hidden');
    $('#landing').removeAttribute('inert');
    $('#hud').setAttribute('inert', '');
    $('#hud').setAttribute('aria-hidden', 'true');
    tooltip.hidden = true;
    placeLandingCamera();
    $('#enter-btn').focus();
    announce('You have left the virtual mall.');
  });
}

function fade(mid: () => void) {
  if (settings.reducedMotion) {
    mid();
    return;
  }
  fadeEl.classList.add('on');
  setTimeout(() => {
    mid();
    requestAnimationFrame(() => fadeEl.classList.remove('on'));
  }, 260);
}

function teleport(x: number, z: number, yaw: number, then?: () => void) {
  player.cancelPath();
  fade(() => {
    player.place(x, z, yaw);
    then?.();
  });
}

function returnToCentre() {
  enterMall(() => {
    teleport(CENTRE.centre.x, CENTRE.centre.z, CENTRE.centre.yaw);
    announce('You are back in the central atrium.');
  });
}

// ---------------------------------------------------------------------------
// Panels / actions
// ---------------------------------------------------------------------------
const actions: Actions = {
  inMall,
  navigate(ref, opts = {}) {
    const go = () => {
      closePanel();
      const product = opts.productId ? productById(opts.productId) : undefined;
      // Products route to the exact display, everything else to the place.
      const target = product ? productApproach(product) : placeTarget(ref);
      if (!routeTo(target, placeName(ref), { ref, productId: opts.productId })) return;
      routeCard.querySelector<HTMLButtonElement>('.actions .btn')?.focus({ preventScroll: true });
    };
    if (inMall()) go();
    else enterMall(go);
  },
  enterStore(id) {
    const s = storeById(id)!;
    closePanel();
    const walkIn = () => {
      const inside = storeInside(s);
      const path = nav.findRoute({ x: player.x, z: player.z }, inside);
      const yaw = s.side === 'north' ? 0 : Math.PI;
      if (!path || settings.reducedMotion) {
        teleport(inside.x, inside.z, yaw, () => announce(`You are inside ${s.name}. Select a product on display to see details.`));
        return;
      }
      setRoute({ target: inside, ref: { kind: 'store', id }, path, name: s.name });
      player.followPath(path, () => {
        setRoute(null);
        player.yaw = yaw;
        announce(`You are inside ${s.name}. Select a product on display to see details.`);
      });
      renderRouteCard();
    };
    if (inMall()) walkIn();
    else {
      // Start just outside the storefront, facing it, then walk in.
      const out = storeOutside(s);
      player.place(out.x, out.z + (s.side === 'north' ? 3 : -3), s.side === 'north' ? 0 : Math.PI);
      enterMall(walkIn);
    }
  },
  openStore(id) {
    const s = storeById(id);
    if (!s) return;
    openPanel({ title: s.name, subtitle: `${s.categories.join(' · ')} · Unit ${s.unit}`, body: storeView(s, actions) });
  },
  openProduct(id) {
    const p = productById(id);
    if (!p) return;
    const s = storeById(p.storeId)!;
    const body = productView(p, actions);
    openPanel({ title: p.name, subtitle: `${s.name} · ${p.type}`, body, onBack: () => actions.openStore(s.id) });
    shop?.onProductViewed(id);
    const host = body.querySelector<HTMLElement>('.preview');
    if (host) requestAnimationFrame(() => preview.mount(host, p));
  },
  openRestaurant(id) {
    const r = restaurantById(id);
    if (!r) return;
    openPanel({ title: r.name, subtitle: `${r.cuisine} · Food Court · Unit ${r.unit}`, body: restaurantView(r, actions), onBack: openFood });
  },
  openFacility(id) {
    const f = facilityById(id);
    if (!f) return;
    openPanel({ title: f.name, body: facilityView(f, actions) });
  },
  openDirectory(category) {
    openPanel({ title: 'Stores', subtitle: `${CENTRE.name} store directory`, body: directoryView(actions, category), variant: 'drawer' });
  },
  addToCart: (id, option) => shop?.addToCart(id, option) ?? false,
  toggleCompare: (id) => shop?.toggleCompare(id),
  inCompare: (id) => shop?.inCompare(id) ?? false,
  askCompanion: (text) => {
    closePanel();
    shop?.ask(text);
  },
};

// ---------------------------------------------------------------------------
// AI shopping layer: companion, cart, budget, comparison, missions
// ---------------------------------------------------------------------------
const shop: Shopping | null = initShopping({
  camera,
  scene: world?.scene ?? null,
  pickables: world?.pickables ?? [],
  nav,
  player,
  inMall,
  enterMall: (after) => enterMall(after),
  navigate: (ref, opts) => actions.navigate(ref, opts),
  routeTo: (target, name, opts) => {
    const go = () => routeTo(target, name, opts);
    if (inMall()) return go();
    enterMall(go);
    return true;
  },
  clearRoute: () => setRoute(null),
  highlight: (id) => world?.highlightProduct(id),
  openProduct: (id) => actions.openProduct(id),
  isOpen: (storeId) => isStoreOpen(storeId),
  event: () => currentEvent(),
  reducedMotion: () => settings.reducedMotion,
});

// Optional LLM brain behind your own proxy: VITE_COMPANION_ENDPOINT=https://… or ?brain=https://…
const brainUrl = (import.meta.env.VITE_COMPANION_ENDPOINT as string | undefined) ?? new URLSearchParams(location.search).get('brain');
if (brainUrl) shop?.setBrain(createLLMBrain(brainUrl));

function isStoreOpen(storeId: string): boolean {
  return live.isOpen(storeId);
}
function currentEvent(): { name: string; productIds: string[] } | null {
  return live.event ? { name: live.event.name, productIds: live.event.productIds } : null;
}

// ---------------------------------------------------------------------------
// Living mall: time of day, weather, crowds, opening hours, events
// ---------------------------------------------------------------------------
const eventStage = new EventStage();
world?.scene.add(eventStage.group);
let eventPicks: THREE.Object3D[] = [];
let lastAmb = { hour: -99, weather: '', crowd: -1 };
const liveChip = $('#live-chip');

function applyAmbience(force = false) {
  const hour = live.hour;
  // Throttled: shadow maps and light shafts are rebuilt when the sun moves.
  if (force || Math.abs(hour - lastAmb.hour) >= 0.25 || live.weather !== lastAmb.weather || Math.abs(live.crowd - lastAmb.crowd) > 0.02) {
    lastAmb = { hour, weather: live.weather, crowd: live.crowd };
    world?.setAmbience({ hour, weather: live.weather, crowd: live.crowd });
    ambience.setCrowd(live.crowd);
  }
  const crowd = live.crowd < 0.2 ? 'Quiet' : live.crowd < 0.5 ? 'Steady' : live.crowd < 0.8 ? 'Busy' : 'Very busy';
  const wx = live.weather === 'clear' ? '☀' : live.weather === 'cloudy' ? '☁' : '🌧';
  liveChip.textContent = `${live.label()} · ${crowd} · ${wx}${live.event ? ` · ${live.event.name}` : ''}${live.mode === 'preview' ? ' · preview' : ''}`;
}

function applyStores() {
  for (const s of STORES) world?.setStoreOpen(s.id, live.isOpen(s.id));
}

function applyEvent(announceIt: boolean) {
  const e = live.event;
  eventStage.set(e);
  if (world) {
    for (const o of eventPicks) {
      const i = world.pickables.indexOf(o);
      if (i >= 0) world.pickables.splice(i, 1);
    }
    eventPicks = [...eventStage.pickables];
    world.pickables.unshift(...eventPicks);
    world.setEventSlide(e ? { title: e.name, sub: e.description, from: e.colors[0], to: '#111827' } : null);
  }
  if (e && announceIt && inMall()) {
    toast(`Event on now: ${e.name} (demo). ${e.tagline}.`, 5000);
    if (shop && shop.mode !== 'explore') shop.say(`${e.name} is on now. Want to see the featured products?`, { chips: ['What’s on?'] });
  }
}

window.addEventListener('pointerdown', () => settings.audio && ambience.setAudio(true), { once: true });
live.addEventListener('change', () => applyAmbience());
live.addEventListener('stores', applyStores);
live.addEventListener('event', () => applyEvent(true));
live.addEventListener('closing', (ev) => {
  const { storeId, minutes } = (ev as CustomEvent).detail as { storeId: string; minutes: number };
  const st = storeById(storeId)!;
  if (inMall()) toast(`${st.name} closes in ${minutes} minutes.`);
  if (shop && shop.mode !== 'explore' && inMall()) shop.say(`Heads up: ${st.name} closes in ${minutes} minutes.`);
});
applyAmbience(true);
applyStores();
applyEvent(false);

function openLive() {
  openPanel({
    title: 'What’s on',
    subtitle: 'Time of day, crowds, weather and events (simulated)',
    body: liveView(live, {
      onChange: () => applyAmbience(),
      goToEvent: (id) => {
        const e = EVENTS.find((x) => x.id === id)!;
        live.eventChoice = id;
        live.recompute(true);
        closePanel();
        const stand = e.kind === 'food-festival' ? { x: e.x, z: 8.4 } : { x: e.x + 3.5, z: 3.4 };
        const go = () => routeTo(stand, e.name, {});
        if (inMall()) go();
        else enterMall(go);
      },
    }),
  });
}

function openPlan() {
  const ids = shop?.cart.lines.map((l) => l.productId) ?? [];
  openPanel({
    title: 'Shop before you go',
    subtitle: 'Your Shopping Plan for a real visit',
    variant: 'wide',
    body: planView({
      productIds: ids,
      pathLen: (a, b) => {
        const p = nav.findRoute(a, b);
        return p ? pathLength(p) : Math.hypot(a.x - b.x, a.z - b.z) * 1.4;
      },
      onAddItems: () => {
        closePanel();
        enterMall(() => shop?.openCompanion());
      },
      onStart: (it) => {
        closePanel();
        const ent = facilityById(it.opts.arrival === 'car' ? 'east-entrance' : it.opts.arrival === 'bus' ? 'south-entrance' : 'west-entrance')!;
        const at = ent.approach ?? { x: ent.x, z: ent.z };
        live.setPreview(it.opts.start, it.opts.day);
        applyAmbience(true);
        const faceIn = Math.atan2(-(0 - at.x), -(0 - at.z));
        player.place(at.x, at.z, faceIn);
        enterMall(() => shop?.startMission(shop.planForCart()));
      },
    }),
  });
}

function openFood() {
  openPanel({ title: 'Food & restaurants', subtitle: 'Food Court · ground floor', body: foodView(actions) });
}
function openDeals() {
  openPanel({ title: 'Deals', subtitle: 'Current promotions (demo)', body: dealsView(actions) });
}
function openInfo() {
  openPanel({ title: 'Centre info', subtitle: `${CENTRE.name} · hours, parking & facilities`, body: infoView(actions) });
}
function openSettings() {
  openPanel({
    title: 'Accessibility',
    subtitle: 'Settings are saved on this device',
    body: settingsView(settings, () => {
      applySettings();
      renderRouteCard();
    }),
  });
}
function openHelp() {
  store.set('vm-help-seen', '1');
  openPanel({ title: 'How to explore', body: helpView(() => closePanel(), touch), variant: 'modal' });
}
function openMap() {
  fullMap = createMap({
    label: `Map of ${CENTRE.name}, ground floor`,
    onSelect: (ref) => actions.navigate(ref),
  });
  fullMap.setPlayer(player.x, player.z, player.yaw);
  fullMap.setRoute(route?.path ?? null);
  openPanel({ title: 'Centre map', subtitle: 'Ground floor', body: mapPanelView(fullMap.el, actions), variant: 'wide', onClose: () => (fullMap = null) });
}

function onSearchPick(r: SearchResult) {
  actions.navigate(r.ref, { productId: r.productId });
  if (r.productId) {
    const p = productById(r.productId)!;
    toast(`Directions to ${placeName(r.ref)} for ${p.name}.`);
  }
}

// ---------------------------------------------------------------------------
// Wire up static UI
// ---------------------------------------------------------------------------
const hudSearch = createSearchBox(onSearchPick, 'hud-search');
$('#hud-search').append(hudSearch.el);
const landingSearch = createSearchBox(onSearchPick, 'landing-search');
$('#landing-search').append(landingSearch.el);

$('#enter-btn').addEventListener('click', () => enterMall());
$('#explore-btn').addEventListener('click', () => actions.openDirectory('All'));
$('#exit-btn').addEventListener('click', exitMall);

document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => el.prepend(icon(el.dataset.icon!, 20)));

const bind = (sel: string, fn: () => void) => document.querySelectorAll(sel).forEach((el) => el.addEventListener('click', fn));
bind('[data-open="stores"]', () => actions.openDirectory('All'));
bind('[data-open="food"]', openFood);
bind('[data-open="deals"]', openDeals);
bind('[data-open="map"]', openMap);
bind('[data-open="info"]', openInfo);
bind('[data-open="access"]', openSettings);
bind('[data-open="help"]', openHelp);
bind('[data-open="centre"]', returnToCentre);
bind('[data-open="live"]', openLive);
bind('[data-open="plan"]', openPlan);
$('#landing-ask').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('#landing-ask-input');
  const q = input.value.trim() || 'Just looking';
  input.value = '';
  enterMall(() => {
    shop?.setMode('shopping');
    shop?.ask(q);
  });
});
document.querySelectorAll<HTMLElement>('[data-category]').forEach((el) =>
  el.addEventListener('click', () => actions.openDirectory(el.dataset.category as Category)),
);

window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (isPanelOpen() || mode !== 'mall') return;
  const k = e.key.toLowerCase();
  if (k === '/') {
    e.preventDefault();
    hudSearch.input.focus();
  } else if (k === 'm') openMap();
  else if (k === 'b') actions.openDirectory('All');
  else if (k === 'r') returnToCentre();
  else if (k === 'h') openHelp();
  else if (k === 'c') {
    e.preventDefault();
    shop?.openCompanion();
  } else if (k === 'k') shop?.openCart();
});

window.addEventListener('resize', resize);
function resize() {
  const w = window.innerWidth;
  const hh = window.innerHeight;
  pipeline?.setSize(w, hh);
  camera.aspect = w / hh;
  camera.fov = w < 700 ? 78 : 70;
  camera.updateProjectionMatrix();
}
resize();

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Timer();
let areaTimer = 0;
let focusTimer = 0;
let rerouteTimer = 0;
let lastStore: string | undefined;
let lastArea = '';

function tick(now?: number) {
  clock.update(now);
  const rawDt = Math.max(0, clock.getDelta());
  const dt = Math.min(rawDt, 0.05);
  const t = clock.getElapsed();
  const rm = settings.reducedMotion;

  if (mode === 'landing') {
    if (!rm) landingT = (landingT + dt / 80) % 1;
    placeLandingCamera();
  } else if (mode === 'entering' && tween.done) {
    tween.t = Math.min(1, tween.t + Math.min(rawDt, 0.25) / tween.dur);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
    camera.quaternion.slerpQuaternions(tween.fromQ, tween.toQ, e);
    if (tween.t >= 1) {
      const done = tween.done;
      tween.done = null;
      done();
    }
  } else if (mode === 'mall') {
    if (xr?.presenting) xr.update(dt);
    else player.update(dt, camera, rm);
    areaTimer += dt;
    focusTimer += dt;
    rerouteTimer += dt;
    if (areaTimer > 0.15) {
      areaTimer = 0;
      miniMap.setPlayer(player.x, player.z, player.yaw);
      fullMap?.setPlayer(player.x, player.z, player.yaw);
      updateArea();
      if (route) {
        const end = route.path[route.path.length - 1];
        if (!player.following && Math.hypot(end.x - player.x, end.z - player.z) < 1.8) arrive();
      }
    }
    if (rerouteTimer > 1.2) {
      rerouteTimer = 0;
      if (route && !player.following && nearPolyline(route.path, player.x, player.z) > 5) {
        const path = recompute(route);
        if (path) setRoute({ ...route, path });
      }
    }
    if (focusTimer > 0.2 && !touch) {
      focusTimer = 0;
      const hit = isPanelOpen() ? null : pick(window.innerWidth / 2, window.innerHeight / 2, 7);
      prompt.hidden = !hit;
      if (hit) prompt.innerHTML = `<kbd>E</kbd> ${escapeHtml(hit.interact.label)}`;
    }
  }

  world?.update(dt, t, rm);
  shop?.update(dt, t, window.innerWidth, window.innerHeight);
  live.tick(rawDt);
  eventStage.update(t, dt, rm);
  ambience.update(dt);
  routeLine.update(t, rm);
  preview.render(dt, rm);
  fps.tick(rawDt);
  pipeline?.render();
  // WebXR needs the renderer's animation loop; without WebGL fall back to rAF.
  if (!renderer) requestAnimationFrame(tick);
}

function updateArea() {
  const a = areaAt(player.x, player.z);
  if (a.label !== lastArea) {
    lastArea = a.label;
    whereEl.textContent = a.label;
  }
  if (a.storeId !== lastStore) {
    lastStore = a.storeId;
    storeBar.innerHTML = '';
    storeBar.hidden = !a.storeId;
    if (a.storeId) {
      const s = storeById(a.storeId)!;
      storeBar.append(
        h('span', {}, 'You are in ', h('strong', {}, s.name)),
        button('Store info', () => actions.openStore(s.id), { variant: 'small' }),
        button('Back to concourse', () => {
          const out = storeOutside(s);
          teleport(out.x, out.z, s.side === 'north' ? Math.PI : 0);
        }, { variant: 'small ghost' }),
      );
      announce(`Entered ${s.name}. Products are on the white displays.`);
    } else announce(`Now in: ${a.label}`);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

// ---------------------------------------------------------------------------
// WebXR (VR headsets) — only offered when the browser supports immersive-vr
// ---------------------------------------------------------------------------
const xr: XRMode | null =
  renderer && world
    ? new XRMode({
        renderer,
        scene: world.scene,
        camera,
        player,
        pickables: () => world!.pickables,
        canStand: (x, z) => {
          const p = nav.findRoute({ x: player.x, z: player.z }, { x, z });
          return !nav.blockedPoint({ x, z }) && !!p && pathLength(p) < 45;
        },
        addToCart: (id) => shop?.addToCart(id),
        onStart: () => {
          document.body.classList.add('in-xr');
          announce('VR mode started. Point and pull the trigger to teleport or select.');
        },
        onEnd: () => {
          document.body.classList.remove('in-xr');
          player.pitch = 0;
        },
      })
    : null;
xr?.detect().then((ok) => {
  if (!ok) return;
  for (const id of ['#xr-btn', '#xr-landing']) {
    const b = $(id);
    b.hidden = false;
    b.addEventListener('click', () =>
      enterMall(() =>
        xr.enter().catch(() => toast('Couldn’t start VR. Check that your headset is connected and try again.')),
      ),
    );
  }
});

placeLandingCamera();
if (renderer) renderer.setAnimationLoop(tick);
else tick();
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { __vm: { renderer, player, world, camera, actions, pick, raycaster, live, shop, pipeline, applyAmbience, applyEvent, setQuality, openLive, openPlan, get mode() { return mode; } } });
}
document.documentElement.classList.add('ready');
