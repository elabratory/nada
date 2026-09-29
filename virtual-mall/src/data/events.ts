/**
 * Simulated events for the prototype. In a real deployment these would come
 * from the centre's events calendar through the LiveFeed (see
 * src/platform/). Every event here is fictional.
 */
export type EventKind = 'sneaker-launch' | 'gaming' | 'fashion' | 'food-festival' | 'christmas';

export interface MallEvent {
  id: string;
  kind: EventKind;
  name: string;
  tagline: string;
  description: string;
  /** Store or restaurant that hosts it. */
  placeId: string;
  /** Where the event set-piece stands on the floor plan. */
  x: number;
  z: number;
  /** Day of week (0 = Sunday) and hours, or 'december' for the seasonal market. */
  schedule: { days: number[]; from: number; to: number } | 'december';
  productIds: string[];
  /** Extra shoppers the event attracts (0–1 added to the crowd level). */
  crowdBoost: number;
  colors: [string, string];
}

export const EVENTS: MallEvent[] = [
  {
    id: 'sneaker-launch',
    kind: 'sneaker-launch',
    name: 'Velocity Runner 2 Launch',
    tagline: 'Sneaker launch · Sneaker Vault',
    description: 'Launch-day drop with a hero display, first-in-line giveaways and member pricing on the Velocity Runner 2.',
    placeId: 'vault',
    x: -36,
    z: 0,
    schedule: { days: [6], from: 10, to: 14 },
    productIds: ['vault-velocity', 'vault-court', 'vault-socks'],
    crowdBoost: 0.3,
    colors: ['#e63946', '#f1faee'],
  },
  {
    id: 'gaming',
    kind: 'gaming',
    name: 'GameSphere Night',
    tagline: 'Gaming event · Volt Hi-Fi',
    description: 'Free-play pods, a live tournament screen and bundle deals on the GameSphere X.',
    placeId: 'volt',
    x: -16,
    z: 0,
    schedule: { days: [5], from: 16, to: 21 },
    productIds: ['volt-console', 'volt-headphones', 'volt-tv'],
    crowdBoost: 0.25,
    colors: ['#7209b7', '#00f5d4'],
  },
  {
    id: 'fashion',
    kind: 'fashion',
    name: 'Autumn Style Walk',
    tagline: 'Fashion event · Thread & Co',
    description: 'Runway looks from the new season with stylists on hand to put outfits together.',
    placeId: 'thread',
    x: 16,
    z: 0,
    schedule: { days: [4], from: 17, to: 21 },
    productIds: ['thread-denim', 'thread-hoodie-black', 'thread-jeans', 'thread-linen'],
    crowdBoost: 0.2,
    colors: ['#d62839', '#ffffff'],
  },
  {
    id: 'food-festival',
    kind: 'food-festival',
    name: 'Harbour Food Festival',
    tagline: 'Food festival · Food Court',
    description: 'Tasting plates, pop-up stalls and live music in the Food Court.',
    placeId: 'pizza-corner',
    x: 26,
    z: 10,
    schedule: { days: [0], from: 11, to: 15 },
    productIds: [],
    crowdBoost: 0.3,
    colors: ['#f4a261', '#2a9d8f'],
  },
  {
    id: 'christmas',
    kind: 'christmas',
    name: 'Christmas Market',
    tagline: 'Seasonal market · Central concourse',
    description: 'A giant tree, market huts and gift wrapping. Runs every day in December.',
    placeId: 'thread',
    x: 36,
    z: 0,
    schedule: 'december',
    productIds: ['lumiere-gift-set', 'volt-speaker', 'stride-bottle', 'thread-tote', 'orchard-pods'],
    crowdBoost: 0.35,
    colors: ['#c1121f', '#2d6a4f'],
  },
];

export function eventActiveAt(e: MallEvent, now: Date) {
  if (e.schedule === 'december') return now.getMonth() === 11;
  const h = now.getHours() + now.getMinutes() / 60;
  return e.schedule.days.includes(now.getDay()) && h >= e.schedule.from && h < e.schedule.to;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function scheduleText(e: MallEvent) {
  if (e.schedule === 'december') return 'Every day in December';
  const f = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
  return `${e.schedule.days.map((d) => DAYS[d]).join(', ')} ${f(e.schedule.from)}–${f(e.schedule.to)}`;
}
