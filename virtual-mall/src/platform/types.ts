/**
 * Digital-twin integration contracts.
 *
 * The prototype runs entirely on fictional, simulated data. These interfaces
 * describe how a REAL shopping centre would plug in without changing the 3D
 * world, the companion or the UI:
 *
 *   CentreDataSource  → floor plan, tenants, products, facilities (static-ish)
 *   LiveFeed          → opening hours now, events, crowding, weather (live)
 *   InventoryFeed     → per-store stock & price updates (live)
 *
 * The app never assumes data is real: every source declares `source`, and the
 * UI shows a "Demo data" badge unless a verified live source is connected.
 */
import type { Facility, Product, Promotion, Rect, Restaurant, Store, WeekHours } from '../data/mall';
import type { MallEvent } from '../data/events';
import type { Weather } from '../scene/world';

export type DataProvenance = 'demo' | 'simulated' | 'centre-feed' | 'retailer-feed';

/** Everything needed to generate a centre's virtual twin. Serialisable as JSON. */
export interface CentreSnapshot {
  schemaVersion: 1;
  provenance: DataProvenance;
  generatedAt: string;
  centre: {
    id: string;
    name: string;
    address: string;
    timezone: string;
    hours: WeekHours;
    /** Floor-plan geometry in metres (one level per entry). */
    levels: {
      id: string;
      name: string;
      elevation: number;
      bounds: Rect;
      walkable: Rect[];
      /** Walls/obstacles (derived from the uploaded floor plan). */
      obstacles: Rect[];
    }[];
    parking: { level: string; spaces: number; note: string }[];
  };
  stores: Store[];
  restaurants: Restaurant[];
  facilities: Facility[];
  promotions: Promotion[];
  events: MallEvent[];
}

export interface CentreDataSource {
  readonly provenance: DataProvenance;
  load(): Promise<CentreSnapshot>;
}

export interface LiveFeed extends EventTarget {
  readonly source: DataProvenance;
  isOpen(placeId: string): boolean;
  event: MallEvent | null;
  weather: Weather;
  /** 0 (empty) to 1 (peak). From footfall counters in a real centre. */
  crowd: number;
  now(): Date;
}

export interface StockUpdate {
  productId: string;
  price?: number;
  availability?: Product['availability'];
  stockNote?: string;
  updatedAt: string;
}

export interface InventoryFeed {
  readonly provenance: DataProvenance;
  subscribe(onUpdate: (u: StockUpdate[]) => void): () => void;
}
