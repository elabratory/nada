import {
  CATEGORIES,
  CENTRE,
  FACILITIES,
  PROMOTIONS,
  RESTAURANTS,
  STORES,
  hoursRows,
  locationText,
  money,
  openStatus,
  placeName,
  promotionsFor,
  refForPlaceId,
  storeById,
  type Category,
  type Facility,
  type PlaceRef,
  type Product,
  type Restaurant,
  type Store,
  type WeekHours,
} from '../data/mall';
import { CATEGORY_COLORS } from './map';
import { button, h, icon, toast } from './dom';

export interface Actions {
  navigate(ref: PlaceRef, opts?: { productId?: string }): void;
  enterStore(storeId: string): void;
  openStore(id: string): void;
  openProduct(id: string): void;
  openRestaurant(id: string): void;
  openFacility(id: string): void;
  openDirectory(category?: Category | 'All'): void;
  inMall(): boolean;
}

/** The store colour to use as an accent stripe, falling back to its accent if the main colour is near-white. */
function stripe(color: string, accent: string) {
  const n = parseInt(color.slice(1), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 215 ? accent : color;
}


function statusPill(hours: WeekHours) {
  const st = openStatus(hours);
  return h('span', { class: `pill ${st.open ? 'pill-open' : 'pill-closed'}` }, h('span', { class: 'dot', 'aria-hidden': 'true' }), st.text);
}

function hoursTable(hours: WeekHours, caption = 'Opening hours') {
  return h(
    'table',
    { class: 'hours' },
    h('caption', {}, caption),
    h(
      'tbody',
      {},
      hoursRows(hours).map((r) => h('tr', { class: r.today ? 'today' : '' }, h('th', { scope: 'row' }, r.day, r.today ? h('span', { class: 'sr-only' }, ' (today)') : null), h('td', {}, r.text))),
    ),
  );
}

function promoList(placeId: string) {
  const promos = promotionsFor(placeId);
  if (!promos.length) return null;
  return h(
    'div',
    { class: 'block' },
    h('h3', {}, 'Current promotions'),
    promos.map((p) =>
      h('div', { class: 'promo' }, h('div', { class: 'promo-top' }, h('span', { class: 'badge badge-demo' }, 'Demo promotion'), h('small', {}, p.ends)), h('strong', {}, p.title), h('p', {}, p.detail)),
    ),
  );
}

function catChips(cats: Category[]) {
  return h(
    'div',
    { class: 'chips static' },
    cats.map((c) => h('span', { class: 'chip', style: { '--c': CATEGORY_COLORS[c] } }, c)),
  );
}

function swatch(p: Product) {
  return h('span', { class: 'swatch', style: { background: `linear-gradient(135deg, ${p.color}, ${p.accent ?? p.color})` }, 'aria-hidden': 'true' });
}

// ---------- store ----------
export function storeView(s: Store, a: Actions) {
  return h(
    'div',
    { class: 'view' },
    h('div', { class: 'hero-band', style: { background: s.color, color: s.accent } }, h('span', { class: 'hero-name' }, s.name), h('span', { class: 'hero-tag' }, s.tagline)),
    h('div', { class: 'row gap wrap' }, catChips(s.categories), statusPill(s.hours)),
    h('p', {}, s.description),
    h('p', { class: 'muted small' }, `Fictional demo store standing in for ${s.inspiredBy}. No real logos, products or prices.`),
    h('div', { class: 'actions' }, button(a.inMall() ? 'Walk inside' : 'Enter store in 3D', () => a.enterStore(s.id), { icon: 'walk', variant: 'primary' }), button('Directions', () => a.navigate({ kind: 'store', id: s.id }), { icon: 'route' })),
    promoList(s.id),
    h(
      'div',
      { class: 'block' },
      h('h3', {}, `Products (${s.products.length})`),
      h(
        'ul',
        { class: 'product-grid' },
        s.products.map((p) =>
          h(
            'li',
            {},
            h(
              'button',
              { type: 'button', class: 'product-card', onclick: () => a.openProduct(p.id), 'aria-label': `${p.name}, ${money(p.price)}, ${p.availability}. View product.` },
              swatch(p),
              h('span', { class: 'pc-name' }, p.name),
              h('span', { class: 'pc-type' }, p.type),
              h('span', { class: 'pc-price' }, money(p.price), p.wasPrice ? h('s', {}, money(p.wasPrice)) : null),
            ),
          ),
        ),
      ),
    ),
    h('div', { class: 'block' }, h('h3', {}, 'Location'), h('p', { class: 'row gap' }, icon('pin', 18), locationText({ kind: 'store', id: s.id })), h('p', { class: 'muted small' }, `Phone ${s.phone} (demo)`)),
    h('div', { class: 'block' }, hoursTable(s.hours)),
  );
}

// ---------- product ----------
export function productView(p: Product, a: Actions) {
  const s = storeById(p.storeId)!;
  const preview = h('div', { class: 'preview', role: 'img', 'aria-label': `Rotating 3D model of ${p.name}` });
  let selected = p.options?.[0];
  const optionGroup = p.options
    ? h(
        'fieldset',
        { class: 'options' },
        h('legend', {}, p.optionLabel ?? 'Options'),
        h(
          'div',
          { class: 'chips' },
          p.options.map((opt, i) => {
            const id = `opt-${p.id}-${i}`;
            const input = h('input', { type: 'radio', name: `opt-${p.id}`, id, value: opt, checked: i === 0, onchange: () => (selected = opt) });
            return h('span', { class: 'opt' }, input, h('label', { for: id }, opt));
          }),
        ),
      )
    : null;
  const availClass = p.availability === 'In stock' ? 'pill-open' : p.availability === 'Low stock' ? 'pill-warn' : 'pill-closed';
  return h(
    'div',
    { class: 'view' },
    preview,
    h('div', { class: 'price-row' }, h('span', { class: 'price' }, money(p.price)), p.wasPrice ? h('s', { class: 'was' }, money(p.wasPrice)) : null, p.wasPrice ? h('span', { class: 'badge badge-sale' }, 'Demo sale') : null),
    h('div', { class: 'row gap wrap' }, h('span', { class: `pill ${availClass}` }, h('span', { class: 'dot', 'aria-hidden': 'true' }), p.availability), h('span', { class: 'muted small' }, p.stockNote)),
    optionGroup,
    h('p', {}, p.description),
    h('div', { class: 'block' }, h('h3', {}, 'Product details'), h('ul', { class: 'bullets' }, p.details.map((d) => h('li', {}, d)))),
    h('div', { class: 'block' }, h('h3', {}, 'Store location'), h('p', { class: 'row gap' }, icon('pin', 18), `${s.name} — ${locationText({ kind: 'store', id: s.id })}`)),
    h(
      'div',
      { class: 'actions' },
      button(
        'Buy Online',
        () =>
          toast(`Demo only: this would open the retailer’s page for ${p.name}${selected ? ` (${selected})` : ''}. Placeholder link: ${p.buyUrl}`, 6000),
        { icon: 'cart', variant: 'primary' },
      ),
      button('Take me to the store', () => a.navigate({ kind: 'store', id: s.id }, { productId: p.id }), { icon: 'route' }),
      button(`View ${s.name}`, () => a.openStore(s.id), { icon: 'store', variant: 'ghost' }),
    ),
    h('p', { class: 'muted small' }, 'Demo product with a placeholder purchase link. Prices and stock are fictional.'),
  );
}

// ---------- restaurant ----------
export function restaurantView(r: Restaurant, a: Actions) {
  const popular = r.menu.flatMap((m) => m.items).filter((i) => i.popular);
  return h(
    'div',
    { class: 'view' },
    h('div', { class: 'hero-band', style: { background: r.color, color: r.accent } }, h('span', { class: 'hero-name' }, r.name), h('span', { class: 'hero-tag' }, r.cuisine)),
    h('div', { class: 'row gap wrap' }, catChips(['Food']), statusPill(r.hours)),
    h('p', {}, r.description),
    h('div', { class: 'actions' }, button('Take me there', () => a.navigate({ kind: 'restaurant', id: r.id }), { icon: 'route', variant: 'primary' })),
    h('div', { class: 'block' }, h('h3', {}, 'Popular items'), h('div', { class: 'chips static' }, popular.map((i) => h('span', { class: 'chip', style: { '--c': r.color } }, `★ ${i.name} · ${money(i.price)}`)))),
    promoList(r.id),
    h(
      'div',
      { class: 'block' },
      h('h3', {}, 'Menu'),
      r.menu.map((sec) =>
        h(
          'div',
          { class: 'menu-sec' },
          h('h4', {}, sec.section),
          h(
            'ul',
            { class: 'menu' },
            sec.items.map((i) =>
              h('li', {}, h('span', {}, i.name, i.popular ? h('span', { class: 'badge badge-pop' }, 'Popular') : null, i.note ? h('small', { class: 'muted' }, ` — ${i.note}`) : null), h('span', { class: 'menu-price' }, money(i.price))),
            ),
          ),
        ),
      ),
      h('p', { class: 'muted small' }, 'Demo menu and prices.'),
    ),
    h('div', { class: 'block' }, h('h3', {}, 'Location'), h('p', { class: 'row gap' }, icon('pin', 18), locationText({ kind: 'restaurant', id: r.id }))),
    h('div', { class: 'block' }, hoursTable(r.hours)),
  );
}

export function foodView(a: Actions) {
  return h(
    'div',
    { class: 'view' },
    h('p', {}, 'The Food Court is on the south side of the concourse, east of the South Entrance.'),
    h('div', { class: 'actions' }, button('Take me to the Food Court', () => a.navigate({ kind: 'restaurant', id: 'pizza-corner' }), { icon: 'route', variant: 'primary' })),
    h(
      'ul',
      { class: 'card-list' },
      RESTAURANTS.map((r) =>
        h(
          'li',
          { class: 'card' },
          h('div', { class: 'card-accent', style: { background: r.color }, 'aria-hidden': 'true' }),
          h('div', { class: 'card-main' }, h('h3', {}, r.name), h('p', { class: 'muted small' }, `${r.cuisine} · Unit ${r.unit}`), statusPill(r.hours), h('p', { class: 'small' }, 'Popular: ', r.menu.flatMap((m) => m.items).filter((i) => i.popular).map((i) => i.name).join(', '))),
          h('div', { class: 'card-actions' }, button('Menu', () => a.openRestaurant(r.id), { variant: 'ghost' }), button('Go', () => a.navigate({ kind: 'restaurant', id: r.id }), { icon: 'route', ariaLabel: `Directions to ${r.name}` })),
        ),
      ),
    ),
  );
}

// ---------- directory ----------
export function directoryView(a: Actions, initial: Category | 'All' = 'All') {
  let filter: Category | 'All' = initial;
  const list = h('ul', { class: 'card-list', 'aria-live': 'polite' });
  const chipsEl = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' });
  const render = () => {
    chipsEl.innerHTML = '';
    (['All', ...CATEGORIES] as const).forEach((c) => {
      chipsEl.append(
        h(
          'button',
          { type: 'button', class: `chip chip-btn${filter === c ? ' on' : ''}`, 'aria-pressed': String(filter === c), style: c === 'All' ? {} : { '--c': CATEGORY_COLORS[c] }, onclick: () => ((filter = c), render()) },
          c,
        ),
      );
    });
    list.innerHTML = '';
    const stores = STORES.filter((s) => filter === 'All' || s.categories.includes(filter));
    const food = filter === 'All' || filter === 'Food' ? RESTAURANTS : [];
    for (const s of stores) {
      list.append(
        h(
          'li',
          { class: 'card' },
          h('div', { class: 'card-accent', style: { background: stripe(s.color, s.accent) }, 'aria-hidden': 'true' }),
          h(
            'div',
            { class: 'card-main' },
            h('h3', {}, s.name, promotionsFor(s.id).length ? h('span', { class: 'badge badge-demo' }, 'Deal') : null),
            h('p', { class: 'muted small' }, `${s.categories.join(' · ')} · Unit ${s.unit}`),
            statusPill(s.hours),
            h('p', { class: 'small' }, s.tagline),
          ),
          h('div', { class: 'card-actions' }, button('Details', () => a.openStore(s.id), { variant: 'ghost', ariaLabel: `${s.name} details` }), button('Take me there', () => a.navigate({ kind: 'store', id: s.id }), { icon: 'route', ariaLabel: `Take me to ${s.name}` })),
        ),
      );
    }
    for (const r of food) {
      list.append(
        h(
          'li',
          { class: 'card' },
          h('div', { class: 'card-accent', style: { background: r.color }, 'aria-hidden': 'true' }),
          h('div', { class: 'card-main' }, h('h3', {}, r.name), h('p', { class: 'muted small' }, `Food · ${r.cuisine} · Unit ${r.unit}`), statusPill(r.hours)),
          h('div', { class: 'card-actions' }, button('Menu', () => a.openRestaurant(r.id), { variant: 'ghost', ariaLabel: `${r.name} menu` }), button('Take me there', () => a.navigate({ kind: 'restaurant', id: r.id }), { icon: 'route', ariaLabel: `Take me to ${r.name}` })),
        ),
      );
    }
    if (!list.children.length) list.append(h('li', { class: 'muted' }, 'No stores in this category yet in the demo.'));
  };
  render();
  return h('div', { class: 'view' }, chipsEl, list);
}

// ---------- deals ----------
export function dealsView(a: Actions) {
  return h(
    'div',
    { class: 'view' },
    h('p', { class: 'notice' }, h('strong', {}, 'Demo promotions. '), 'These offers are fictional examples for the prototype and are not real.'),
    h(
      'ul',
      { class: 'card-list' },
      PROMOTIONS.map((p) => {
        const ref = refForPlaceId(p.placeId)!;
        return h(
          'li',
          { class: 'card deal' },
          h(
            'div',
            { class: 'card-main' },
            h('span', { class: 'badge badge-demo' }, 'Demo promotion'),
            h('h3', {}, p.title),
            h('p', { class: 'small' }, p.detail),
            h('p', { class: 'muted small' }, `${placeName(ref)} · ${p.ends}`),
          ),
          h('div', { class: 'card-actions' }, button('Take me there', () => a.navigate(ref), { icon: 'route', ariaLabel: `Take me to ${placeName(ref)}` })),
        );
      }),
    ),
  );
}

// ---------- facilities & info ----------
export function facilityView(f: Facility, a: Actions) {
  const extra =
    f.kind === 'parking' || f.kind === 'lift'
      ? h('ul', { class: 'bullets' }, CENTRE.parking.map((p) => h('li', {}, h('strong', {}, `${p.level} — ${p.spaces} spaces. `), p.note)))
      : null;
  return h(
    'div',
    { class: 'view' },
    h('p', {}, f.description),
    extra,
    h('div', { class: 'actions' }, button('Take me there', () => a.navigate({ kind: 'facility', id: f.id }), { icon: 'route', variant: 'primary' })),
  );
}

export function infoView(a: Actions) {
  return h(
    'div',
    { class: 'view' },
    h('div', { class: 'row gap wrap' }, statusPill(CENTRE.hours), h('span', { class: 'muted small' }, CENTRE.address)),
    h('div', { class: 'block' }, hoursTable(CENTRE.hours, 'Centre opening hours')),
    h('div', { class: 'block' }, h('h3', {}, 'Parking'), h('ul', { class: 'bullets' }, CENTRE.parking.map((p) => h('li', {}, h('strong', {}, `${p.level}: `), `${p.spaces} spaces. ${p.note}`)))),
    h(
      'div',
      { class: 'block' },
      h('h3', {}, 'Facilities'),
      h(
        'ul',
        { class: 'card-list compact' },
        FACILITIES.map((f) =>
          h('li', { class: 'card' }, h('div', { class: 'card-main' }, h('h4', {}, f.name), h('p', { class: 'muted small' }, f.description)), h('div', { class: 'card-actions' }, button('Go', () => a.navigate({ kind: 'facility', id: f.id }), { icon: 'route', ariaLabel: `Directions to ${f.name}` }))),
        ),
      ),
    ),
    h(
      'div',
      { class: 'block' },
      h('h3', {}, 'About this prototype'),
      h('p', { class: 'small' }, `${CENTRE.name} is a fictional one-floor shopping centre. All stores, products, prices, menus and promotions are demo content. Store names are fictional stand-ins for the kinds of retailers a real centre would host; no real logos or store interiors are used.`),
    ),
  );
}

// ---------- accessibility settings ----------
export interface Settings {
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  sensitivity: number;
  invertLook: boolean;
}

export function settingsView(settings: Settings, onChange: (s: Settings) => void) {
  const toggle = (key: 'largeText' | 'highContrast' | 'reducedMotion' | 'invertLook', label: string, desc: string) => {
    const id = `set-${key}`;
    return h(
      'div',
      { class: 'setting' },
      h('input', {
        type: 'checkbox',
        role: 'switch',
        id,
        checked: settings[key],
        'aria-describedby': `${id}-d`,
        onchange: (e: Event) => {
          settings[key] = (e.target as HTMLInputElement).checked;
          onChange(settings);
        },
      }),
      h('label', { for: id }, h('strong', {}, label), h('span', { id: `${id}-d`, class: 'muted small' }, desc)),
    );
  };
  const sens = h('input', {
    type: 'range',
    id: 'set-sens',
    min: '0.3',
    max: '2.5',
    step: '0.1',
    value: String(settings.sensitivity),
    oninput: (e: Event) => {
      settings.sensitivity = Number((e.target as HTMLInputElement).value);
      onChange(settings);
    },
  });
  return h(
    'div',
    { class: 'view' },
    toggle('largeText', 'Large text', 'Increases the size of all text and controls.'),
    toggle('highContrast', 'High contrast', 'Solid, high-contrast colours for panels, buttons and labels.'),
    toggle('reducedMotion', 'Reduce movement', 'No head-bob, animations or fly-throughs. Directions jump you to the destination instead of walking.'),
    toggle('invertLook', 'Invert vertical look', 'Swap the up/down direction when dragging to look around.'),
    h('div', { class: 'setting column' }, h('label', { for: 'set-sens' }, h('strong', {}, 'Look sensitivity')), sens),
    h(
      'div',
      { class: 'block' },
      h('h3', {}, 'Keyboard controls'),
      h(
        'dl',
        { class: 'keys' },
        [
          ['W A S D / ↑ ↓', 'Walk and step sideways'],
          ['← →', 'Turn left / right'],
          ['Page Up / Down', 'Look up / down'],
          ['Shift', 'Walk faster'],
          ['E or Enter', 'Interact with what you are facing'],
          ['/', 'Search'],
          ['M', 'Map'],
          ['B', 'Store directory'],
          ['R', 'Return to the centre'],
          ['H', 'Help'],
          ['Esc', 'Close a panel'],
          ['Tab', 'Move between buttons and menus'],
        ].flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)]),
      ),
    ),
    h('p', { class: 'muted small' }, 'Everything in the 3D view is also available from the Stores, Food, Deals, Map and Info menus, which work fully with a keyboard and screen reader.'),
  );
}

