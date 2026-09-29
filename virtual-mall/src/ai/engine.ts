import {
  ALL_PRODUCTS,
  FACILITIES,
  PROMOTIONS,
  STORES,
  featuresOf,
  money,
  productById,
  storeById,
  type PlaceRef,
  type Product,
} from '../data/mall';
import type { Cart } from '../shop/cart';

/**
 * The shopping companion's "brain".
 *
 * It is a deterministic, offline language understander + recommender that
 * can only ever return products that exist in the centre's catalogue: every
 * answer is built from catalogue records, never generated free-form. A
 * language model can be plugged in through `CompanionBrain` (see
 * llm-brain.ts); its output is validated against the same catalogue.
 */

export interface EngineContext {
  cart: Cart;
  /** Live opening status (simulated in the prototype). */
  isOpen(storeId: string): boolean;
  /** Walking distance in metres from the shopper to a store, if known. */
  distanceTo(storeId: string): number | null;
  /** Products the shopper opened this session (most recent first). */
  viewed: string[];
  /** Products highlighted by the current virtual event, if any. */
  eventProductIds: string[];
  eventName: string | null;
  /** Orders stores into the shortest walk (start → stores → exit). */
  routeFor(storeIds: string[]): { order: string[]; metres: number };
}

export interface Pick {
  id: string;
  why: string;
}

export interface MissionItem {
  query: string;
  productId?: string;
  alternatives: string[];
  note?: string;
}

export interface MissionPlan {
  items: MissionItem[];
  budget: number | null;
  total: number;
  overBudget: number;
  stops: { storeId: string; productIds: string[] }[];
  walkMetres: number;
  walkMinutes: number;
  shopMinutes: number;
  totalMinutes: number;
}

export interface Reply {
  text: string;
  picks?: Pick[];
  compare?: string[];
  outfit?: { ids: string[]; total: number; budget: number };
  mission?: MissionPlan;
  chips?: string[];
  budgetSet?: number | null;
  navigate?: PlaceRef;
  addToCart?: string[];
}

export interface CompanionBrain {
  respond(message: string, ctx: EngineContext): Promise<Reply>;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9$.\s-]+/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
const stem = (w: string) => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ch|sh|x)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};
const words = (t: string) =>
  norm(t)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(stem);

const STOP = new Set(
  'i im a an the for to of and or in on at with me my need want looking look find get buy some any something please can you could would like show under below less than max maximum up budget cost costs about around is are it its this that there where which what good best nice new help also just have has do does dollar dollars price priced cheap cheaper expensive one ones pair pairs item items thing things store shop mall today really want gift gifts present presents birthday brother sister mum mom dad father mother friend partner wife husband boyfriend girlfriend son daughter kid kids him her them their he she they outfit outfits wear total spend spending'
    .split(' ')
    .map(stem),
);

const SYN: Record<string, string[]> = {
  sneaker: ['shoe'],
  trainer: ['shoe'],
  runner: ['running', 'shoe'],
  shoe: ['shoe'],
  mobile: ['phone'],
  cell: ['phone'],
  smartphone: ['phone'],
  iphone: ['phone'],
  jumper: ['hoodie'],
  sweatshirt: ['hoodie'],
  sweater: ['hoodie'],
  hoody: ['hoodie'],
  pant: ['jean', 'chino'],
  trouser: ['jean', 'chino'],
  denim: ['jean', 'denim'],
  television: ['tv'],
  earphone: ['earbud', 'headphone'],
  headset: ['headphone'],
  notebook: ['laptop'],
  computer: ['laptop'],
  macbook: ['laptop'],
  fragrance: ['perfume'],
  scent: ['perfume'],
  cologne: ['perfume'],
  makeup: ['lipstick', 'makeup'],
  skin: ['skincare'],
  moisturizer: ['moisturiser'],
  top: ['shirt', 'tee'],
  tshirt: ['tee'],
  't-shirt': ['tee'],
  playstation: ['console'],
  xbox: ['console'],
  record: ['vinyl'],
};

const COLORS = ['black', 'white', 'red', 'blue', 'navy', 'green', 'pink', 'purple', 'grey', 'gray', 'silver', 'orange', 'yellow', 'beige', 'tan', 'brown', 'cream', 'indigo'];
const INTERESTS: Record<string, string[]> = {
  running: ['running', 'run', 'runner', 'marathon', 'jog', 'jogging'],
  fitness: ['gym', 'fitness', 'workout', 'training', 'sport', 'sporty', 'exercise'],
  gaming: ['gaming', 'gamer', 'game', 'games', 'video games', 'console'],
  music: ['music', 'musician', 'vinyl', 'audio', 'listening'],
  tech: ['tech', 'techie', 'gadget', 'gadgets', 'technology', 'nerd'],
  fashion: ['fashion', 'style', 'stylish', 'clothes', 'streetwear'],
  sneakers: ['sneakerhead', 'sneakers', 'kicks'],
  beauty: ['beauty', 'makeup', 'cosmetics', 'skincare', 'pamper'],
  movies: ['movies', 'films', 'cinema', 'tv shows', 'netflix'],
  outdoors: ['outdoors', 'hiking', 'camping', 'beach'],
  art: ['art', 'drawing', 'painting', 'design'],
};

