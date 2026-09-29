import * as THREE from 'three';
import './styles.css';
import {
  CENTRE,
  areaAt,
  facilityById,
  placeName,
  placeTarget,
  productById,
  restaurantById,
  storeById,
  storeInside,
  storeOutside,
  type Category,
  type PlaceRef,
} from './data/mall';
import { buildWorld, type Interact, type World } from './scene/world';
import { Player } from './controls/player';
import { NavGraph, describeRoute, pathLength, type P } from './nav/pathfinding';
import { RouteLine } from './nav/route3d';
import { announce, button, h, icon, toast } from './ui/dom';
import { closePanel, isPanelOpen, openPanel } from './ui/panel';
import { createMap, type MallMap } from './ui/map';
import { createSearchBox, type SearchResult } from './ui/search';
import { ProductPreview } from './ui/preview';
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
  ...(JSON.parse(store.get('vm-settings') ?? '{}') as Partial<Settings>),
};

function applySettings() {
  const root = document.documentElement;
  root.classList.toggle('large-text', settings.largeText);
  root.classList.toggle('high-contrast', settings.highContrast);
  root.classList.toggle('reduce-motion', settings.reducedMotion);
  if (player) {
    player.sensitivity = settings.sensitivity;
    player.invertLook = settings.invertLook;
  }
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
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  world = buildWorld(renderer);
} catch (err) {
  console.error(err);
  document.documentElement.classList.add('no-webgl');
}

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 220);
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
  ref: PlaceRef;
  path: P[];
  productId?: string;
  name: string;
}
let route: ActiveRoute | null = null;

function computeRoute(ref: PlaceRef) {
  return nav.findRoute({ x: player.x, z: player.z }, placeTarget(ref));
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
  const path = computeRoute(route.ref) ?? route.path;
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
    toast(`You have arrived at ${r.name}. ${product.name} is on the highlighted display.`);
    // Face the product.
    const at = world?.productAnchor(product.id);
    if (at) player.yaw = Math.atan2(-(at.x - player.x), -(at.z - player.z));
  } else toast(`You have arrived at ${r.name}.`);
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
      const path = computeRoute(ref);
      if (!path) {
        toast(`Sorry, no route to ${placeName(ref)} was found.`);
        return;
      }
      const name = placeName(ref);
      setRoute({ ref, path, productId: opts.productId, name });
      const steps = describeRoute(path, name);
      announce(`Route to ${name}, ${Math.round(pathLength(path))} metres. ${steps.join('. ')}. Follow the blue arrows or choose Walk me there.`);
      if (!inMall()) return;
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
      setRoute({ ref: { kind: 'store', id }, path, name: s.name });
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
};

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
});

window.addEventListener('resize', resize);
function resize() {
  const w = window.innerWidth;
  const hh = window.innerHeight;
  renderer?.setSize(w, hh, false);
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
    player.update(dt, camera, rm);
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
        const path = computeRoute(route.ref);
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
  routeLine.update(t, rm);
  preview.render(dt, rm);
  if (renderer && world) renderer.render(world.scene, camera);
  requestAnimationFrame(tick);
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

placeLandingCamera();
tick();
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { __vm: { renderer, player, world, camera, actions, pick, raycaster, get mode() { return mode; } } });
}
document.documentElement.classList.add('ready');
