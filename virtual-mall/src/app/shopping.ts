import type * as THREE from 'three';
import {
  FACILITIES,
  featuresOf,
  money,
  productApproach,
  productById,
  storeById,
  storeInside,
  STORES,
  type PlaceRef,
} from '../data/mall';
import {
  cheaperAlternatives,
  compareText,
  localBrain,
  planForProducts,
  setLastPicks,
  why,
  type CompanionBrain,
  type EngineContext,
  type MissionPlan,
  type Reply,
} from '../ai/engine';
import { Cart } from '../shop/cart';
import { CompanionOrb } from '../scene/companion3d';
import { CompareDisplay } from '../scene/compare3d';
import type { NavGraph, P } from '../nav/pathfinding';
import { pathLength } from '../nav/pathfinding';
import { announce, button, h, icon, toast } from '../ui/dom';
import { closePanel, openPanel } from '../ui/panel';

export type Mode = 'explore' | 'shopping' | 'shopper';

export interface ShopDeps {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene | null;
  pickables: THREE.Object3D[];
  nav: NavGraph;
  player: { x: number; z: number; yaw: number };
  inMall(): boolean;
  enterMall(after?: () => void): void;
  navigate(ref: PlaceRef, opts?: { productId?: string }): void;
  routeTo(target: P, name: string, opts: { productId?: string; onArrive?: () => void }): boolean;
  clearRoute(): void;
  highlight(productId: string | null): void;
  openProduct(id: string): void;
  isOpen(storeId: string): boolean;
  event(): { name: string; productIds: string[] } | null;
  reducedMotion(): boolean;
}

const MODE_LABEL: Record<Mode, string> = { explore: 'Explore', shopping: 'Shopping', shopper: 'Personal Shopper' };

/**
 * Everything that turns the 3D centre into an AI shopping world: the
 * companion (chat + 3D orb), cart & budget, comparisons, shopping missions
 * and the three modes. main.ts wires it to the renderer and navigation.
 */
