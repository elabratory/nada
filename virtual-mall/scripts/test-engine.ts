/**
 * Behaviour tests for the AI companion engine, cart/budget, missions and the
 * digital-twin validator. Run with: npm test
 */
import assert from 'node:assert/strict';
import { respondLocally, planMission, type EngineContext } from '../src/ai/engine';
import { Cart } from '../src/shop/cart';
import { ALL_PRODUCTS, productById } from '../src/data/mall';
import { demoSnapshot, validateSnapshot } from '../src/platform/sources';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
    process.exitCode = 1;
  }
};

const ctx = (over: Partial<EngineContext> = {}): EngineContext => ({
  cart: new Cart(),
  isOpen: () => true,
  distanceTo: () => 25,
  viewed: [],
  eventProductIds: [],
  eventName: null,
  routeFor: (ids) => ({ order: ids, metres: 40 * ids.length + 30 }),
  ...over,
});
const ids = new Set(ALL_PRODUCTS.map((p) => p.id));
const grounded = (r: ReturnType<typeof respondLocally>) => {
  for (const p of r.picks ?? []) assert.ok(ids.has(p.id), `unknown product ${p.id}`);
  for (const id of r.compare ?? []) assert.ok(ids.has(id), `unknown product ${id}`);
  for (const it of r.mission?.items ?? []) if (it.productId) assert.ok(ids.has(it.productId));
};

test('running shoes under $150 → only stocked running shoes within price', () => {
  const r = respondLocally('I need running shoes under $150.', ctx());
  grounded(r);
  assert.ok(r.picks!.length >= 1);
  for (const p of r.picks!) {
    const prod = productById(p.id)!;
    assert.ok(prod.price <= 150);
    assert.match(prod.type.toLowerCase(), /running shoes/);
  }
});

test('black hoodie → black hoodies only', () => {
  const r = respondLocally('I want a black hoodie.', ctx());
  grounded(r);
  assert.ok(r.picks!.length >= 2);
  for (const p of r.picks!) assert.ok(productById(p.id)!.colors!.includes('black'));
});

test('phone under $800 → phones ≤ $800', () => {
  const r = respondLocally('I need a phone for under $800.', ctx());
  grounded(r);
  assert.ok(r.picks!.every((p) => productById(p.id)!.price <= 800 && /phone/i.test(productById(p.id)!.type)));
});

test('outfit for $200 → top + bottom + shoes within budget', () => {
  const r = respondLocally('I need an outfit for a $200 budget.', ctx());
  grounded(r);
  assert.ok(r.outfit);
  assert.ok(r.outfit!.total <= 200);
  const roles = r.outfit!.ids.map((id) => productById(id)!.role);
  assert.ok(roles.includes('shoes') && roles.includes('bottom') && (roles.includes('top') || roles.includes('outerwear')));
});

test('gift for my brother → gifts, no demographic guessing, asks for interests', () => {
  const r = respondLocally('I’m looking for a birthday gift for my brother.', ctx());
  grounded(r);
  assert.ok(r.picks!.every((p) => productById(p.id)!.gift));
  assert.match(r.text, /don’t guess/);
});

test('mission with budget → plan within budget with stops', () => {
  const r = respondLocally('Buy:\n* Running shoes\n* Black hoodie\n* Birthday gift\nBudget: $300', ctx());
  grounded(r);
  assert.ok(r.mission);
  assert.equal(r.mission!.items.length, 3);
  assert.ok(r.mission!.total <= 300);
  assert.ok(r.mission!.stops.length >= 1);
});

test('mission respects closed stores', () => {
  const plan = planMission(['running shoes'], null, ctx({ isOpen: (id) => id !== 'stride' }));
  assert.notEqual(productById(plan.items[0].productId!)!.storeId, 'stride');
});

test('unknown product → honest “not found”, no picks', () => {
  const r = respondLocally('a unicorn saddle', ctx());
  assert.equal(r.picks, undefined);
  assert.match(r.text, /couldn’t find/);
});

test('smart budget: cart knows how far over a purchase would go', () => {
  const c = new Cart();
  c.setBudget(100);
  c.add('stride-pace-runner');
  assert.equal(c.overBy(productById('thread-denim')!.price), Math.round((149 + 79.99 - 100) * 100) / 100);
});

test('facilities: bathrooms and security route correctly', () => {
  assert.deepEqual(respondLocally('where are the toilets', ctx()).navigate, { kind: 'facility', id: 'restrooms' });
  assert.deepEqual(respondLocally('I need first aid', ctx()).navigate, { kind: 'facility', id: 'security' });
});

test('demo snapshot validates; broken data is rejected', () => {
  const snap = demoSnapshot();
  assert.deepEqual(validateSnapshot(snap), []);
  const bad = structuredClone(snap);
  bad.stores[0].doorX = 999;
  bad.promotions[0].placeId = 'nowhere';
  const errs = validateSnapshot(bad);
  assert.ok(errs.some((e) => /door/.test(e)) && errs.some((e) => /unknown place/.test(e)));
});

console.log(`\n${passed} passed${process.exitCode ? ', some failed' : ''}`);
