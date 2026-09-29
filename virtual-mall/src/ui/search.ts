import { FACILITIES, PROMOTIONS, RESTAURANTS, STORES, money, placeName, refForPlaceId, type PlaceRef } from '../data/mall';
import { h } from './dom';

export interface SearchResult {
  kind: 'store' | 'product' | 'restaurant' | 'menu' | 'facility' | 'deal';
  title: string;
  subtitle: string;
  ref: PlaceRef;
  productId?: string;
  /** Primary text (weighted higher) and secondary text used for matching. */
  primary: string;
  secondary: string;
}

const KIND_LABEL: Record<SearchResult['kind'], string> = {
  store: 'Store',
  product: 'Product',
  restaurant: 'Food',
  menu: 'Menu',
  facility: 'Facility',
  deal: 'Deal',
};

function buildIndex(): SearchResult[] {
  const out: SearchResult[] = [];
  for (const s of STORES) {
    out.push({
      kind: 'store',
      title: s.name,
      subtitle: `${s.categories.join(' · ')} · Unit ${s.unit}`,
      ref: { kind: 'store', id: s.id },
      primary: `${s.name} ${s.categories.join(' ')}`,
      secondary: `${s.tagline} ${s.description} ${s.inspiredBy}`,
    });
    for (const p of s.products) {
      out.push({
        kind: 'product',
        title: `${s.name} — ${p.type}`,
        subtitle: `${p.name} · ${money(p.price)}`,
        ref: { kind: 'store', id: s.id },
        productId: p.id,
        primary: `${p.name} ${p.type} ${p.tags.join(' ')}`,
        secondary: `${p.description} ${s.name}`,
      });
    }
  }
  for (const r of RESTAURANTS) {
    out.push({
      kind: 'restaurant',
      title: r.name,
      subtitle: `${r.cuisine} · Food Court · Unit ${r.unit}`,
      ref: { kind: 'restaurant', id: r.id },
      primary: `${r.name} ${r.cuisine} ${r.tags.join(' ')} food restaurant`,
      secondary: r.description,
    });
    for (const sec of r.menu)
      for (const item of sec.items)
        out.push({
          kind: 'menu',
          title: `${r.name} — ${item.name}`,
          subtitle: `${money(item.price)}${item.popular ? ' · Popular' : ''}`,
          ref: { kind: 'restaurant', id: r.id },
          primary: item.name,
          secondary: `${sec.section} ${r.cuisine}`,
        });
  }
  for (const f of FACILITIES) {
    out.push({
      kind: 'facility',
      title: f.name,
      subtitle: f.description,
      ref: { kind: 'facility', id: f.id },
      primary: `${f.name} ${f.tags.join(' ')}`,
      secondary: f.description,
    });
  }
  for (const d of PROMOTIONS) {
    const ref = refForPlaceId(d.placeId)!;
    out.push({
      kind: 'deal',
      title: d.title,
      subtitle: `${placeName(ref)} · Demo promotion`,
      ref,
      primary: `${d.title} deal deals promotion sale offer`,
      secondary: `${d.detail} ${placeName(ref)}`,
    });
  }
  return out;
}

const INDEX = buildIndex();

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ');
const stem = (w: string) => (w.length > 3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const words = (t: string) => norm(t).split(/\s+/).filter(Boolean).map(stem);

function tokenScore(token: string, primary: string[], secondary: string[]) {
  if (primary.some((w) => w === token)) return 4;
  if (primary.some((w) => w.startsWith(token))) return 3;
  if (secondary.some((w) => w === token)) return 1.5;
  if (secondary.some((w) => w.startsWith(token) && token.length >= 3)) return 1;
  return 0;
}

export function search(query: string, limit = 12): SearchResult[] {
  const q = words(query);
  if (!q.length) return [];
  const phrase = norm(query).trim();
  const scored: { r: SearchResult; score: number }[] = [];
  for (const r of INDEX) {
    const pw = words(r.primary);
    const sw = words(r.secondary);
    let score = 0;
    let ok = true;
    for (const t of q) {
      const sc = tokenScore(t, pw, sw);
      if (!sc) {
        ok = false;
        break;
      }
      score += sc;
    }
    if (!ok) continue;
    if (norm(r.primary).includes(phrase)) score += 3;
    if (r.kind === 'store' || r.kind === 'restaurant' || r.kind === 'facility') score += 0.5;
    if (r.kind === 'menu' || r.kind === 'deal') score -= 0.5;
    scored.push({ r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  // Collapse duplicate facility destinations etc.
  const seen = new Set<string>();
  return scored
    .map((s) => s.r)
    .filter((r) => {
      const key = `${r.kind}|${r.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/**
 * Accessible combobox: arrow keys move through results, Enter picks,
 * Escape clears. Results are announced by count.
 */
export function createSearchBox(onPick: (r: SearchResult) => void, idPrefix: string) {
  const listId = `${idPrefix}-results`;
  const input = h('input', {
    type: 'search',
    id: `${idPrefix}-input`,
    class: 'search-input',
    placeholder: 'Search stores or products...',
    autocomplete: 'off',
    role: 'combobox',
    'aria-expanded': 'false',
    'aria-controls': listId,
    'aria-autocomplete': 'list',
    'aria-label': 'Search stores or products',
  }) as HTMLInputElement;
  const list = h('ul', { id: listId, class: 'search-results', role: 'listbox', 'aria-label': 'Search results' });
  const status = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  let results: SearchResult[] = [];
  let active = -1;

  const render = () => {
    list.innerHTML = '';
    const open = input.value.trim().length > 0;
    input.setAttribute('aria-expanded', String(open));
    list.classList.toggle('open', open);
    if (!open) return;
    if (!results.length) {
      list.append(h('li', { class: 'search-empty', role: 'option', 'aria-disabled': 'true' }, `No matches for “${input.value}”. Try “shoes”, “coffee” or “bathroom”.`));
      return;
    }
    results.forEach((r, i) => {
      const li = h(
        'li',
        {
          id: `${listId}-${i}`,
          role: 'option',
          class: `search-item${i === active ? ' active' : ''}`,
          'aria-selected': String(i === active),
          onmousedown: (e: Event) => e.preventDefault(),
          onclick: () => pick(i),
        },
        h('span', { class: `kind kind-${r.kind}` }, KIND_LABEL[r.kind]),
        h('span', { class: 'search-text' }, h('strong', {}, r.title), h('small', {}, r.subtitle)),
        h('span', { class: 'search-go', 'aria-hidden': 'true' }, 'Directions →'),
      );
      list.append(li);
    });
    input.setAttribute('aria-activedescendant', active >= 0 ? `${listId}-${active}` : '');
  };

  const pick = (i: number) => {
    const r = results[i];
    if (!r) return;
    input.value = '';
    results = [];
    active = -1;
    render();
    input.blur();
    onPick(r);
  };

  input.addEventListener('input', () => {
    results = search(input.value);
    active = results.length ? 0 : -1;
    render();
    status.textContent = input.value.trim() ? `${results.length} result${results.length === 1 ? '' : 's'}` : '';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(results.length - 1, active + 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      input.value = '';
      results = [];
      render();
      input.blur();
    }
  });
  input.addEventListener('blur', () => setTimeout(() => list.classList.remove('open'), 150));
  input.addEventListener('focus', () => input.value && render());

  const wrap = h('div', { class: 'search', role: 'search' }, h('label', { class: 'sr-only', for: input.id }, 'Search stores or products'), input, list, status);
  return { el: wrap, input };
}
