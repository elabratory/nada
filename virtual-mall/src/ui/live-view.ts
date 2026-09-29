import { STORES } from '../data/mall';
import { EVENTS, eventActiveAt, scheduleText } from '../data/events';
import type { LiveMall } from '../app/live';
import type { Weather } from '../scene/world';
import { button, h } from './dom';

/** "What's on": simulated time of day, weather, crowds and events. */
export function liveView(live: LiveMall, a: { goToEvent(id: string): void; onChange(): void }) {
  const root = h('div', { class: 'view' });
  const draw = () => {
    root.innerHTML = '';
    const now = live.now();
    const hour = now.getHours() + now.getMinutes() / 60;
    const open = STORES.filter((s) => live.isOpen(s.id)).length;
    const crowdText = live.crowd < 0.2 ? 'Quiet' : live.crowd < 0.5 ? 'Steady' : live.crowd < 0.8 ? 'Busy' : 'Very busy';
    root.append(
      h(
        'dl',
        { class: 'mission-stats' },
        h('div', {}, h('dt', {}, 'Time'), h('dd', {}, live.label())),
        h('div', {}, h('dt', {}, 'Stores open'), h('dd', {}, `${open}/${STORES.length}`)),
        h('div', {}, h('dt', {}, 'Crowds'), h('dd', {}, crowdText)),
        h('div', {}, h('dt', {}, 'Weather'), h('dd', {}, live.weather)),
      ),
      h('p', { class: 'notice' }, h('strong', {}, 'Simulated. '), 'Time, crowds, weather and events are demo data so you can preview the centre at different times. A real centre would feed these from its own systems.'),
    );

    // Time controls
    const slider = h('input', { type: 'range', id: 'live-hour', min: '6', max: '23', step: '0.25', value: String(hour) }) as HTMLInputElement;
    const out = h('output', { for: 'live-hour', class: 'hour-out' }, live.label());
    slider.addEventListener('input', () => {
      live.setPreview(Number(slider.value));
      out.textContent = live.label();
      a.onChange();
    });
    slider.addEventListener('change', draw);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    root.append(
      h(
        'div',
        { class: 'block' },
        h('h3', {}, 'Time of day'),
        h(
          'div',
          { class: 'chips', role: 'group', 'aria-label': 'Clock' },
          h('button', { type: 'button', class: `chip chip-btn${live.mode === 'live' ? ' on' : ''}`, 'aria-pressed': String(live.mode === 'live'), onclick: () => (live.setLive(), a.onChange(), draw()) }, 'Live now'),
          ...[
            [8, 'Early morning'],
            [12.5, 'Lunchtime'],
            [16, 'Afternoon'],
            [20.75, 'Closing time'],
          ].map(([hr, label]) => h('button', { type: 'button', class: 'chip chip-btn', onclick: () => (live.setPreview(hr as number), a.onChange(), draw()) }, label as string)),
        ),
        h('label', { for: 'live-hour', class: 'small muted' }, 'Preview a time'),
        h('div', { class: 'row gap' }, slider, out),
        h(
          'div',
          { class: 'chips', role: 'group', 'aria-label': 'Day' },
          days.map((d, i) =>
            h('button', { type: 'button', class: `chip chip-btn${now.getDay() === i ? ' on' : ''}`, 'aria-pressed': String(now.getDay() === i), onclick: () => (live.setPreview(hour, i), a.onChange(), draw()) }, d),
          ),
        ),
        h(
          'label',
          { class: 'check', for: 'live-ff' },
          h('input', {
            type: 'checkbox',
            id: 'live-ff',
            checked: live.speed > 0,
            onchange: (e: Event) => {
              if (live.mode === 'live') live.setPreview(hour);
              live.speed = (e.target as HTMLInputElement).checked ? 10 : 0;
            },
          }),
          'Fast-forward (10 simulated minutes per second)',
        ),
      ),
    );

    // Weather
    root.append(
      h(
        'div',
        { class: 'block' },
        h('h3', {}, 'Weather outside'),
        h(
          'div',
          { class: 'chips', role: 'group', 'aria-label': 'Weather' },
          (['auto', 'clear', 'cloudy', 'rain'] as (Weather | 'auto')[]).map((w) =>
            h(
              'button',
              { type: 'button', class: `chip chip-btn${live.weatherChoice === w ? ' on' : ''}`, 'aria-pressed': String(live.weatherChoice === w), onclick: () => ((live.weatherChoice = w), live.recompute(true), a.onChange(), draw()) },
              w === 'auto' ? 'Forecast' : w[0].toUpperCase() + w.slice(1),
            ),
          ),
        ),
      ),
    );

    // Events
    root.append(
      h(
        'div',
        { class: 'block' },
        h('h3', {}, 'Events'),
        h(
          'div',
          { class: 'chips', role: 'group', 'aria-label': 'Event mode' },
          h('button', { type: 'button', class: `chip chip-btn${live.eventChoice === 'auto' ? ' on' : ''}`, onclick: () => ((live.eventChoice = 'auto'), live.recompute(true), a.onChange(), draw()) }, 'Follow schedule'),
          h('button', { type: 'button', class: `chip chip-btn${live.eventChoice === 'none' ? ' on' : ''}`, onclick: () => ((live.eventChoice = 'none'), live.recompute(true), a.onChange(), draw()) }, 'No event'),
        ),
        h(
          'ul',
          { class: 'card-list' },
          EVENTS.map((e) => {
            const on = live.event?.id === e.id;
            const scheduled = eventActiveAt(e, now);
            return h(
              'li',
              { class: `card${on ? ' event-on' : ''}` },
              h('div', { class: 'card-accent', style: { background: e.colors[0] }, 'aria-hidden': 'true' }),
              h(
                'div',
                { class: 'card-main' },
                h('h3', {}, e.name, on ? h('span', { class: 'badge badge-sale' }, 'On now') : null),
                h('p', { class: 'muted small' }, `${e.tagline} · ${scheduleText(e)}${scheduled && !on ? ' · scheduled now' : ''}`),
                h('p', { class: 'small' }, e.description),
                h('span', { class: 'badge badge-demo' }, 'Demo event'),
              ),
              h(
                'div',
                { class: 'card-actions' },
                button(on ? 'Showing' : 'Preview', () => ((live.eventChoice = e.id), live.recompute(true), a.onChange(), draw()), { variant: 'ghost', ariaLabel: `Preview ${e.name}` }),
                button('Go', () => a.goToEvent(e.id), { icon: 'route', ariaLabel: `Directions to ${e.name}` }),
              ),
            );
          }),
        ),
      ),
    );
  };
  draw();
  return root;
}