export function initShopping(d: ShopDeps) {
  const cart = new Cart();
  let brain: CompanionBrain = localBrain;
  const orb = new CompanionOrb();
  const compare3d = new CompareDisplay();
  d.scene?.add(orb.group, compare3d.group);
  d.pickables.push(orb.group);
  let mode: Mode = 'explore';
  let compareIds: string[] = [];
  const viewed: string[] = [];
  let mission: { plan: MissionPlan; leg: number; announced20: boolean; done: boolean } | null = null;
  let bubbleUntil = 0;
  let elapsed = 0;

  // ------------------------------------------------------------------ routing helpers
  const distCache = new Map<string, { t: number; d: number | null }>();
  function walkDistance(to: P): number | null {
    const path = d.nav.findRoute({ x: d.player.x, z: d.player.z }, to);
    return path ? pathLength(path) : null;
  }
  function distanceTo(storeId: string) {
    const c = distCache.get(storeId);
    if (c && elapsed - c.t < 1.5) return c.d;
    const s = storeById(storeId);
    const dist = s ? walkDistance(storeInside(s)) : null;
    distCache.set(storeId, { t: elapsed, d: dist });
    return dist;
  }
  /** Shortest start → stores → exit order (exact for up to 7 stores). */
  function routeFor(storeIds: string[]) {
    const start = { x: d.player.x, z: d.player.z };
    const exits = FACILITIES.filter((f) => f.kind === 'entrance' || f.kind === 'parking').map((f) => f.approach ?? { x: f.x, z: f.z });
    const pts = storeIds.map((id) => storeInside(storeById(id)!));
    const len = (a: P, b: P) => {
      const p = d.nav.findRoute(a, b);
      return p ? pathLength(p) : Math.hypot(a.x - b.x, a.z - b.z) * 1.4;
    };
    const n = pts.length;
    const fromStart = pts.map((p) => len(start, p));
    const between = pts.map((a) => pts.map((b) => (a === b ? 0 : len(a, b))));
    const toExit = pts.map((p) => Math.min(...exits.map((e) => len(p, e))));
    let best = { order: storeIds, metres: n ? Infinity : 0 };
    const perm = (arr: number[], k: number) => {
      if (k === arr.length) {
        let m = fromStart[arr[0]];
        for (let i = 1; i < arr.length; i++) m += between[arr[i - 1]][arr[i]];
        m += toExit[arr[arr.length - 1]];
        if (m < best.metres) best = { order: arr.map((i) => storeIds[i]), metres: m };
        return;
      }
      for (let i = k; i < arr.length; i++) {
        [arr[k], arr[i]] = [arr[i], arr[k]];
        perm(arr, k + 1);
        [arr[k], arr[i]] = [arr[i], arr[k]];
      }
    };
    if (n && n <= 7) perm([...Array(n).keys()], 0);
    else if (n) best = { order: storeIds, metres: fromStart[0] };
    return best;
  }

  const ctx = (): EngineContext => ({
    cart,
    isOpen: d.isOpen,
    distanceTo,
    viewed,
    eventProductIds: d.event()?.productIds ?? [],
    eventName: d.event()?.name ?? null,
    routeFor,
  });

  // ------------------------------------------------------------------ HUD elements
  const hud = document.getElementById('hud')!;
  const modeSwitch = h('div', { class: 'mode-switch', role: 'radiogroup', 'aria-label': 'Mode' });
  const cartChip = h('button', { type: 'button', class: 'cart-chip', 'aria-label': 'Open cart', onclick: () => openCart() });
  const compareTray = h('div', { class: 'compare-tray', hidden: true, role: 'region', 'aria-label': 'Comparison tray' });
  const missionBar = h('div', { class: 'mission-bar', hidden: true, role: 'region', 'aria-label': 'Shopping mission' });
  const bubble = h('div', { class: 'bubble', hidden: true, 'aria-hidden': 'true' });
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation with Scout' });
  const input = h('input', { id: 'companion-input', type: 'text', class: 'chat-input', placeholder: 'Ask Scout… e.g. “black hoodie under $60”', autocomplete: 'off', 'aria-label': 'Message Scout' }) as HTMLInputElement;
  const micBtn = h('button', { type: 'button', class: 'icon-btn mic', 'aria-label': 'Speak to Scout', hidden: true }, micIcon());
  const form = h(
    'form',
    { class: 'chat-form' },
    input,
    micBtn,
    h('button', { type: 'submit', class: 'btn primary small', 'aria-label': 'Send' }, 'Send'),
  );
  const dock = h(
    'section',
    { class: 'companion-dock', 'aria-label': 'Scout, shopping companion', hidden: true },
    h(
      'header',
      { class: 'dock-head' },
      h('span', { class: 'scout-dot', 'aria-hidden': 'true' }),
      h('div', { class: 'dock-title' }, h('strong', {}, 'Scout'), h('small', { id: 'dock-mode' }, 'AI shopping companion · demo data')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Minimise Scout', onclick: () => setDock(false) }, icon('close', 18)),
    ),
    log,
    form,
  );
  const fab = h('button', { type: 'button', class: 'companion-fab', 'aria-label': 'Ask Scout, your shopping companion', onclick: () => setDock(true) }, h('span', { class: 'scout-dot', 'aria-hidden': 'true' }), h('span', {}, 'Ask Scout'));
  hud.append(modeSwitch, cartChip, compareTray, missionBar, dock, fab);
  document.body.append(bubble);

  (['explore', 'shopping', 'shopper'] as Mode[]).forEach((m) => {
    modeSwitch.append(
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(m === mode), 'data-mode': m, onclick: () => setMode(m) }, MODE_LABEL[m]),
    );
  });

  // Voice input where the browser supports it.
  const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
  if (SR) {
    micBtn.hidden = false;
    micBtn.addEventListener('click', () => {
      try {
        const rec = new SR();
        rec.lang = 'en-AU';
        rec.interimResults = false;
        rec.onresult = (e) => {
          const text = e.results[0][0].transcript;
          input.value = text;
          send(text);
        };
        rec.onerror = () => toast('Voice input isn’t available here. Type your message instead.');
        rec.start();
        toast('Listening…', 2000);
      } catch {
        toast('Voice input isn’t available here. Type your message instead.');
      }
    });
  }

  // ------------------------------------------------------------------ modes
  function setMode(m: Mode) {
    mode = m;
    modeSwitch.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
    document.body.dataset.mode = m;
    document.getElementById('dock-mode')!.textContent = `${MODE_LABEL[m]} mode · demo data`;
    renderCartChip();
    if (m === 'shopper') {
      setDock(true);
      if (mission && !mission.done) say(`Personal Shopper is on. I’ll guide you to each stop of your mission.`);
      else
        say('What are you shopping for today?', {
          chips: ['Just looking', 'I have a shopping list', 'An outfit for $200', 'A gift under $100'],
        });
    } else if (m === 'shopping') say('Shopping mode: your cart and budget stay with you. Ask me for anything.', { quiet: true });
    announce(`${MODE_LABEL[m]} mode`);
  }

  function setDock(open: boolean) {
    dock.hidden = !open;
    fab.hidden = open;
    if (open) {
      if (!log.children.length) render(welcome());
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }
  }

  function welcome(): Reply {
    return {
      text: 'Hi, I’m Scout. I can find products in this centre, compare them, keep you on budget and plan the quickest route. What do you need?',
      chips: ['Running shoes under $150', 'An outfit for a $200 budget', 'Birthday gift for my brother', 'I want a black hoodie', 'Phone under $800', 'Just looking'],
    };
  }

  // ------------------------------------------------------------------ conversation
  async function send(text: string) {
    const msg = text.trim();
    if (!msg) return;
    input.value = '';
    setDock(true);
    log.append(h('div', { class: 'msg me' }, msg));
    // Chips that are commands rather than questions.
    if (/^start mission$/i.test(msg) && lastMission) return startMission(lastMission);
    if (/^add all to cart$/i.test(msg) && lastIds.length) return addMany(lastIds);
    if (/^i have a shopping list$/i.test(msg)) {
      input.value = 'Buy: running shoes, black hoodie, birthday gift. Budget $300';
      return say('Great. Type your list like the example in the box (items separated by commas or new lines, plus a budget) and I’ll plan the quickest route.');
    }
    if (/^show comparison$/i.test(msg)) return openCompare();
    const thinking = h('div', { class: 'msg scout thinking', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {}));
    log.append(thinking);
    scrollLog();
    let reply: Reply;
    try {
      reply = await brain.respond(msg, ctx());
    } catch {
      reply = await localBrain.respond(msg, ctx());
    }
    thinking.remove();
    if (reply.budgetSet !== undefined && reply.budgetSet !== null) cart.setBudget(reply.budgetSet);
    render(reply);
    if (reply.addToCart) addMany(reply.addToCart);
    if (reply.navigate) d.navigate(reply.navigate);
    if (reply.compare) setCompare(reply.compare);
  }

  let lastMission: MissionPlan | null = null;
  let lastIds: string[] = [];

  function say(text: string, o: { chips?: string[]; quiet?: boolean } = {}) {
    render({ text, chips: o.chips }, o.quiet);
  }

  function render(r: Reply, quiet = false) {
    const el = h('div', { class: 'msg scout' }, h('p', {}, r.text));
    if (r.picks?.length) {
      lastIds = r.picks.map((p) => p.id);
      el.append(h('ul', { class: 'pick-list' }, r.picks.map((p) => pickCard(p.id, p.why))));
    }
    if (r.outfit) {
      lastIds = r.outfit.ids;
      el.append(budgetBar(r.outfit.total, r.outfit.budget));
    }
    if (r.compare) {
      el.append(
        h(
          'div',
          { class: 'actions' },
          button('Comparison table', () => openCompare(), { icon: 'deals', variant: 'small' }),
          button('Side by side in 3D', () => show3dCompare(), { variant: 'small ghost' }),
        ),
      );
    }
    if (r.mission) {
      lastMission = r.mission;
      lastIds = r.mission.items.map((i) => i.productId).filter(Boolean) as string[];
      el.append(missionCard(r.mission));
    }
    const chips = r.mission ? r.chips?.filter((c) => !/^(start mission|add all to cart)$/i.test(c)) : r.chips;
    if (chips?.length) {
      r = { ...r, chips };
      el.append(h('div', { class: 'chips reply-chips' }, chips.map((c) => h('button', { type: 'button', class: 'chip chip-btn' }, c))));
    }
    log.append(el);
    scrollLog();
    if (!quiet) {
      orb.speak();
      bubble.textContent = r.text.length > 140 ? `${r.text.slice(0, 137)}…` : r.text;
      bubbleUntil = elapsed + 6;
    }
  }

  function scrollLog() {
    requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
  }

  function pickCard(id: string, reason: string) {
    const p = productById(id)!;
    const inCmp = compareIds.includes(id);
    return h(
      'li',
      { class: 'pick' },
      h('span', { class: 'swatch mini', style: { background: `linear-gradient(135deg, ${p.color}, ${p.accent ?? p.color})` }, 'aria-hidden': 'true' }),
      h('div', { class: 'pick-main' }, h('strong', {}, p.name), h('small', {}, reason)),
      h(
        'div',
        { class: 'pick-actions' },
        button('Add', () => addToCart(id), { variant: 'small primary', ariaLabel: `Add ${p.name} to cart` }),
        button('View', () => d.openProduct(id), { variant: 'small ghost', ariaLabel: `View ${p.name}` }),
        button(inCmp ? '✓ Compare' : '+ Compare', () => toggleCompare(id), { variant: 'small ghost', ariaLabel: `${inCmp ? 'Remove' : 'Add'} ${p.name} ${inCmp ? 'from' : 'to'} comparison` }),
        button('Go', () => goToProduct(id), { variant: 'small ghost', ariaLabel: `Take me to ${p.name}` }),
      ),
    );
  }

  function budgetBar(total: number, budget: number) {
    const pct = Math.min(100, (total / budget) * 100);
    return h(
      'div',
      { class: 'budget-bar', role: 'img', 'aria-label': `${money(total)} of ${money(budget)} budget` },
      h('div', { class: `fill${total > budget ? ' over' : ''}`, style: { width: `${pct}%` } }),
      h('span', {}, `${money(total)} / ${money(budget)}`),
    );
  }

  function missionCard(m: MissionPlan) {
    const steps = [h('li', { class: 'tl start' }, h('strong', {}, 'Start'), h('small', {}, 'Where you are now'))];
    m.stops.forEach((s, i) => {
      const st = storeById(s.storeId)!;
      steps.push(
        h(
          'li',
          { class: 'tl' },
          h('strong', {}, `${i + 1}. ${st.name}`),
          h('small', {}, s.productIds.map((id) => `${productById(id)!.name} ${money(productById(id)!.price)}`).join(' · ')),
          d.isOpen(s.storeId) ? null : h('small', { class: 'warn' }, 'Closed right now'),
        ),
      );
    });
    steps.push(h('li', { class: 'tl end' }, h('strong', {}, 'Checkout & exit'), h('small', {}, 'Pay at each store (demo), then leave by the nearest exit')));
    const missing = m.items.filter((i) => !i.productId || i.note);
    return h(
      'div',
      { class: 'mission-card' },
      h(
        'dl',
        { class: 'mission-stats' },
        h('div', {}, h('dt', {}, 'Time'), h('dd', {}, `~${m.totalMinutes} min`)),
        h('div', {}, h('dt', {}, 'Walking'), h('dd', {}, `${m.walkMetres} m`)),
        h('div', {}, h('dt', {}, 'Total'), h('dd', {}, money(m.total))),
        h('div', {}, h('dt', {}, 'Stores'), h('dd', {}, String(m.stops.length))),
      ),
      m.budget !== null ? budgetBar(m.total, m.budget) : null,
      h('ol', { class: 'timeline' }, steps),
      missing.length ? h('ul', { class: 'notes' }, missing.map((i) => h('li', {}, `${i.query}: ${i.note}`))) : null,
      h(
        'div',
        { class: 'actions' },
        button('Start mission', () => startMission(m), { icon: 'walk', variant: 'small primary' }),
        button('Add all to cart', () => addMany(m.items.map((i) => i.productId).filter(Boolean) as string[]), { variant: 'small ghost' }),
      ),
    );
  }

  // ------------------------------------------------------------------ cart & smart budget
  function addMany(ids: string[]) {
    const total = ids.reduce((s, id) => s + (productById(id)?.price ?? 0), 0);
    const over = cart.overBy(total);
    if (over > 0) {
      say(`Adding all ${ids.length} would take you ${money(over)} over your ${money(cart.budget!)} budget. Add them one at a time and I’ll suggest swaps, or raise your budget.`, {
        chips: [`My budget is $${Math.ceil((cart.budget! + over) / 10) * 10}`],
      });
      setDock(true);
      return;
    }
    ids.forEach((id) => cart.add(id));
    toast(`Added ${ids.length} item${ids.length === 1 ? '' : 's'} · cart ${money(cart.total)}`);
  }

  /** Adds with a budget check; over budget, Scout offers cheaper similar items instead. */
  function addToCart(id: string, option?: string, force = false) {
    const p = productById(id);
    if (!p) return false;
    const over = cart.overBy(p.price);
    if (over > 0 && !force) {
      const remaining = cart.remaining ?? 0;
      const alts = cheaperAlternatives(id, remaining, ctx()).slice(0, 2);
      const kind = p.type.toLowerCase();
      const text =
        `That ${kind} would take you ${money(over)} over budget.` +
        (alts.length
          ? ` I found ${alts.length === 1 ? 'a similar option' : `${alts.length} similar options`} for ${alts.map((a) => money(a.price)).join(' and ')}.`
          : ` I couldn’t find anything similar within your remaining ${money(remaining)}.`);
      const el = h('div', { class: 'msg scout' }, h('p', {}, text));
      if (alts.length)
        el.append(
          h(
            'ul',
            { class: 'pick-list' },
            alts.map((a) =>
              h(
                'li',
                { class: 'pick' },
                h('span', { class: 'swatch mini', style: { background: a.color }, 'aria-hidden': 'true' }),
                h('div', { class: 'pick-main' }, h('strong', {}, a.name), h('small', {}, why(a, ctx(), `Save ${money(p.price - a.price)}`))),
                h('div', { class: 'pick-actions' }, button('Add instead', () => addToCart(a.id), { variant: 'small primary' }), button('View', () => d.openProduct(a.id), { variant: 'small ghost' })),
              ),
            ),
          ),
        );
      el.append(h('div', { class: 'actions' }, button(`Add ${p.name} anyway`, () => addToCart(id, option, true), { variant: 'small ghost' })));
      setDock(true);
      log.append(el);
      scrollLog();
      orb.speak();
      bubble.textContent = text;
      bubbleUntil = elapsed + 6;
      announce(text);
      setLastPicks(alts.map((a) => a.id));
      return false;
    }
    cart.add(id, option);
    const rem = cart.remaining;
    toast(`Added ${p.name}${option ? ` (${option})` : ''} · cart ${money(cart.total)}${rem !== null ? ` · ${money(rem)} left` : ''}`);
    if (mission && !mission.done) checkStopComplete();
    return true;
  }

  function renderCartChip() {
    cartChip.innerHTML = '';
    const b = cart.budget;
    cartChip.append(icon('cart', 18), h('span', { class: 'cc-count' }, String(cart.count)), h('span', {}, money(cart.total)));
    if (b !== null) {
      const pct = Math.min(100, (cart.total / b) * 100);
      cartChip.append(h('span', { class: 'cc-budget' }, h('span', { class: `cc-fill${cart.total > b ? ' over' : ''}`, style: { width: `${pct}%` } })), h('small', {}, `${money(Math.max(0, b - cart.total))} left`));
    }
    cartChip.setAttribute('aria-label', `Cart: ${cart.count} items, ${money(cart.total)}${b !== null ? `, ${money(b - cart.total)} of ${money(b)} budget left` : ''}. Open cart.`);
    cartChip.hidden = mode === 'explore' && cart.count === 0;
  }
  cart.addEventListener('change', renderCartChip);
  renderCartChip();

  function openCart() {
    const body = h('div', { class: 'view' });
    const draw = () => {
      body.innerHTML = '';
      const budgetInput = h('input', { id: 'cart-budget', type: 'number', min: '0', step: '10', class: 'select', value: cart.budget ?? '', placeholder: 'e.g. 250' }) as HTMLInputElement;
      body.append(
        h(
          'div',
          { class: 'budget-row' },
          h('label', { for: 'cart-budget' }, h('strong', {}, 'Shopping budget')),
          budgetInput,
          button('Set', () => {
            cart.setBudget(Number(budgetInput.value) || null);
            draw();
          }, { variant: 'small' }),
        ),
      );
      if (cart.budget !== null) body.append(budgetBar(cart.total, cart.budget));
      if (!cart.count) body.append(h('p', { class: 'muted' }, 'Your cart is empty. Ask Scout or open a product and choose Add to Cart.'));
      else {
        body.append(
          h(
            'table',
            { class: 'cart-table' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Product'), h('th', {}, 'Store'), h('th', { class: 'num' }, 'Price'), h('th', { class: 'num' }, 'Qty'), h('th', {}, h('span', { class: 'sr-only' }, 'Remove')))),
            h(
              'tbody',
              {},
              cart.products().map(({ p, line }, i) =>
                h(
                  'tr',
                  {},
                  h('td', {}, h('button', { type: 'button', class: 'link', onclick: () => d.openProduct(p.id) }, p.name), line.option ? h('small', { class: 'muted' }, ` ${line.option}`) : null),
                  h('td', {}, storeById(p.storeId)!.name),
                  h('td', { class: 'num' }, money(p.price * line.qty)),
                  h(
                    'td',
                    { class: 'num qty' },
                    h('button', { type: 'button', class: 'qty-btn', 'aria-label': `Decrease ${p.name}`, onclick: () => (cart.setQty(i, line.qty - 1), draw()) }, '−'),
                    h('span', {}, String(line.qty)),
                    h('button', { type: 'button', class: 'qty-btn', 'aria-label': `Increase ${p.name}`, onclick: () => (cart.setQty(i, line.qty + 1), draw()) }, '+'),
                  ),
                  h('td', {}, h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove ${p.name}`, onclick: () => (cart.remove(i), draw()) }, icon('close', 16))),
                ),
              ),
            ),
            h(
              'tfoot',
              {},
              h('tr', {}, h('th', { colspan: '2' }, 'Estimated total'), h('td', { class: 'num' }, h('strong', {}, money(cart.total))), h('td', { colspan: '2' })),
              cart.budget !== null
                ? h('tr', {}, h('th', { colspan: '2' }, 'Remaining budget'), h('td', { class: `num ${cart.total > cart.budget ? 'over' : ''}` }, money(cart.budget - cart.total)), h('td', { colspan: '2' }))
                : null,
            ),
          ),
        );
        body.append(
          h(
            'div',
            { class: 'actions' },
            button('Plan my route', () => {
              closePanel();
              send('plan a route for my cart');
            }, { icon: 'route', variant: 'primary' }),
            button('Clear cart', () => (cart.clear(), draw()), { variant: 'ghost' }),
          ),
        );
      }
      body.append(h('p', { class: 'muted small' }, 'Demo cart: prices are fictional and nothing is charged. In a real centre this would hand over to each retailer’s checkout or click-and-collect.'));
    };
    draw();
    openPanel({ title: 'Your cart', subtitle: `${cart.count} item${cart.count === 1 ? '' : 's'}`, body });
  }

  // ------------------------------------------------------------------ comparison
  function setCompare(ids: string[]) {
    compareIds = ids.slice(0, 3);
    renderTray();
  }
  function toggleCompare(id: string) {
    if (compareIds.includes(id)) compareIds = compareIds.filter((x) => x !== id);
    else {
      if (compareIds.length >= 3) compareIds.shift();
      compareIds.push(id);
      toast(`${productById(id)!.name} added to comparison (${compareIds.length}/3)`);
    }
    renderTray();
  }
  function renderTray() {
    compareTray.innerHTML = '';
    compareTray.hidden = compareIds.length === 0;
    compareTray.append(
      h('strong', {}, `Compare (${compareIds.length}/3)`),
      ...compareIds.map((id) =>
        h('button', { type: 'button', class: 'tray-item', 'aria-label': `Remove ${productById(id)!.name} from comparison`, onclick: () => toggleCompare(id) }, productById(id)!.name, ' ×'),
      ),
      button('Compare', () => openCompare(), { variant: 'small primary' }),
      button('3D', () => show3dCompare(), { variant: 'small ghost', ariaLabel: 'Show comparison side by side in 3D' }),
    );
  }

  function openCompare() {
    if (compareIds.length < 2) {
      toast('Add at least two products to compare (use “+ Compare”).');
      return;
    }
    const ps = compareIds.map((id) => productById(id)!);
    const cheapest = Math.min(...ps.map((p) => p.price));
    const row = (label: string, cells: (Node | string)[]) => h('tr', {}, h('th', { scope: 'row' }, label), cells.map((c) => h('td', {}, c)));
    const allFeatures = ps.map((p) => new Set(featuresOf(p)));
    const table = h(
      'table',
      { class: 'compare-table' },
      h('thead', {}, h('tr', {}, h('th', {}, h('span', { class: 'sr-only' }, 'Attribute')), ps.map((p) => h('th', { scope: 'col' }, p.name)))),
      h(
        'tbody',
        {},
        row('Price', ps.map((p) => `${money(p.price)}${p.price === cheapest ? ' · cheapest' : ''}`)),
        row('Rating', ps.map((p) => `★ ${p.rating?.toFixed(1)} (${p.reviews} demo reviews)`)),
        row('Features', ps.map((p, i) => h('ul', { class: 'bullets' }, featuresOf(p).map((f) => h('li', { class: allFeatures.every((s, j) => j === i || !s.has(f)) ? 'unique' : '' }, f))))),
        row('Colour', ps.map((p) => (p.colors?.length ? p.colors.join(', ') : '—'))),
        row('Availability', ps.map((p) => `${p.availability}${d.isOpen(p.storeId) ? '' : ' (store closed now)'}`)),
        row('Store', ps.map((p) => {
          const dist = distanceTo(p.storeId);
          return `${storeById(p.storeId)!.name}${dist !== null ? ` · ${Math.round(dist)} m` : ''}`;
        })),
        row('Difference', ps.map((p) => (p.price === cheapest ? 'Lowest price' : `+${money(p.price - cheapest)}`))),
        row('', ps.map((p) =>
          h('div', { class: 'cell-actions' }, button('Add to cart', () => addToCart(p.id), { variant: 'small primary' }), button('Go', () => goToProduct(p.id), { variant: 'small ghost' }), button('Remove', () => (toggleCompare(p.id), openCompare()), { variant: 'small ghost' })),
        )),
      ),
    );
    openPanel({
      title: 'Compare products',
      subtitle: `${ps.length} products · demo ratings`,
      variant: 'wide',
      body: h(
        'div',
        { class: 'view' },
        h('p', { class: 'compare-summary' }, compareText(compareIds)),
        h('div', { class: 'table-scroll' }, table),
        h('div', { class: 'actions' }, button('View side by side in 3D', () => show3dCompare(), { variant: 'primary' })),
        h('p', { class: 'muted small' }, 'Features only one product has are highlighted.'),
      ),
    });
  }

  function show3dCompare() {
    if (compareIds.length < 2) {
      toast('Add at least two products to compare.');
      return;
    }
    const go = () => {
      closePanel();
      compare3d.show(compareIds.map((id) => productById(id)!), d.player.x, d.player.z, d.player.yaw);
      syncPickables();
      closeBtn3d.hidden = false;
      say('Here they are side by side. Select any of them for details.', { quiet: false });
    };
    if (d.inMall()) go();
    else d.enterMall(go);
  }
  const closeBtn3d = h('button', { type: 'button', class: 'btn small close-3d', hidden: true, onclick: () => hide3d() }, 'Close comparison display');
  hud.append(closeBtn3d);
  function hide3d() {
    compare3d.hide();
    syncPickables();
    closeBtn3d.hidden = true;
  }
  let extraPicks: THREE.Object3D[] = [];
  function syncPickables() {
    for (const o of extraPicks) {
      const i = d.pickables.indexOf(o);
      if (i >= 0) d.pickables.splice(i, 1);
    }
    extraPicks = [...compare3d.pickables];
    d.pickables.unshift(...extraPicks);
  }

  // ------------------------------------------------------------------ missions / personal shopper
  function goToProduct(id: string) {
    const p = productById(id)!;
    d.routeTo(productApproach(p), `${p.name} at ${storeById(p.storeId)!.name}`, { productId: id });
  }

  function startMission(plan: MissionPlan) {
    if (!plan.stops.length) {
      say('There’s nothing to collect on this mission yet.');
      return;
    }
    mission = { plan, leg: 0, announced20: false, done: false };
    const go = () => {
      setMode('shopper');
      goToLeg(0);
    };
    if (d.inMall()) go();
    else d.enterMall(go);
  }

  function currentStop() {
    return mission && !mission.done ? mission.plan.stops[mission.leg] : undefined;
  }

  function goToLeg(i: number) {
    if (!mission) return;
    mission.leg = i;
    mission.announced20 = false;
    const stop = mission.plan.stops[i];
    if (!stop) return finishMission();
    const st = storeById(stop.storeId)!;
    const first = productById(stop.productIds[0])!;
    const names = stop.productIds.map((id) => productById(id)!.name).join(' and ');
    const dist = walkDistance(productApproach(first));
    d.routeTo(productApproach(first), st.name, { productId: first.id, onArrive: () => arrivedAtStop() });
    say(`Stop ${i + 1} of ${mission.plan.stops.length}: ${st.name} for ${names}.${dist !== null ? ` It’s about ${Math.round(dist)} metres away.` : ''}${d.isOpen(st.id) ? '' : ' Heads up: it’s closed right now.'}`);
    renderMissionBar();
  }

  function arrivedAtStop() {
    const stop = currentStop();
    if (!stop || !mission) return;
    const ps = stop.productIds.map((id) => productById(id)!);
    d.highlight(ps[0].id);
    const what = ps.length === 1 ? `The ${ps[0].type.toLowerCase()} you wanted is` : `The items you wanted are`;
    const next = mission.plan.stops[mission.leg + 1];
    render({
      text: `${what} available here: ${ps.map((p) => `${p.name} (${money(p.price)})`).join(', ')}.${next ? ` After this store, your next stop is ${storeById(next.storeId)!.name}.` : ' This is your last stop.'}`,
      picks: ps.map((p) => ({ id: p.id, why: why(p, ctx(), p.stockNote) })),
    });
    setDock(true);
    renderMissionBar();
  }

  function checkStopComplete() {
    const stop = currentStop();
    if (!stop) return;
    if (stop.productIds.every((id) => cart.has(id))) {
      const next = mission!.plan.stops[mission!.leg + 1];
      say(next ? `Got everything here. Next stop: ${storeById(next.storeId)!.name}.` : 'That’s everything on your list.', { chips: [next ? 'Next stop' : 'Finish mission'] });
    }
  }

  function finishMission() {
    if (!mission) return;
    mission.done = true;
    const exits = FACILITIES.filter((f) => f.kind === 'entrance' || f.kind === 'parking');
    let best = exits[0];
    let bd = Infinity;
    for (const f of exits) {
      const dist = walkDistance(f.approach ?? { x: f.x, z: f.z }) ?? Infinity;
      if (dist < bd) {
        bd = dist;
        best = f;
      }
    }
    d.routeTo(best.approach ?? { x: best.x, z: best.z }, best.name, {});
    say(`Mission complete: ${cart.count} item${cart.count === 1 ? '' : 's'} in your cart for ${money(cart.total)}. The nearest exit is ${best.name}; I’ve drawn the way.`);
    renderMissionBar();
  }

  function renderMissionBar() {
    missionBar.innerHTML = '';
    missionBar.hidden = !mission;
    if (!mission) return;
    const m = mission;
    const stop = currentStop();
    missionBar.append(
      h('span', { class: 'mb-label' }, 'Mission'),
      h('strong', {}, m.done ? 'Complete' : `Stop ${m.leg + 1}/${m.plan.stops.length}: ${storeById(stop!.storeId)!.name}`),
      h('span', { class: 'mb-dist', id: 'mission-dist' }),
      m.done ? '' : button(m.leg + 1 < m.plan.stops.length ? 'Next stop' : 'Finish', () => (m.leg + 1 < m.plan.stops.length ? goToLeg(m.leg + 1) : finishMission()), { variant: 'small primary' }),
      button('Plan', () => {
        setDock(true);
        render({ text: 'Your mission plan:', mission: m.plan }, true);
      }, { variant: 'small ghost' }),
      button('End', () => {
        mission = null;
        d.clearRoute();
        d.highlight(null);
        renderMissionBar();
        announce('Mission ended');
      }, { variant: 'small ghost', ariaLabel: 'End mission' }),
    );
  }

  // Chip commands for mission flow.
  const baseSend = send;
  async function sendWithCommands(text: string) {
    if (/^next stop$/i.test(text.trim()) && mission && !mission.done) return goToLeg(mission.leg + 1);
    if (/^finish mission$/i.test(text.trim()) && mission) return finishMission();
    return baseSend(text);
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    sendWithCommands(input.value);
  };
  // Re-bind chip clicks to the command-aware sender.
  log.addEventListener(
    'click',
    (e) => {
      const b = (e.target as HTMLElement).closest('.reply-chips button') as HTMLButtonElement | null;
      if (!b) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      sendWithCommands(b.textContent ?? '');
    },
    true,
  );

  // ------------------------------------------------------------------ per-frame
  let tick = 0;
  let lastStore: string | undefined;
  function update(dt: number, t: number, w: number, hgt: number) {
    elapsed += dt;
    const rm = d.reducedMotion();
    orb.group.visible = d.inMall();
    orb.update(dt, t, d.player.x, d.player.z, d.player.yaw, rm);
    compare3d.update(dt, rm);
    // Speech bubble follows the orb.
    if (elapsed < bubbleUntil && d.inMall() && dock.hidden) {
      const sp = orb.screenPos(d.camera, w, hgt);
      bubble.hidden = !sp;
      if (sp) bubble.style.transform = `translate(${Math.min(w - 300, Math.max(8, sp.x - 140))}px, ${Math.max(70, sp.y - 20)}px) translateY(-100%)`;
    } else bubble.hidden = true;

    tick += dt;
    if (tick < 1) return;
    tick = 0;
    // Personal Shopper: proactive guidance while walking a mission.
    const stop = currentStop();
    if (stop && mission) {
      const first = productById(stop.productIds[0])!;
      const dist = walkDistance(productApproach(first));
      const distEl = document.getElementById('mission-dist');
      if (distEl && dist !== null) distEl.textContent = `${Math.round(dist)} m`;
      if (mode === 'shopper' && dist !== null && dist < 21 && dist > 6 && !mission.announced20) {
        mission.announced20 = true;
        say(`You’re ${Math.round(dist / 5) * 5} metres from ${storeById(stop.storeId)!.name}.`);
      }
    }
    // Entering a store with something you looked at or want.
    const inside = storeAt(d.player.x, d.player.z);
    if (inside !== lastStore) {
      lastStore = inside;
      if (inside && mode !== 'explore') {
        const st = storeById(inside)!;
        if (!d.isOpen(inside)) say(`${st.name} is closed right now.`);
        else if (mode === 'shopper' && !stop) {
          const seen = viewed.map((id) => productById(id)!).filter((p) => p.storeId === inside);
          const wanted = lastIds.map((id) => productById(id)!).filter((p) => p && p.storeId === inside);
          const hit = wanted[0] ?? seen[0];
          if (hit) {
            d.highlight(hit.id);
            say(`${hit.name} is here, on the highlighted display. ${money(hit.price)}, ${hit.stockNote.toLowerCase()}.`);
          }
        }
      }
    }
  }

  return {
    cart,
    orb,
    update,
    addToCart: (id: string, option?: string) => addToCart(id, option),
    toggleCompare,
    inCompare: (id: string) => compareIds.includes(id),
    openCart,
    openCompare,
    openCompanion: () => setDock(true),
    ask: (text: string) => sendWithCommands(text),
    setMode,
    get mode() {
      return mode;
    },
    setBrain(b: CompanionBrain) {
      brain = b;
    },
    onProductViewed(id: string) {
      const i = viewed.indexOf(id);
      if (i >= 0) viewed.splice(i, 1);
      viewed.unshift(id);
      if (viewed.length > 12) viewed.pop();
    },
    showWelcomeHint() {
      fab.hidden = false;
    },
    context: ctx,
    say,
    startMission,
    planForCart: () => planForProducts(cart.lines.map((l) => l.productId), cart.budget, ctx()),
    get mission() {
      return mission;
    },
  };
}

export type Shopping = ReturnType<typeof initShopping>;

function storeAt(x: number, z: number) {
  for (const st of STORES) if (x > st.rect.x1 && x < st.rect.x2 && z > st.rect.z1 && z < st.rect.z2) return st.id;
  return undefined;
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
  onerror: () => void;
  start(): void;
}

function micIcon() {
  const s = document.createElement('span');
  s.className = 'icon';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  return s;
}
