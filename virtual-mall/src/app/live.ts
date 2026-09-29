import { CENTRE, RESTAURANTS, STORES, clock, openStatus, storeById, type WeekHours } from '../data/mall';
import { EVENTS, eventActiveAt, type MallEvent } from '../data/events';
import type { Weather } from '../scene/world';
import type { LiveFeed } from '../platform/types';

/**
 * The "living mall": a simulated clock that drives daylight, weather,
 * crowds, store opening hours and events.
 *
 * - "Live" follows the real time of day.
 * - "Preview" lets the shopper scrub to any time (and optionally
 *   fast-forward), to see what the centre is like at 9 am vs. 7 pm.
 *
 * Everything here is simulated demo data exposed through the same LiveFeed
 * interface a real centre's systems would implement (src/platform/).
 */
export class LiveMall extends EventTarget implements LiveFeed {
  mode: 'live' | 'preview' = 'live';
  /** Preview time as a Date. */
  private preview = new Date();
  /** Simulated minutes per real second while previewing (0 = paused). */
  speed = 0;
  weatherChoice: Weather | 'auto' = 'auto';
  /** 'auto' follows the schedule; otherwise force an event id or none. */
  eventChoice: string | 'auto' | 'none' = 'auto';
  event: MallEvent | null = null;
  weather: Weather = 'clear';
  crowd = 0.5;
  private open = new Set<string>();
  private lastMinute = -1;
  private warned = new Set<string>();
  readonly source = 'simulated' as const;

  constructor() {
    super();
    clock.now = () => this.now();
    this.preview.setMinutes(0, 0, 0);
    this.recompute(true);
  }

  now() {
    return this.mode === 'live' ? new Date() : new Date(this.preview);
  }

  get hour() {
    const n = this.now();
    return n.getHours() + n.getMinutes() / 60;
  }

  setPreview(hour: number, day?: number) {
    this.mode = 'preview';
    const d = new Date(this.preview);
    if (day !== undefined) d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7));
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    this.preview = d;
    this.recompute(true);
  }

  setLive() {
    this.mode = 'live';
    this.speed = 0;
    this.recompute(true);
  }

  isOpen(storeId: string) {
    return this.open.has(storeId);
  }

  /** Hours object for a store or restaurant id. */
  private hoursFor(id: string): WeekHours | undefined {
    return storeById(id)?.hours ?? RESTAURANTS.find((r) => r.id === id)?.hours;
  }

  closesInMinutes(id: string) {
    const h = this.hoursFor(id);
    const n = this.now();
    const today = h?.[n.getDay()];
    if (!today) return null;
    const [ch, cm] = today[1].split(':').map(Number);
    const mins = ch * 60 + cm - (n.getHours() * 60 + n.getMinutes());
    return mins > 0 ? mins : null;
  }

  tick(dt: number) {
    if (this.mode === 'preview' && this.speed > 0) this.preview = new Date(this.preview.getTime() + dt * this.speed * 60000);
    const m = Math.floor(this.now().getTime() / 60000);
    if (m !== this.lastMinute) this.recompute(false);
  }

  /** Recalculate everything that depends on time, weather and events. */
  recompute(force: boolean) {
    const now = this.now();
    this.lastMinute = Math.floor(now.getTime() / 60000);
    const h = now.getHours() + now.getMinutes() / 60;
    const centreOpen = openStatus(CENTRE.hours, now).open;
    const before = new Set(this.open);
    this.open.clear();
    for (const s of STORES) if (centreOpen && openStatus(s.hours, now).open) this.open.add(s.id);
    for (const r of RESTAURANTS) if (openStatus(r.hours, now).open) this.open.add(r.id);

    // Weather: a deterministic "forecast" per day in auto mode.
    if (this.weatherChoice === 'auto') {
      const seed = (now.getDate() * 7 + now.getMonth() * 3) % 10;
      this.weather = seed < 6 ? 'clear' : seed < 8 ? 'cloudy' : h > 13 && h < 17 ? 'rain' : 'cloudy';
    } else this.weather = this.weatherChoice;

    // Event: schedule or forced choice.
    const prevEvent = this.event;
    if (this.eventChoice === 'auto') this.event = EVENTS.find((e) => eventActiveAt(e, now)) ?? null;
    else if (this.eventChoice === 'none') this.event = null;
    else this.event = EVENTS.find((e) => e.id === this.eventChoice) ?? null;

    // Crowds: quiet mornings, lunch peak, busy afternoons, late-night lull.
    const curve = h < 9 ? 0.1 : h < 11 ? 0.3 : h < 14 ? 0.8 : h < 17 ? 0.65 : h < 19 ? 0.5 : 0.25;
    const weekend = now.getDay() === 0 || now.getDay() === 6 ? 0.15 : 0;
    const rain = this.weather === 'rain' ? 0.1 : 0;
    this.crowd = centreOpen ? Math.min(1, curve + weekend + rain + (this.event?.crowdBoost ?? 0)) : 0.03;

    const changedStores = force || before.size !== this.open.size || [...before].some((id) => !this.open.has(id));
    if (changedStores) this.dispatchEvent(new Event('stores'));
    if (force || prevEvent?.id !== this.event?.id) this.dispatchEvent(new CustomEvent('event', { detail: { previous: prevEvent } }));
    this.dispatchEvent(new Event('change'));

    // Closing-soon notices (once per store per day).
    for (const s of STORES) {
      const mins = this.isOpen(s.id) ? this.closesInMinutes(s.id) : null;
      const key = `${s.id}-${now.toDateString()}`;
      if (mins !== null && mins <= 15 && !this.warned.has(key)) {
        this.warned.add(key);
        this.dispatchEvent(new CustomEvent('closing', { detail: { storeId: s.id, minutes: mins } }));
      }
    }
  }

  label() {
    const n = this.now();
    const t = n.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    const d = n.toLocaleDateString('en-AU', { weekday: 'short' });
    return `${d} ${t}`;
  }
}
