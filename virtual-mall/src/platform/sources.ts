import { CENTRE, FACILITIES, PROMOTIONS, RESTAURANTS, STORES } from '../data/mall';
import { EVENTS } from '../data/events';
import type { CentreDataSource, CentreSnapshot } from './types';

/**
 * The fictional Harbour Central, packaged in the same shape a real centre
 * would upload. `provenance: 'demo'` travels with the data so no screen can
 * present it as real.
 */
export class DemoCentreSource implements CentreDataSource {
  readonly provenance = 'demo' as const;
  async load(): Promise<CentreSnapshot> {
    return demoSnapshot();
  }
}

export function demoSnapshot(): CentreSnapshot {
  return {
    schemaVersion: 1,
    provenance: 'demo',
    generatedAt: new Date().toISOString(),
    centre: {
      id: 'harbour-central-demo',
      name: CENTRE.name,
      address: CENTRE.address,
      timezone: 'Australia/Sydney',
      hours: CENTRE.hours,
      levels: [
        {
          id: 'L0',
          name: 'Ground floor',
          elevation: 0,
          bounds: CENTRE.bounds,
          walkable: [CENTRE.concourse, CENTRE.foodCourt, CENTRE.southHall, CENTRE.amenities, ...STORES.map((s) => s.rect)],
          obstacles: [],
        },
      ],
      parking: CENTRE.parking,
    },
    stores: STORES,
    restaurants: RESTAURANTS,
    facilities: FACILITIES,
    promotions: PROMOTIONS,
    events: EVENTS,
  };
}

/**
 * Loads a centre from a JSON file or API endpoint (e.g. exported from the
 * centre's leasing/CMS systems). Validated before use; the app refuses data
 * that would produce broken routes or orphaned products.
 */
export class JsonCentreSource implements CentreDataSource {
  constructor(
    private url: string,
    readonly provenance: 'centre-feed' | 'demo' = 'centre-feed',
  ) {}
  async load(): Promise<CentreSnapshot> {
    const res = await fetch(this.url);
    if (!res.ok) throw new Error(`Couldn't load centre data (${res.status})`);
    const data = (await res.json()) as CentreSnapshot;
    const errors = validateSnapshot(data);
    if (errors.length) throw new Error(`Centre data is invalid:\n- ${errors.join('\n- ')}`);
    return data;
  }
}

/** Structural checks a real upload must pass before a twin is generated. */
export function validateSnapshot(s: CentreSnapshot): string[] {
  const e: string[] = [];
  if (s.schemaVersion !== 1) e.push(`Unsupported schemaVersion ${s.schemaVersion}`);
  if (!s.centre?.name) e.push('centre.name is required');
  if (!s.centre?.levels?.length) e.push('At least one level with a floor plan is required');
  const ids = new Set<string>();
  const dup = (id: string, what: string) => {
    if (ids.has(id)) e.push(`Duplicate id "${id}" (${what})`);
    ids.add(id);
  };
  const within = (x: number, z: number) =>
    s.centre.levels.some((l) => x >= l.bounds.x1 && x <= l.bounds.x2 && z >= l.bounds.z1 && z <= l.bounds.z2);
  for (const st of s.stores ?? []) {
    dup(st.id, 'store');
    if (st.rect.x2 <= st.rect.x1 || st.rect.z2 <= st.rect.z1) e.push(`Store ${st.id} has an empty footprint`);
    if (st.doorX < st.rect.x1 || st.doorX > st.rect.x2) e.push(`Store ${st.id} door is outside its footprint`);
    if (!within((st.rect.x1 + st.rect.x2) / 2, (st.rect.z1 + st.rect.z2) / 2)) e.push(`Store ${st.id} is outside the floor plan`);
    if (st.hours?.length !== 7) e.push(`Store ${st.id} needs opening hours for 7 days`);
    for (const p of st.products ?? []) {
      dup(p.id, 'product');
      if (p.storeId !== st.id) e.push(`Product ${p.id} is listed under ${st.id} but says storeId ${p.storeId}`);
      if (!(p.price >= 0)) e.push(`Product ${p.id} has an invalid price`);
    }
  }
  for (const r of s.restaurants ?? []) {
    dup(r.id, 'restaurant');
    if (!within(r.x, r.z)) e.push(`Restaurant ${r.id} is outside the floor plan`);
  }
  for (const f of s.facilities ?? []) {
    dup(f.id, 'facility');
    if (!within(f.x, f.z)) e.push(`Facility ${f.id} is outside the floor plan`);
  }
  const placeIds = new Set([...(s.stores ?? []).map((x) => x.id), ...(s.restaurants ?? []).map((x) => x.id)]);
  for (const p of s.promotions ?? []) if (!placeIds.has(p.placeId)) e.push(`Promotion ${p.id} points to unknown place ${p.placeId}`);
  for (const ev of s.events ?? []) if (!placeIds.has(ev.placeId)) e.push(`Event ${ev.id} points to unknown place ${ev.placeId}`);
  return e;
}