export function parseMoney(text: string) {
  const t = norm(text);
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, ''));
  let max: number | undefined;
  let budget: number | undefined;
  const m1 = t.match(/(?:under|below|less than|max(?:imum)?|up to|no more than|cheaper than|within|<)\s*\$?\s*(\d+(?:\.\d+)?)/);
  if (m1) max = num(m1[1]);
  const m2 = t.match(/budget(?:\s+(?:of|is|to))?\s*:?\s*\$?\s*(\d+(?:\.\d+)?)/) ?? t.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:dollar\s*)?budget/);
  if (m2) budget = num(m2[1]);
  const lone = t.match(/\$\s*(\d+(?:\.\d+)?)/);
  const loneValue = lone ? num(lone[1]) : undefined;
  return { max, budget, lone: loneValue };
}

export function parseColors(text: string) {
  const w = norm(text).split(/\s+/);
  return COLORS.filter((c) => w.includes(c)).map((c) => (c === 'gray' ? 'grey' : c));
}

export function parseInterests(text: string) {
  const t = ` ${norm(text)} `;
  return Object.entries(INTERESTS)
    .filter(([, keys]) => keys.some((k) => t.includes(` ${k} `) || t.includes(` ${k}s `)))
    .map(([k]) => k);
}

// ---------------------------------------------------------------------------
// Catalogue search
// ---------------------------------------------------------------------------
interface Doc {
  p: Product;
  strong: string[];
  weak: string[];
}
const DOCS: Doc[] = ALL_PRODUCTS.map((p) => {
  const s = storeById(p.storeId)!;
  return {
    p,
    strong: words(`${p.type} ${p.tags.join(' ')} ${p.name}`),
    weak: words(`${p.description} ${s.name} ${s.categories.join(' ')} ${(p.interests ?? []).join(' ')}`),
  };
});

function contentTokens(text: string) {
  const out: string[] = [];
  for (const w of words(text)) {
    if (STOP.has(w) || COLORS.includes(w) || /^\$?\d/.test(w)) continue;
    out.push(w, ...(SYN[w] ?? []));
  }
  return [...new Set(out)];
}

export interface FindOptions {
  max?: number;
  colors?: string[];
  openOnly?: boolean;
  ctx?: EngineContext;
}