export function helpView(onStart: () => void, touch: boolean) {
  const rows = touch
    ? [
        ['Joystick (bottom left)', 'Walk'],
        ['Swipe', 'Look around 360°'],
        ['Tap', 'Open stores, products and signs'],
      ]
    : [
        ['W A S D', 'Walk (hold Shift to go faster)'],
        ['Drag with the mouse', 'Look around 360°'],
        ['Click', 'Open stores, products and signs'],
        ['E', 'Interact with what is in the centre of the screen'],
      ];
  return h(
    'div',
    { class: 'view' },
    h('ul', { class: 'help-list' }, rows.map(([k, v]) => h('li', {}, h('kbd', {}, k), h('span', {}, v)))),
    h('p', {}, 'Use the search bar to find a store or product, then follow the blue arrows on the floor. The map shows where you are.'),
    h('div', { class: 'actions' }, button('Start exploring', onStart, { variant: 'primary', icon: 'walk' })),
  );
}

// ---------- map panel ----------
export function mapPanelView(mapEl: SVGSVGElement, a: Actions) {
  const select = h(
    'select',
    { id: 'take-me', class: 'select' },
    h('option', { value: '' }, 'Choose a destination…'),
    h('optgroup', { label: 'Stores' }, STORES.map((s) => h('option', { value: `store:${s.id}` }, `${s.name} (${s.unit})`))),
    h('optgroup', { label: 'Food' }, RESTAURANTS.map((r) => h('option', { value: `restaurant:${r.id}` }, r.name))),
    h('optgroup', { label: 'Facilities' }, FACILITIES.map((f) => h('option', { value: `facility:${f.id}` }, f.name))),
  ) as HTMLSelectElement;
  const go = () => {
    if (!select.value) return;
    const [kind, id] = select.value.split(':') as [PlaceRef['kind'], string];
    a.navigate({ kind, id } as PlaceRef);
  };
  const legend = [
    ['Current location', 'lg-you'],
    ['Stores', 'lg-store'],
    ['Food court', 'lg-food'],
    ['Restrooms', 'lg-wc'],
    ['Entrances', 'lg-ent'],
    ['Parking', 'lg-park'],
    ['Escalators', 'lg-esc'],
    ['Lifts', 'lg-lift'],
    ['Your route', 'lg-route'],
  ];
  return h(
    'div',
    { class: 'view map-view' },
    h('div', { class: 'take-me' }, h('label', { for: 'take-me' }, h('strong', {}, 'Take me to')), select, button('Go', go, { icon: 'route', variant: 'primary' })),
    h('div', { class: 'map-wrap' }, mapEl),
    h('p', { class: 'muted small' }, 'Select any store, restaurant or icon on the map for directions.'),
    h('ul', { class: 'legend' }, legend.map(([t, c]) => h('li', {}, h('span', { class: `lg ${c}`, 'aria-hidden': 'true' }), t))),
  );
}
