import { ALL_PRODUCTS, productById } from '../data/mall';
import { findProducts, localBrain, respondLocally, why, type CompanionBrain, type EngineContext, type Reply } from './engine';

/**
 * Optional large-language-model brain for Scout.
 *
 * The LLM never sees or invents free-form products: we first retrieve
 * candidate products from the catalogue (the same search the offline engine
 * uses), send only those candidates, and require the model to answer with
 * product IDs from that list. Anything it returns is validated here; unknown
 * IDs are dropped, and on any error we fall back to the offline engine.
 *
 * Point `endpoint` at your own server-side proxy (never ship API keys to the
 * browser). The proxy receives { message, candidates, context } and returns
 * { text, productIds, compare? }.
 */
export function createLLMBrain(endpoint: string): CompanionBrain {
  return {
    async respond(message: string, ctx: EngineContext): Promise<Reply> {
      // Deterministic answer first: it handles missions, budgets, routes, etc.
      const local = respondLocally(message, ctx);
      const candidates = (local.picks?.map((p) => productById(p.id)!) ?? findProducts(message).slice(0, 8).map((x) => x.p)).slice(0, 12);
      const pool = candidates.length ? candidates : ALL_PRODUCTS.slice(0, 40);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message,
            candidates: pool.map((p) => ({ id: p.id, name: p.name, type: p.type, price: p.price, rating: p.rating, store: p.storeId, colors: p.colors, features: p.details })),
            context: { budgetRemaining: ctx.cart.remaining, cartTotal: ctx.cart.total, event: ctx.eventName },
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const out = (await res.json()) as { text?: string; productIds?: string[]; compare?: string[] };
        const allowed = new Set(pool.map((p) => p.id));
        const ids = (out.productIds ?? []).filter((id) => allowed.has(id));
        if (!out.text) return local;
        return {
          ...local,
          text: out.text,
          picks: ids.length ? ids.map((id) => ({ id, why: why(productById(id)!, ctx) })) : local.picks,
          compare: out.compare?.filter((id) => allowed.has(id)) ?? local.compare,
        };
      } catch {
        return localBrain.respond(message, ctx);
      }
    },
  };
}