/** Ranks catalogue products for free text. Returns [] when nothing genuinely matches. */
export function findProducts(text: string, o: FindOptions = {}): { p: Product; score: number }[] {
  const tokens = contentTokens(text);
  if (!tokens.length) return [];
  const scored: { p: Product; score: number }[] = [];
  for (const d of DOCS) {
    let score = 0;
    let hits = 0;
    for (const t of tokens) {
      if (d.strong.some((w) => w === t)) {
        score += 3;
        hits++;
      } else if (d.strong.some((w) => w.startsWith(t) && t.length >= 3)) {
        score += 2;
        hits++;
      } else if (d.weak.some((w) => w === t)) score += 0.6;
    }
    if (!hits) continue;
    if (o.colors?.length) {
      const match = o.colors.some((c) => d.p.colors?.includes(c));
      if (!match) continue;
      score += 2;
    }
    if (o.max !== undefined && d.p.price > o.max) continue;
    if (o.openOnly && o.ctx && !o.ctx.isOpen(d.p.storeId)) continue;
    score += (d.p.rating ?? 4) * 0.25;
    scored.push({ p: d.p, score });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  const best = scored[0].score;
  return scored.filter((s) => s.score >= best * 0.6);
}

/** Same-kind products that cost less, most similar first. */
export function cheaperAlternatives(id: string, maxPrice: number, ctx?: EngineContext) {
  const base = productById(id);
  if (!base) return [];
  const baseWords = new Set(words(`${base.type} ${base.tags.join(' ')}`));
  return ALL_PRODUCTS.filter((p) => p.id !== id && p.price <= maxPrice && p.price < base.price)
    .map((p) => {
      const w = words(`${p.type} ${p.tags.join(' ')}`);
      let sim = w.filter((x) => baseWords.has(x)).length;
      if (p.role && p.role === base.role) sim += 2;
      if (p.type === base.type) sim += 3;
      if (ctx && !ctx.isOpen(p.storeId)) sim -= 1;
      return { p, sim };
    })
    .filter((x) => x.sim >= 3)
    .sort((a, b) => b.sim - a.sim || b.p.rating! - a.p.rating!)
    .map((x) => x.p);
}

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------
export function why(p: Product, ctx?: EngineContext, extra?: string) {
  const s = storeById(p.storeId)!;
  const bits = [money(p.price) + (p.wasPrice ? ` (was ${money(p.wasPrice)})` : ''), `${p.rating?.toFixed(1)}★`];
  bits.push(p.availability === 'In stock' ? 'in stock' : p.availability.toLowerCase());
  const d = ctx?.distanceTo(p.storeId);
  bits.push(`${s.name}${d !== null && d !== undefined ? `, ${Math.round(d)} m away` : ''}`);
  if (ctx && !ctx.isOpen(p.storeId)) bits.push('store closed right now');
  if (extra) bits.unshift(extra);
  return bits.join(' · ');
}

export function compareText(ids: string[]) {
  const ps = ids.map((id) => productById(id)!).filter(Boolean);
  if (ps.length < 2) return 'Add at least two products to compare.';
  const byPrice = [...ps].sort((a, b) => a.price - b.price);
  const byRating = [...ps].sort((a, b) => b.rating! - a.rating!);
  const out: string[] = [];
  const cheap = byPrice[0];
  const dear = byPrice[byPrice.length - 1];
  out.push(`${cheap.name} is the cheapest at ${money(cheap.price)}; ${dear.name} costs ${money(dear.price - cheap.price)} more.`);
  if (byRating[0].rating! > byRating[byRating.length - 1].rating!)
    out.push(`${byRating[0].name} has the best rating (${byRating[0].rating!.toFixed(1)}★ from ${byRating[0].reviews} demo reviews).`);
  else out.push('They are rated about the same.');
  const all = ps.map((p) => new Set(featuresOf(p)));
  ps.forEach((p, i) => {
    const unique = featuresOf(p).filter((f) => all.every((s, j) => j === i || !s.has(f)));
    if (unique.length) out.push(`Only ${p.name}: ${unique.slice(0, 3).join(', ')}.`);
  });
  const notIn = ps.filter((p) => p.availability !== 'In stock');
  if (notIn.length) out.push(notIn.map((p) => `${p.name} is ${p.availability.toLowerCase()}`).join('; ') + '.');
  const stores = new Set(ps.map((p) => p.storeId));
  out.push(stores.size === 1 ? `All are in ${storeById(ps[0].storeId)!.name}.` : `They are in ${stores.size} different stores.`);
  const value = [...ps].sort((a, b) => b.rating! / b.price - a.rating! / a.price)[0];
  out.push(`Best value for money: ${value.name}.`);
  return out.join(' ');
}

/** A store promotion that actually applies to this product (its words overlap the product's type/tags). */
export function promoFor(p: Product) {
  const pw = new Set(words(`${p.type} ${p.tags.join(' ')}`));
  return PROMOTIONS.find((x) => x.placeId === p.storeId && words(x.title).some((w) => !STOP.has(w) && w.length > 2 && pw.has(w)));
}

// ---------------------------------------------------------------------------
// Outfits, gifts, discovery
// ---------------------------------------------------------------------------
export function buildOutfit(budget: number, colors: string[], ctx: EngineContext) {
  const ok = (p: Product) => ctx.isOpen(p.storeId) && p.availability !== 'Online only';
  const tops = ALL_PRODUCTS.filter((p) => (p.role === 'top' || p.role === 'outerwear') && ok(p));
  const bottoms = ALL_PRODUCTS.filter((p) => p.role === 'bottom' && ok(p));
  const shoes = ALL_PRODUCTS.filter((p) => p.role === 'shoes' && ok(p));
  const colorBonus = (p: Product) => (colors.length && colors.some((c) => p.colors?.includes(c)) ? 1.5 : 0);
  let best: { set: Product[]; score: number; total: number } | null = null;
  let cheapest = Infinity;
  for (const t of tops)
    for (const b of bottoms)
      for (const s of shoes) {
        const total = t.price + b.price + s.price;
        cheapest = Math.min(cheapest, total);
        if (total > budget) continue;
        const stores = new Set([t.storeId, b.storeId, s.storeId]).size;
        const score = t.rating! + b.rating! + s.rating! + colorBonus(t) + colorBonus(b) + colorBonus(s) - stores * 0.15 + (total / budget) * 0.8;
        if (!best || score > best.score) best = { set: [t, b, s], score, total };
      }
  if (!best) return { set: [] as Product[], total: 0, cheapest };
  const left = budget - best.total;
  const acc = ALL_PRODUCTS.filter((p) => p.role === 'accessory' && p.price <= left && ok(p)).sort((a, b) => b.rating! - a.rating!)[0];
  if (acc) {
    best.set.push(acc);
    best.total += acc.price;
  }
  return { set: best.set, total: best.total, cheapest };
}

/** Default ceiling for gift ideas when the shopper hasn't named a budget. */
export const DEFAULT_GIFT_MAX = 150;

export function giftIdeas(max: number | undefined, interests: string[], ctx: EngineContext, count = 4) {
  const cap = max ?? DEFAULT_GIFT_MAX;
  const list = ALL_PRODUCTS.filter((p) => p.gift && p.price <= cap && ctx.isOpen(p.storeId))
    .map((p) => {
      const overlap = interests.filter((i) => p.interests?.includes(i)).length;
      const promo = p.wasPrice || promoFor(p) ? 0.2 : 0;
      return { p, overlap, score: overlap * 3 + p.rating! + promo + (ctx.eventProductIds.includes(p.id) ? 0.5 : 0) };
    })
    .filter((x) => !interests.length || x.overlap > 0)
    .sort((a, b) => b.score - a.score);
  // Prefer variety across stores.
  const out: Product[] = [];
  const seen = new Set<string>();
  for (const { p } of list) if (!seen.has(p.storeId) && out.length < count) (out.push(p), seen.add(p.storeId));
  for (const { p } of list) if (!out.includes(p) && out.length < count) out.push(p);
  return out;
}

/**
 * "Just looking": products surfaced only from budget, chosen categories,
 * what was viewed in this session, promotions and the current event.
 * No personal or sensitive attributes are used.
 */
export function discover(ctx: EngineContext, opts: { max?: number; categories?: string[] } = {}) {
  const viewed = ctx.viewed.map((id) => productById(id)!).filter(Boolean);
  const viewedInterests = new Set(viewed.flatMap((p) => p.interests ?? []));
  const scored = ALL_PRODUCTS.filter((p) => !ctx.viewed.includes(p.id) && (opts.max === undefined || p.price <= opts.max) && ctx.isOpen(p.storeId)).map((p) => {
    const s = storeById(p.storeId)!;
    let score = p.rating!;
    let reason = `Top rated in ${s.categories[0]}`;
    if (ctx.eventProductIds.includes(p.id)) {
      score += 2;
      reason = `Featured at ${ctx.eventName}`;
    } else if (p.wasPrice) {
      score += 1.2;
      reason = `On promotion: was ${money(p.wasPrice)}`;
    } else if (promoFor(p)) {
      score += 0.8;
      reason = promoFor(p)!.title;
    }
    const overlap = (p.interests ?? []).filter((i) => viewedInterests.has(i));
    if (overlap.length) {
      score += 1 + overlap.length * 0.3;
      const from = viewed.find((v) => v.interests?.some((i) => overlap.includes(i)));
      if (from) reason = `Because you looked at ${from.name}`;
    }
    if (opts.categories?.length && !s.categories.some((c) => opts.categories!.includes(c.toLowerCase()))) score -= 5;
    return { p, score, reason };
  });
  scored.sort((a, b) => b.score - a.score);
  const out: { p: Product; reason: string }[] = [];
  const perStore = new Map<string, number>();
  for (const x of scored) {
    const n = perStore.get(x.p.storeId) ?? 0;
    if (n >= 2) continue;
    perStore.set(x.p.storeId, n + 1);
    out.push(x);
    if (out.length >= 6) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------
const MINUTES_PER_STORE = 6;
const MINUTES_PER_ITEM = 3;
const WALK_SPEED = 1.2; // m/s, relaxed shopping pace

export function parseMissionItems(text: string): string[] {
  let body = text.replace(/^[\s\S]*?\b(buy|get|shopping list|list|mission)\b\s*:?/i, '');
  body = body.replace(/budget\s*:?\s*\$?\s*\d+(\.\d+)?/gi, '').replace(/\$\s*\d+(\.\d+)?\s*budget/gi, '');
  return body
    .split(/\n|,|;|•|\*|\s-\s|^-|\band\b/gi)
    .map((s) => s.replace(/^[\s\-–—•*]+|[\s.]+$/g, '').trim())
    .filter((s) => s.length > 1 && !/^(buy|get)$/i.test(s));
}

export function looksLikeMission(text: string) {
  const t = text.toLowerCase();
  const bullets = (text.match(/^\s*[-*•]\s*\S/gm) ?? []).length;
  return bullets >= 2 || /\b(shopping list|my list|mission|plan my|plan a trip|buy:)/.test(t) || (/\bbuy\b/.test(t) && /,|\band\b/.test(t) && /budget/.test(t));
}

function candidatesFor(item: string, ctx: EngineContext): Product[] {
  const lower = item.toLowerCase();
  if (/gift|present/.test(lower)) {
    const money = parseMoney(item);
    return giftIdeas(money.max ?? money.lone, parseInterests(item), ctx, 5);
  }
  const money = parseMoney(item);
  return findProducts(item, { colors: parseColors(item), max: money.max ?? money.lone, openOnly: true, ctx })
    .slice(0, 5)
    .map((x) => x.p);
}

export function planMission(queries: string[], budget: number | null, ctx: EngineContext): MissionPlan {
  const cands = queries.map((q) => candidatesFor(q, ctx));
  const idx = cands.map(() => 0);
  let best: { choice: (Product | undefined)[]; score: number; total: number } | null = null;
  let cheapest: { choice: (Product | undefined)[]; total: number } | null = null;
  const lists = cands.map((c) => (c.length ? c : [undefined]));
  const combos = lists.reduce((n, l) => n * l.length, 1);
  const limit = Math.min(combos, 20000);
  for (let n = 0; n < limit; n++) {
    let rest = n;
    for (let i = 0; i < lists.length; i++) {
      idx[i] = rest % lists[i].length;
      rest = Math.floor(rest / lists[i].length);
    }
    const choice = idx.map((k, i) => lists[i][k]);
    const chosen = choice.filter(Boolean) as Product[];
    if (new Set(chosen.map((p) => p.id)).size !== chosen.length) continue;
    const total = chosen.reduce((s, p) => s + p.price, 0);
    if (!cheapest || total < cheapest.total) cheapest = { choice, total };
    if (budget !== null && total > budget) continue;
    const stores = new Set(chosen.map((p) => p.storeId)).size;
    // Relevance order matters (index 0 = best match), then rating, then fewer stops.
    const score = chosen.reduce((s, p, i) => s + p.rating! - idx[i] * 0.35, 0) - stores * 0.3;
    if (!best || score > best.score) best = { choice, score, total };
  }
  const pick = best ?? cheapest ?? { choice: queries.map(() => undefined), total: 0 };
  const items: MissionItem[] = queries.map((q, i) => {
    const p = pick.choice[i];
    const alternatives = cands[i].filter((c) => c.id !== p?.id).map((c) => c.id);
    let note: string | undefined;
    if (!p) note = `Nothing in ${'Harbour Central'} matches “${q}”.`;
    else if (/gift|present/i.test(q) && !parseInterests(q).length) note = 'Suggested gift. Tell me their interests to narrow it down.';
    return { query: q, productId: p?.id, alternatives, note };
  });
  const products = items.map((it) => it.productId && productById(it.productId)!).filter(Boolean) as Product[];
  const storeIds = [...new Set(products.map((p) => p.storeId))];
  const route = ctx.routeFor(storeIds);
  const stops = route.order.map((storeId) => ({ storeId, productIds: products.filter((p) => p.storeId === storeId).map((p) => p.id) }));
  const total = products.reduce((s, p) => s + p.price, 0);
  const walkMinutes = Math.max(1, Math.round(route.metres / WALK_SPEED / 60));
  const shopMinutes = stops.length * MINUTES_PER_STORE + products.length * MINUTES_PER_ITEM;
  return {
    items,
    budget,
    total,
    overBudget: budget !== null ? Math.max(0, total - budget) : 0,
    stops,
    walkMetres: Math.round(route.metres),
    walkMinutes,
    shopMinutes,
    totalMinutes: walkMinutes + shopMinutes,
  };
}

/** A mission for a fixed set of catalogue products (cart, outfit or picks). */
export function planForProducts(ids: string[], budget: number | null, ctx: EngineContext): MissionPlan {
  const products = ids.map((id) => productById(id)!).filter(Boolean);
  const route = ctx.routeFor([...new Set(products.map((p) => p.storeId))]);
  const stops = route.order.map((storeId) => ({ storeId, productIds: products.filter((p) => p.storeId === storeId).map((p) => p.id) }));
  const total = products.reduce((s, p) => s + p.price, 0);
  const walkMinutes = Math.max(1, Math.round(route.metres / WALK_SPEED / 60));
  const shopMinutes = stops.length * MINUTES_PER_STORE + products.length * MINUTES_PER_ITEM;
  return {
    items: products.map((p) => ({ query: p.name, productId: p.id, alternatives: [] })),
    budget,
    total,
    overBudget: budget !== null ? Math.max(0, total - budget) : 0,
    stops,
    walkMetres: Math.round(route.metres),
    walkMinutes,
    shopMinutes,
    totalMinutes: walkMinutes + shopMinutes,
  };
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------
let lastResults: string[] = [];
let lastOutfitTotal = 0;

const HELLO: Reply = {
  text: 'Hi, I’m Scout, your shopping companion. Tell me what you need and I’ll find it in this centre, compare options, keep you on budget and walk you there.',
  chips: ['Running shoes under $150', 'An outfit for $200', 'Birthday gift for my brother', 'Just looking'],
};

export function lastPicks() {
  return lastResults;
}

export function setLastPicks(ids: string[]) {
  lastResults = ids;
}

function picksReply(text: string, ps: Product[], ctx: EngineContext, chips?: string[], extra?: (p: Product) => string | undefined): Reply {
  lastResults = ps.map((p) => p.id);
  return { text, picks: ps.map((p) => ({ id: p.id, why: why(p, ctx, extra?.(p)) })), chips };
}

function storeMentioned(t: string) {
  const n = norm(t);
  return STORES.find((s) => n.includes(norm(s.name)) || n.includes(norm(s.name.split(' ')[0])));
}

export const localBrain: CompanionBrain = {
  async respond(message, ctx) {
    return respondLocally(message, ctx);
  },
};

export function respondLocally(message: string, ctx: EngineContext): Reply {
  const raw = message.trim();
  if (!raw) return HELLO;
  const t = norm(raw);
  const money = parseMoney(raw);
  const colors = parseColors(raw);
  const interests = parseInterests(raw);

  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(t) && t.split(' ').length <= 3) return HELLO;

  // --- missions -----------------------------------------------------------
  if (looksLikeMission(raw)) {
    const items = parseMissionItems(raw);
    const budget = money.budget ?? money.lone ?? ctx.cart.budget;
    if (items.length) {
      const plan = planMission(items, budget ?? null, ctx);
      lastResults = plan.items.map((i) => i.productId).filter(Boolean) as string[];
      const found = plan.items.filter((i) => i.productId).length;
      const text =
        `I planned your mission: ${found} of ${plan.items.length} items found across ${plan.stops.length} store${plan.stops.length === 1 ? '' : 's'}, ` +
        `about ${plan.totalMinutes} minutes including ${plan.walkMinutes} minutes of walking. Estimated total ${money_(plan.total)}` +
        (plan.budget !== null ? (plan.overBudget > 0 ? `, which is ${money_(plan.overBudget)} over your ${money_(plan.budget)} budget.` : ` of your ${money_(plan.budget)} budget.`) : '.');
      return { text, mission: plan, budgetSet: money.budget ?? money.lone ?? undefined, chips: ['Start mission', 'Add all to cart'] };
    }
  }

  // --- budget -------------------------------------------------------------
  if (
    /\b(my )?budget\b/.test(t) &&
    (money.budget ?? money.lone) !== undefined &&
    contentTokens(raw).length === 0 &&
    !/outfit|wear|gift|present|birthday|looking|browse/.test(t)
  ) {
    const b = money.budget ?? money.lone!;
    return { text: `Budget set to ${money_(b)}. I’ll keep an eye on your cart and suggest cheaper options if something would push you over.`, budgetSet: b };
  }

  // --- cart ---------------------------------------------------------------
  if (/\b(cart|basket)\b|how much (have i|do i have|is left)|remaining|left to spend/.test(t) && !/route|plan|trip/.test(t)) {
    const c = ctx.cart;
    if (!c.count) return { text: 'Your cart is empty. Ask me for something and tap Add to cart.', chips: ['Running shoes under $150', 'Just looking'] };
    const rem = c.remaining;
    return {
      text: `You have ${c.count} item${c.count === 1 ? '' : 's'} in your cart, totalling ${money_(c.total)}.` + (rem !== null ? (rem >= 0 ? ` ${money_(rem)} of your budget is left.` : ` That's ${money_(-rem)} over budget.`) : ''),
      chips: ['Plan a route for my cart', 'Find something cheaper'],
    };
  }

  if (/route for (these|them)|show me where they are|where are they/.test(t) && lastResults.length) {
    const plan = planForProducts(lastResults, ctx.cart.budget, ctx);
    return { text: `The quickest way to see all of them: ${plan.stops.length} stop${plan.stops.length === 1 ? '' : 's'}, about ${plan.totalMinutes} minutes.`, mission: plan, chips: ['Start mission', 'Add all to cart'] };
  }
  if (/make it cheaper|cheaper outfit/.test(t) && lastOutfitTotal) {
    return respondLocally(`an outfit under $${Math.floor(lastOutfitTotal * 0.8)}`, ctx);
  }
  if (/route for my cart|plan (my )?(route|trip)/.test(t) && ctx.cart.count) {
    const plan = planForProducts(ctx.cart.lines.map((l) => l.productId), ctx.cart.budget, ctx);
    return { text: `Here’s the quickest route to collect everything in your cart: ${plan.stops.length} stops, about ${plan.totalMinutes} minutes.`, mission: plan, chips: ['Start mission'] };
  }

  // --- add to cart ----------------------------------------------------------
  const addMatch = t.match(/\badd (it|this|that|them|both|all|the (first|second|third|1st|2nd|3rd|cheapest|best)( one)?)\b/);
  if (addMatch && lastResults.length) {
    const which = addMatch[1];
    let ids = lastResults;
    if (/first|1st/.test(which)) ids = [lastResults[0]];
    else if (/second|2nd/.test(which)) ids = [lastResults[1]];
    else if (/third|3rd/.test(which)) ids = [lastResults[2]];
    else if (/cheapest/.test(which)) ids = [[...lastResults].sort((a, b) => productById(a)!.price - productById(b)!.price)[0]];
    else if (/best/.test(which)) ids = [[...lastResults].sort((a, b) => productById(b)!.rating! - productById(a)!.rating!)[0]];
    else if (/^(it|this|that)$/.test(which)) ids = [lastResults[0]];
    ids = ids.filter(Boolean);
    return { text: `Adding ${ids.map((id) => productById(id)!.name).join(' and ')} to your cart.`, addToCart: ids };
  }

  // --- compare ---------------------------------------------------------------
  if (/\bcompare\b|\bvs\b|\bversus\b|difference|which (one )?(is )?better/.test(t)) {
    const named = ALL_PRODUCTS.filter((p) => t.includes(norm(p.name)) || (p.name.split(' ').length > 1 && t.includes(norm(p.name.split(' ').slice(-2).join(' ')))));
    let ids = named.length >= 2 ? named.map((p) => p.id) : lastResults;
    if (ids.length < 2) {
      const found = findProducts(raw.replace(/compare|vs|versus|difference|which.*better/gi, ''), { max: money.max, colors });
      ids = found.map((x) => x.p.id);
    }
    ids = ids.slice(0, 3);
    if (ids.length >= 2) {
      lastResults = ids;
      return { text: compareText(ids), compare: ids, chips: ['Add the best one', 'Add the cheapest one', 'Show me where they are'] };
    }
    return { text: 'Tell me what to compare, for example “compare running shoes”, or find a few products first.' };
  }

  // --- cheaper ---------------------------------------------------------------
  const namedProduct = ALL_PRODUCTS.find((p) => t.includes(norm(p.name).trim()));
  if (/cheaper|less expensive|lower price|more affordable|save money/.test(t) && (lastResults.length || namedProduct)) {
    const base = namedProduct ?? productById(lastResults[0])!;
    const alts = cheaperAlternatives(base.id, money.max ?? base.price, ctx).slice(0, 3);
    if (!alts.length) return { text: `${base.name} is already the most affordable ${base.type.toLowerCase()} in the centre.` };
    return picksReply(`Cheaper alternatives to ${base.name} (${money_(base.price)}):`, alts, ctx, ['Compare them'], (p) => `Save ${money_(base.price - p.price)}`);
  }

  // --- navigation & facilities --------------------------------------------------
  const wantsDirections = /\b(where|take me|directions?|how do i get|way to|navigate|nearest)\b/.test(t);
  const GENERIC = new Set(['help', 'info', 'information', 'accessible', 'step free', 'exit', 'entrance', 'car']);
  const fac = FACILITIES.find((f) => f.tags.some((tag) => !GENERIC.has(tag) && new RegExp(`\\b${tag}s?\\b`).test(t)));
  if (fac && (wantsDirections || !findProducts(raw).length)) {
    return { text: `${fac.name}: ${fac.description} I’ve drawn the route for you.`, navigate: { kind: 'facility', id: fac.id } };
  }
  const st = storeMentioned(raw);
  if (st && wantsDirections) return { text: `Heading to ${st.name} (unit ${st.unit}). Follow the blue arrows.`, navigate: { kind: 'store', id: st.id } };
  if (/\b(food|eat|hungry|lunch|coffee|breakfast|dinner|snack)\b/.test(t) && !findProducts(raw).length) {
    return { text: 'The Food Court has Burger House, Sushi Express, Pizza Corner and Coffee Lab. I’ll take you there.', navigate: { kind: 'restaurant', id: 'coffee-lab' } };
  }

  // --- events ------------------------------------------------------------------------
  if (/what(s| is) on|\bevents?\b|happening|anything on/.test(t)) {
    if (!ctx.eventName) return { text: 'There’s no event on right now. Open “What’s on” in the toolbar to see the schedule or preview upcoming events.', chips: ['Just looking'] };
    const ps = ctx.eventProductIds.map((id) => productById(id)!).filter(Boolean);
    return picksReply(`${ctx.eventName} is on now (demo event).${ps.length ? ' Featured products:' : ''}`, ps, ctx, ['Compare them', 'Just looking']);
  }

  // --- discovery ---------------------------------------------------------------------
  if (/just (looking|browsing)|browse|not sure|no idea|inspire|surprise me|what(s| is) (good|new|popular|trending|on sale)|anything interesting|show me something/.test(t)) {
    const cats = ['fashion', 'technology', 'beauty', 'sport', 'entertainment'].filter((c) => t.includes(c));
    const found = discover(ctx, { max: money.max ?? money.lone ?? ctx.cart.remaining ?? undefined, categories: cats });
    lastResults = found.map((f) => f.p.id);
    return {
      text: 'No problem. Here are a few things worth a look, based only on current promotions, top ratings and anything you’ve looked at here. Pick a category to narrow it down.',
      picks: found.map((f) => ({ id: f.p.id, why: why(f.p, ctx, f.reason) })),
      chips: ['Fashion', 'Technology', 'Beauty', 'Sport', 'Under $50'],
    };
  }

  // --- outfit ---------------------------------------------------------------------------
  if (/\boutfit|what (should i|to) wear|\blook\b.*(for|under)|dress me|head to toe/.test(t)) {
    const budget = money.budget ?? money.max ?? money.lone ?? ctx.cart.remaining ?? 250;
    const o = buildOutfit(budget, colors, ctx);
    if (!o.set.length) {
      return { text: `I can’t put a full outfit together for ${money_(budget)} in this centre right now. The cheapest complete top, bottom and shoes would be ${money_(o.cheapest)}.`, chips: [`An outfit for $${Math.ceil(o.cheapest / 10) * 10}`] };
    }
    lastResults = o.set.map((p) => p.id);
    lastOutfitTotal = o.total;
    const stores = [...new Set(o.set.map((p) => storeById(p.storeId)!.name))];
    return {
      text: `Here’s a full outfit for ${money_(o.total)}, leaving ${money_(budget - o.total)} of your ${money_(budget)}. It uses ${stores.join(' and ')}. I picked the best-rated pieces that fit the budget${colors.length ? ` and favoured ${colors.join('/')}` : ''}.`,
      outfit: { ids: o.set.map((p) => p.id), total: o.total, budget },
      picks: o.set.map((p) => ({ id: p.id, why: why(p, ctx, p.role === 'accessory' ? 'Extra: fits the leftover budget' : p.role) })),
      chips: ['Add all to cart', 'Plan a route for these', 'Make it cheaper'],
    };
  }

  // --- gifts ------------------------------------------------------------------------------
  if (/\bgift|present|birthday|anniversary|christmas|xmas|stocking/.test(t)) {
    const max = money.max ?? money.lone ?? money.budget;
    const ideas = giftIdeas(max, interests, ctx);
    if (!ideas.length) return { text: `I couldn’t find gift ideas${max ? ` under ${money_(max)}` : ''} for those interests. Try a higher budget or different interests.`, chips: ['Gift under $100', 'Gift for a gamer'] };
    const intro = interests.length
      ? `Gift ideas for someone into ${interests.join(' and ')}${max ? ` under ${money_(max)}` : ''}:`
      : `Here are well-rated gift ideas under ${money_(max ?? DEFAULT_GIFT_MAX)} from different stores. I don’t guess from who the gift is for; tell me what they’re into, or a budget, and I’ll narrow it down.`;
    return picksReply(intro, ideas, ctx, interests.length ? ['Compare them', 'Something cheaper'] : ['They like gaming', 'They like music', 'They like running', 'They like fashion']);
  }
  if (/^(they|he|she) (like|likes|love|loves|are into|is into)/.test(t) || (interests.length && /like|into|love|fan/.test(t))) {
    const max = money.max ?? money.lone;
    let ideas = giftIdeas(max, interests, ctx);
    if (ideas.length) return picksReply(`Great. For someone into ${interests.join(' and ') || 'that'}, I’d look at these:`, ideas, ctx, ['Compare them', 'Add the best one']);
    if (max === undefined && interests.length) {
      ideas = giftIdeas(Infinity, interests, ctx);
      if (ideas.length)
        return picksReply(`Nothing for ${interests.join(' and ')} fans comes in under ${money_(DEFAULT_GIFT_MAX)} here, but these are the best matches:`, ideas, ctx, ['Something cheaper', 'Compare them']);
    }
  }

  // --- product search ------------------------------------------------------------------------
  const max = money.max ?? money.lone;
  const found = findProducts(raw, { max, colors });
  if (found.length) {
    const ps = found.slice(0, 4).map((x) => x.p);
    const stores = new Set(ps.map((p) => p.storeId));
    const priceNote = max !== undefined ? ` under ${money_(max)}` : '';
    let text = `I found ${ps.length} option${ps.length === 1 ? '' : 's'}${priceNote} in ${stores.size} store${stores.size === 1 ? '' : 's'}.`;
    if (ps.length >= 2) {
      const cheap = [...ps].sort((a, b) => a.price - b.price)[0];
      const top = [...ps].sort((a, b) => b.rating! - a.rating!)[0];
      text += cheap.id === top.id ? ` ${cheap.name} is both the cheapest and the best rated.` : ` ${cheap.name} is the cheapest; ${top.name} is the best rated.`;
    }
    const rem = ctx.cart.remaining;
    if (rem !== null && ps.every((p) => p.price > rem)) text += ` Heads up: all of these are above your remaining budget of ${money_(rem)}.`;
    const closed = ps.filter((p) => !ctx.isOpen(p.storeId));
    if (closed.length) text += ` ${[...new Set(closed.map((p) => storeById(p.storeId)!.name))].join(', ')} ${closed.length === 1 ? 'is' : 'are'} closed right now.`;
    return picksReply(text, ps, ctx, ps.length >= 2 ? ['Compare them', 'Find something cheaper', 'Plan a route for these'] : ['Add it', 'Find something cheaper']);
  }

  // Price limit excluded everything? Say so honestly.
  if (max !== undefined) {
    const any = findProducts(raw, { colors });
    if (any.length) {
      const cheapest = [...any].sort((a, b) => a.p.price - b.p.price)[0].p;
      lastResults = [cheapest.id];
      return {
        text: `Nothing matching that is under ${money_(max)} here. The cheapest option is ${cheapest.name} at ${money_(cheapest.price)}.`,
        picks: [{ id: cheapest.id, why: why(cheapest, ctx) }],
      };
    }
  }
  if (colors.length && findProducts(raw).length) {
    const alts = findProducts(raw).slice(0, 3).map((x) => x.p);
    return picksReply(`I couldn’t find that in ${colors.join('/')}. Here are the colours available:`, alts, ctx, undefined, (p) => (p.colors?.length ? p.colors.join('/') : undefined));
  }

  return {
    text: `I couldn’t find “${raw}” in this centre. I only suggest products that are actually stocked here. You could try shoes, hoodies, phones, headphones, gifts, beauty or food.`,
    chips: ['Just looking', 'Running shoes under $150', 'Black hoodie', 'Phone under $800'],
  };
}

const money_ = money;
