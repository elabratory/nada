# Virtual Mall

**Step Inside Your Shopping Centre.** A browser-based, lightweight virtual shopping centre.

Visitors can:
- walk around a 3D centre on desktop or phone (no VR headset needed)
- look around 360°
- enter shops and click products to see prices, sizes and stock
- search for stores or products
- follow turn-by-turn directions
- check opening hours, food, bathrooms and parking

This folder is a working **MVP prototype**. It shows one fictional centre, *Harbour Central*: one floor, six stores and a four-outlet food court.

> All store names, products, prices, menus and promotions are **fictional demo content**. Each store stands in for a kind of retailer: Stride Athletics for Nike, Orchard Tech for Apple, Thread & Co for H&M, Lumière Beauty for Sephora, Sneaker Vault for Foot Locker, Volt Hi-Fi for JB Hi-Fi, and Burger House for McDonald's. No real logos, interiors or trademarks are used.

## Run it

Requirements: Node.js 20+.

```bash
cd virtual-mall
npm install
npm run dev        # http://localhost:5173 (also reachable from your phone on the same Wi-Fi)
npm run build      # type-checks and builds a static site into dist/
npm run preview    # serve the production build
```

`dist/` is a plain static site with relative paths. You can upload it to Netlify, Vercel, GitHub Pages, S3/CloudFront or any web server.

## Controls

| | Desktop | Phone / tablet |
|---|---|---|
| Walk | `W` `A` `S` `D` (hold `Shift` to go faster), `↑` `↓` | Virtual joystick (bottom left) |
| Look around | Drag with the mouse; `←` `→` turn; `Page Up/Down` look up/down | Swipe |
| Interact | Click, or `E` for whatever is under the centre dot | Tap |
| Shortcuts | `/` search · `M` map · `B` stores · `R` return to centre · `H` help · `Esc` close | Toolbar buttons |

Always visible: **Exit Virtual Mall** (top right) and **Centre** (toolbar), which takes you back to the central atrium.

## What's in the MVP

- **Cinematic landing page** with a live 3D fly-through behind the headline, *Enter Shopping Centre* and *Explore Stores* buttons, search and category shortcuts.
- **3D centre**:
  - shopfronts with signs
  - escalators rising to a "Level 2 — coming soon" void
  - seating and plants
  - information kiosks and cycling digital ads
  - walking shopper silhouettes
  - skylights and lighting
  - three entrances
  - an amenities alcove (restrooms, parents' room, lifts)
  - a food court with counters, menu boards and tables
- **Stores**: name, categories, hours with open/closed status, description, products, demo promotions and unit location. Clicking a storefront opens its entrance panel, and *Walk inside* takes you in.
- **Products**:
  - a rotating 3D model (drag to spin)
  - price and sale price
  - size or option picker
  - availability
  - details and store location
  - *Buy Online* (placeholder link)
  - *Take me to the store*
- **Search**: "Search stores or products...". For example, *running shoes* returns Stride Athletics — Running Shoes and Sneaker Vault — Running Shoes. Clicking a result starts directions.
- **Indoor navigation**:
  - glowing arrows on the floor
  - a route on the mini-map and full map
  - step-by-step text directions
  - *Walk me there* auto-walk
  - arrival detection
  - automatic re-routing if you wander off
- **Interactive map**: current location and heading, stores, food court, restrooms, entrances, parking, escalators, lifts and info desk, plus a *Take me to…* picker.
- **Store directory** with category filters (Fashion, Technology, Food, Beauty, Sport, Entertainment).
- **Food court** with menus, prices, popular items, hours and locations.
- **Deals** section, with every offer clearly labelled as a demo promotion.
- **Accessibility**:
  - large text
  - high contrast
  - reduce movement (also follows your OS setting)
  - invert look and sensitivity controls
  - full keyboard control
  - focus-trapped dialogs
  - screen-reader announcements
  - a 2D equivalent for every 3D feature

## Replace the demo data

Everything is generated from **`src/data/mall.ts`**: the floor-plan rectangles, stores, products, restaurants, facilities, promotions and hours. Edit that file and the 3D world, map, search, directory and navigation all update automatically. This is also the shape of the data a real centre would upload in the long-term product.

## Documentation

- [`docs/TECHNOLOGY.md`](docs/TECHNOLOGY.md): which technology to use and why (Three.js vs Babylon.js vs React/Next.js), the architecture, and how to add WebXR headset support later
- [`docs/BUSINESS_MODEL.md`](docs/BUSINESS_MODEL.md): how this could make money, and what value it must prove first
- [`docs/CLAUDE_CODE_PROMPT.md`](docs/CLAUDE_CODE_PROMPT.md): a detailed prompt that tells Claude Code exactly how to build this MVP from scratch

## Project layout

```
src/
  data/mall.ts          fictional centre data + helpers (single source of truth)
  scene/                3D world, product models, canvas textures, silhouettes
  controls/player.ts    first-person movement, look, joystick, collisions, auto-walk
  nav/                  pathfinding (visibility graph + Dijkstra) and floor arrows
  ui/                   panels, search, SVG map, views, product preview
  main.ts               app state (landing ↔ mall), routing, interactions, main loop
```
