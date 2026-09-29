# From demo to digital twin

The prototype runs on **fictional, simulated data**, and says so in the UI:
- demo badges on every promotion and event
- "Simulated" on the time and events panel
- "demo data" in Scout's header

The architecture is set up so a real shopping centre can replace that data without rewriting the 3D world, the AI companion or the interface.

## What a centre provides

| Data | Where it plugs in | Update frequency |
| --- | --- | --- |
| Floor plan (levels, walkable areas, walls, units) | `CentreSnapshot.centre.levels` | When the centre is refitted |
| Store locations, names, categories, hours | `CentreSnapshot.stores` | Weekly, or when tenants change |
| Products, prices, stock | `stores[].products` initially, then `InventoryFeed` | Minutes (retailer feeds) |
| Promotions | `CentreSnapshot.promotions` | Daily |
| Events | `CentreSnapshot.events` + `LiveFeed.event` | Daily |
| Opening status, crowding, weather | `LiveFeed` | Live (footfall counters, BMS) |

The contracts are in [`src/platform/types.ts`](../src/platform/types.ts):

- `CentreDataSource.load(): Promise<CentreSnapshot>` loads the static twin.
  - `DemoCentreSource` is the fictional Harbour Central.
  - `JsonCentreSource(url)` loads a real centre's export and **validates** it first. It checks for duplicate IDs, doors outside units, places outside the floor plan, missing hours, and promotions or events that point to unknown stores.
- `LiveFeed` covers opening status, the current event, crowd level, weather and "now". `LiveMall` (`src/app/live.ts`) implements it with simulated data.
- `InventoryFeed.subscribe()` carries per-product price and stock updates from retailer systems.

Every source declares its `provenance`: `'demo' | 'simulated' | 'centre-feed' | 'retailer-feed'`. The UI must never label demo or simulated data as real.

## Try the format

```bash
npm run export:centre   # writes public/centres/harbour-central.demo.json (validated)
npm test                # engine + validator tests
```

`harbour-central.demo.json` is the reference file a centre's system integrator would produce.

## Path to production

1. **Floor-plan import.** Convert CAD, DWG or IFC, or a traced SVG, into level rectangles and obstacle polygons. Generate a navmesh with `recast-navigation` so routes follow real corridors. The current visibility graph assumes rectangles.
2. **Geometry.** Generate shells from the plan, as `world.ts` does now. Swap in retailer-supplied glTF shopfronts and products where brands provide them.
3. **Multi-level.** Add a `level` to each place. Model lifts and escalators as graph edges with a time cost, and offer step-free routing.
4. **Live data.** Use a server-side aggregator that normalises centre and retailer feeds into `LiveFeed` and `InventoryFeed`, pushed to browsers over Server-Sent Events.
5. **Physical wayfinding (optional).** Add QR codes or BLE beacons at the entrances, so "Plan before you go" can continue on the shopper's phone inside the real centre.
6. **Privacy.** Keep analytics aggregate and consent-based. The companion must not use sensitive personal attributes; it already only uses what the shopper types, their cart, items viewed in the session, promotions and events.

## VR (WebXR)

`src/xr/xr.ts` adds an **Enter VR** button only when `navigator.xr` reports `immersive-vr` support. It provides:
- a camera rig
- teleport onto walkable spots
- smooth movement on the left thumbstick and 30° snap turns on the right
- controller-ray selection, with a floating info card inside VR (trigger on a product card adds it to the cart)

Post-processing is skipped in VR for frame rate. The HTML menus aren't visible inside a headset, so a full VR build would add a world-space menu and voice input for Scout. This mode has not been tested on a physical headset in this prototype.
