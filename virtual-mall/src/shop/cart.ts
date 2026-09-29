import { money, productById, storeById, type Product } from '../data/mall';

export interface CartLine {
  productId: string;
  qty: number;
  option?: string;
}

export interface AddResult {
  ok: boolean;
  /** How far the cart would go over budget with this item (0 when within budget). */
  overBy: number;
}

const KEY = 'vm-cart-v1';

/**
 * Persistent shopping cart + budget. State lives in this browser only
 * (localStorage) and survives reloads; all access is guarded so private
 * windows still work.
 */
export class Cart extends EventTarget {
  lines: CartLine[] = [];
  budget: number | null = null;

  constructor() {
    super();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { lines: CartLine[]; budget: number | null } | null;
      if (raw) {
        this.lines = raw.lines.filter((l) => productById(l.productId));
        this.budget = raw.budget;
      }
    } catch {
      /* storage unavailable */
    }
  }

  private changed() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ lines: this.lines, budget: this.budget }));
    } catch {
      /* storage unavailable */
    }
    this.dispatchEvent(new Event('change'));
  }

  get total() {
    return this.lines.reduce((sum, l) => sum + (productById(l.productId)?.price ?? 0) * l.qty, 0);
  }

  get count() {
    return this.lines.reduce((n, l) => n + l.qty, 0);
  }

  get remaining() {
    return this.budget === null ? null : this.budget - this.total;
  }

  has(id: string) {
    return this.lines.some((l) => l.productId === id);
  }

  /** How much over budget adding `price` would take the cart (0 if fine or no budget). */
  overBy(price: number) {
    if (this.budget === null) return 0;
    return Math.max(0, this.total + price - this.budget);
  }

  add(id: string, option?: string, qty = 1): AddResult {
    const p = productById(id);
    if (!p) return { ok: false, overBy: 0 };
    const overBy = this.overBy(p.price * qty);
    const line = this.lines.find((l) => l.productId === id && l.option === option);
    if (line) line.qty += qty;
    else this.lines.push({ productId: id, qty, option });
    this.changed();
    return { ok: true, overBy };
  }

  setQty(index: number, qty: number) {
    if (qty <= 0) this.lines.splice(index, 1);
    else this.lines[index].qty = qty;
    this.changed();
  }

  remove(index: number) {
    this.lines.splice(index, 1);
    this.changed();
  }

  replace(oldId: string, newId: string) {
    const line = this.lines.find((l) => l.productId === oldId);
    if (line) {
      line.productId = newId;
      line.option = undefined;
      this.changed();
    }
  }

  clear() {
    this.lines = [];
    this.changed();
  }

  setBudget(b: number | null) {
    this.budget = b && b > 0 ? Math.round(b * 100) / 100 : null;
    this.changed();
  }

  products(): { p: Product; line: CartLine }[] {
    return this.lines.map((line) => ({ p: productById(line.productId)!, line }));
  }

  /** Stores the cart's items come from, in cart order. */
  storeIds() {
    return [...new Set(this.products().map(({ p }) => p.storeId))];
  }

  summary() {
    const lines = this.products().map(({ p, line }) => `${line.qty} × ${p.name} (${storeById(p.storeId)!.name}) ${money(p.price * line.qty)}`);
    return lines.join('\n');
  }
}
