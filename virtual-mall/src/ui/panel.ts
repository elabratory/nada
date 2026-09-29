import { h, icon } from './dom';

/**
 * One accessible dialog at a time. Drawers slide in from the right (bottom
 * sheet on phones); modals are centred. Escape closes, focus is trapped
 * inside and restored to whatever opened it.
 */
export interface PanelOptions {
  title: string;
  subtitle?: string;
  body: HTMLElement;
  variant?: 'drawer' | 'modal' | 'wide';
  onBack?: () => void;
  onClose?: () => void;
}

let current: { el: HTMLElement; restore: Element | null; onClose?: () => void } | null = null;
let counter = 0;

export function isPanelOpen() {
  return !!current;
}

export function closePanel() {
  if (!current) return;
  const { el, restore, onClose } = current;
  current = null;
  el.classList.remove('open');
  const root = document.getElementById('panel-root')!;
  const rm = () => el.remove();
  if (document.documentElement.classList.contains('reduce-motion')) rm();
  else setTimeout(rm, 220);
  root.classList.remove('has-modal');
  onClose?.();
  if (restore instanceof HTMLElement && document.body.contains(restore)) restore.focus();
}

export function openPanel(o: PanelOptions) {
  const restore = current ? current.restore : document.activeElement;
  if (current) {
    const old = current.el;
    current = null;
    old.remove();
  }
  const id = `panel-title-${++counter}`;
  const variant = o.variant ?? 'drawer';
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close panel', onclick: () => closePanel() }, icon('close'));
  const backBtn = o.onBack
    ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Back', onclick: () => o.onBack!() }, icon('back'))
    : null;
  const heading = h('h2', { id, tabindex: '-1' }, o.title);
  const el = h(
    'section',
    { class: `panel panel-${variant}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
    h('header', { class: 'panel-head' }, backBtn, h('div', { class: 'panel-titles' }, heading, o.subtitle ? h('p', { class: 'panel-sub' }, o.subtitle) : null), closeBtn),
    h('div', { class: 'panel-body' }, o.body),
  );
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
    }
    if (e.key === 'Tab') trapTab(e, el);
  });
  const root = document.getElementById('panel-root')!;
  root.append(el);
  root.classList.toggle('has-modal', variant !== 'drawer');
  current = { el, restore, onClose: o.onClose };
  requestAnimationFrame(() => {
    el.classList.add('open');
    heading.focus({ preventScroll: true });
  });
  return el;
}

function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const items = [...root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (x) => !x.hasAttribute('disabled') && x.offsetParent !== null,
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
