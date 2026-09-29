type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

/** Tiny hyperscript helper: h('button', { class: 'btn', onclick }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v as Record<string, string>)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else (el.style as unknown as Record<string, string>)[prop] = val;
      }
    }
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: Element, children: (Child | Child[])[]) {
  for (const c of (children as unknown[]).flat(Infinity) as Child[]) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

let liveTimer = 0;
/** Speak a message to screen readers via the polite live region. */
export function announce(msg: string) {
  const live = document.getElementById('live')!;
  live.textContent = '';
  window.clearTimeout(liveTimer);
  liveTimer = window.setTimeout(() => (live.textContent = msg), 60);
}

let toastTimer = 0;
export function toast(msg: string, ms = 3200) {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
  announce(msg);
}

const ICONS: Record<string, string> = {
  store: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  food: 'M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9',
  deals: 'M20 12l-8 8-9-9V3h8zM7.5 7.5h.01',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-5M12 8h.01',
  access: 'M12 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4 7l8 2 8-2M12 9v5l-3 7M12 14l3 7',
  home: 'M3 11l9-8 9 8M5 9.5V21h14V9.5',
  exit: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 18l-6-6 6-6',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8',
  walk: 'M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 22l2-7 3 3v6M8 12l2-5 4 1 2 4M10 7l-3 2',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  cart: 'M3 3h2l2.4 12.2a2 2 0 0 0 2 1.8h8.2a2 2 0 0 0 2-1.6L21 8H6M9 21h.01M18 21h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  pin: 'M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
};

export function icon(name: keyof typeof ICONS | string, size = 20) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name] ?? ''}"/></svg>`;
  return span;
}

export function button(label: string, onClick: () => void, opts: { icon?: string; variant?: string; ariaLabel?: string } = {}) {
  return h(
    'button',
    { type: 'button', class: `btn ${opts.variant ?? ''}`.trim(), onclick: onClick, 'aria-label': opts.ariaLabel },
    opts.icon ? icon(opts.icon, 18) : null,
    h('span', {}, label),
  );
}
