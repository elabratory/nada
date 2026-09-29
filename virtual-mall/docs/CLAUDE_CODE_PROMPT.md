# Claude Code prompt: build the Virtual Mall MVP

Copy everything inside the fence below into Claude Code in an empty folder or repository. It's written so Claude Code can build the MVP from scratch in one session. The `virtual-mall/` folder in this repo is a working reference implementation of the same prompt.

```text
You are building "Virtual Mall": a browser-based, lightweight virtual shopping centre.
Users explore a small fictional centre in 3D from a normal desktop or phone browser
(no VR headset), walk around, look 360°, enter shops, click products, search, get
directions, and see hours, food, bathrooms and parking.

It must be an interactive 3D environment, NOT a website with a picture of a mall.
Keep it small enough for one developer to maintain.

## Tech stack (use exactly this)
- Vite + TypeScript (strict) + Three.js (latest). No React for the MVP.
- Plain DOM/CSS for ALL UI (panels, search, map, menus) so it is accessible.
- No image or model assets: draw signage/ads/floor with <canvas> textures and build
  products from Three.js primitives. Zero external runtime requests.
- `npm run dev`, `npm run build` (tsc --noEmit && vite build), `npm run preview`.
- vite.config.ts: base './' so the build works from any static host.

## Project structure
src/data/mall.ts          single source of truth (types + fictional data + helpers)
src/scene/world.ts        builds the 3D centre from data; returns colliders & pickables
src/scene/products3d.ts   createProductMesh(shape, color, accent) from primitives
src/scene/textures.ts     canvas textures: store signs, wayfinding, price tags, ads, kiosk
src/scene/people.ts       animated shopper silhouettes (capsule + sphere)
src/controls/player.ts    first-person controller (keys, drag-look, joystick, collision, auto-walk)
src/nav/pathfinding.ts    visibility-graph + Dijkstra, turn-by-turn text
src/nav/route3d.ts        instanced chevrons on the floor + goal ring/beacon
src/ui/dom.ts             h() hyperscript helper, icons, toast(), announce() (aria-live)
src/ui/panel.ts           single accessible dialog (drawer/modal/wide), focus trap, Esc
src/ui/search.ts          search index + ARIA combobox
src/ui/map.ts             SVG floor plan (full + compact mini-map), player marker, route
src/ui/views.ts           store, product, restaurant, food, directory, deals, info, settings, help, map views
src/ui/preview.ts         shared mini WebGL renderer: rotating 3D product in the product panel
src/main.ts               app state machine: landing → entering → mall; wiring; main loop
src/styles.css            design tokens, responsive layout, high-contrast/large-text/reduced-motion

## Data model (src/data/mall.ts)
Coordinates in metres on the floor: x = west(-)→east(+), z = north(-)→south(+). One floor.
Types: Category = Fashion|Technology|Food|Beauty|Sport|Entertainment; Rect {x1,z1,x2,z2};
WeekHours = ([open,close]|null)[7] (Sunday=0); Product {id, storeId, name, type, price,
wasPrice?, optionLabel?, options?, description, details[], availability
('In stock'|'Low stock'|'Online only'), stockNote, tags[], shape, color, accent?, buyUrl};
Store {id, name, inspiredBy, categories[], tagline, description, unit, side
('north'|'south'), rect, doorX, color, accent, hours, phone, products[]};
Restaurant {id, name, cuisine, description, unit, x, z, color, accent, hours,
menu[{section, items[{name, price, popular?, note?}]}], tags[]};
Facility {id, name, kind (restroom|baby|lift|escalator|entrance|parking|info),
description, x, z, approach?, tags[]}; Promotion {id, placeId, title, detail, ends}.

Layout ("Harbour Central", fictional):
- Main concourse x -48..48, z -7..7 (ceiling 8 m, skylights). Central atrium with a pair
  of escalators (x -5.5..5.5, z -2.6..2.6) rising into a ceiling void with a
  "Level 2 · coming soon" sign.
- North side stores (z -21..-7): N01 x -44..-28, N02 x -24..-8, N03 x 8..24, N04 x 28..44.
- South side stores (z 7..21): S01 x -44..-28, S02 x -24..-8.
- Amenities alcove x -8..8, z -12..-7: restrooms, parents' room, lifts to parking.
- South entrance hall x -4..4, z 7..20 (bus interchange). West main entrance at x=-48,
  East entrance + Parking P1–P3 at x=48. Info desk near x=-9, z=-5.5.
- Food court x 8..44, z 7..24 with 4 counters on the back wall, tables and chairs.

Six FICTIONAL stores standing in for the requested brands. Do NOT use real brand names,
logos or store interiors. Record what each one stands in for in `inspiredBy`:
- Stride Athletics (Nike-style sportswear) – Sport/Fashion
- Orchard Tech (Apple-style electronics) – Technology
- Thread & Co (H&M-style fashion) – Fashion
- Lumière Beauty (Sephora-style beauty) – Beauty
- Sneaker Vault (Foot Locker-style sneakers) – Sport/Fashion
- Volt Hi-Fi (JB Hi-Fi-style entertainment) – Entertainment/Technology
Food court: Burger House (McDonald's-style), Sushi Express, Pizza Corner, Coffee Lab.
Each store: 4–5 demo products with price, options (e.g. running shoe sizes 7–11),
description, details, availability, and a placeholder buyUrl on example.com. Both Stride
and Sneaker Vault must sell "Running Shoes" so that searching "running shoes" returns
"Stride Athletics — Running Shoes" and "Sneaker Vault — Running Shoes".
Promotions (clearly labelled DEMO): "20% off selected running shoes",
"Buy 2 shirts, get 1 free", "Free coffee with breakfast", plus one per other store.
Helpers: storeInside/Outside(), placeTarget(ref), placeName(ref), locationText(ref),
openStatus(hours) → "Open now · closes 5:30 pm", hoursRows(), areaAt(x,z) for
"you are here" labels, money() formatting.

## 3D world (src/scene/world.ts)
- WebGLRenderer (antialias, ACES tone mapping), RoomEnvironment PMREM as
  scene.environment (intensity ~0.55), hemisphere + one directional + a few point lights,
  light fog. No shadow maps.
- Build everything from data with helper `slab(x1,z1,x2,z2,y1,y2,material,{collide})`,
  which also pushes an axis-aligned collider Rect.
- Storefronts: glass panels with a 5 m open doorway at doorX, a fascia with a canvas
  sign (name + categories), a projecting blade sign, a coloured feature wall inside
  with shelves of miniature products, side racks, a counter, and 5 white pedestals,
  each holding a slowly rotating product model + ring + price-tag Sprite + an invisible
  hit cylinder for easy clicking.
- Also: concourse fascia, filler walls, wall-mounted and totem digital ad screens
  (canvas that cycles through the promotions every 5 s), 2 directory kiosks,
  planters with trees and benches, entrances with glass doors and a bright sky backdrop,
  wayfinding signs (WC, lifts, escalators, parking, info), food court counters with menu
  boards, tables, chairs and pendant lights.
- ~14 walking shopper silhouettes plus a few seated ones. They never block clicks.
- Every clickable object gets userData.interact = {kind: store|product|restaurant|
  facility|kiosk|ad, id, label} and is added to `pickables`.
- Performance: put static meshes under one group and at the end merge them into one mesh
  per material (BufferGeometryUtils.mergeGeometries on non-indexed clones with
  position/normal/uv only). Target < ~350 draw calls. Cap pixel ratio (1.5 on touch).
- Return { scene, colliders, pickables, update(dt,t,reducedMotion),
  highlightProduct(id|null), productAnchor(id) }.

## Controls (src/controls/player.ts)
- Desktop: W/A/S/D move, Shift faster, ←/→ turn, PageUp/PageDown look up/down, drag with
  the mouse to look (grab style, sensitivity + invert settings), click to interact,
  E (or Enter on the canvas) interacts with whatever is under the centre reticle.
- Mobile: virtual joystick bottom-left (pointer events, touch-action none), swipe
  anywhere else to look, tap to interact.
- Eye height 1.65 m, circle collider radius 0.35 against the Rect list (push out),
  velocity smoothing, subtle head-bob (off with reduced motion).
- followPath(path, onDone) auto-walks a route; any movement input cancels it.
- Ignore movement keys while typing in inputs or while a dialog is open.

## Navigation (src/nav/*)
- Waypoints: concourse lanes at z=±3.8 on x = -45.5,-36,-26,-16,-7,7,16,26,36,45.5;
  outside/inside/deep points for every store door; food court aisle grid; restaurant
  fronts; south hall; amenities; facility approach points. Connect two nodes when the
  segment clears every collider inflated by 0.45 m (Liang–Barsky). For a route, link
  start and goal the same way and run Dijkstra.
- describeRoute(path, name) → ["Head east for 20 m", "Turn left and walk 6 m north",
  "Arrive at Sneaker Vault"].
- Show the route as glowing instanced chevrons on the floor plus a pulsing goal ring
  and beacon, as a dashed line on the mini-map and full map, and in a bottom "route
  card" with distance, walking time, step-by-step list (<details>), "Walk me there"
  (auto-walk; "Jump there" teleports when reduced motion is on) and Clear. Detect
  arrival within 1.8 m. Re-plan if the user wanders more than 5 m off the route.

## Screens & UI
1. Landing (cinematic): fullscreen 3D scene behind, with the camera flying slowly along
   a closed CatmullRom path through the concourse and food court (static shot if
   reduced motion). Gradient overlay. Top nav: Stores, Food, Deals, Map, Hours &
   parking, Accessibility. Headline "Step Inside Your Shopping Centre."; subheading
   "Explore stores, discover products and find your way around — before you even
   arrive."; buttons [Enter Shopping Centre] [Explore Stores]; a search box;
   3 feature tiles; category chips; footer saying all content is fictional demo data.
2. Enter: 1.8 s eased camera tween from the landing camera to eye level at the west
   entrance facing east, then the HUD fades in. First visit shows a "How to explore"
   help modal (desktop or touch variant).
3. HUD: top-left "you are here" chip (areaAt), top-centre search, top-right red
   [Exit Virtual Mall]; left vertical toolbar (bottom row on phones): Stores, Food,
   Deals, Map, Info, Centre (return to centre), Access, Help; centre reticle and an
   "E: <label>" prompt (desktop); hover tooltip with the object's label; mini-map
   bottom-right (click opens full map); "You are in <store> [Store info]
   [Back to concourse]" bar while inside a store; route card; joystick on touch.
4. Store panel (drawer): brand-colour band, categories, open status, description,
   "fictional stand-in" note, [Walk inside] [Directions], demo promotions, product
   grid, location, phone, full hours table (today highlighted).
   Clicking a storefront, sign or blade sign opens it. "Walk inside" auto-walks
   through the door (or teleports).
5. Product panel: live rotating 3D preview (drag to spin), price (+ struck-through
   was-price, "Demo sale"), availability pill + stock note, option chips as a radio
   group (e.g. sizes 7 8 9 10 11), description, details, store location,
   [Buy Online] (shows the placeholder link, never navigates), [Take me to the store]
   (routes and highlights that product's pedestal), [View store], back button.
6. Search: ARIA combobox with listbox results, arrow keys, Enter, Esc, and a result
   count in a live region. Index stores, products ("Store — Product type",
   "Name · $price"), restaurants, menu items, facilities (tags like bathroom/toilet/
   parking/elevator) and deals. Token-prefix matching with simple plural stemming.
   Every token must match. Weight name/type/tags above descriptions. Picking a
   result routes there (and highlights the product if it's a product).
7. Map (wide modal): SVG plan coloured by category, labels, restaurant counters,
   icons for restrooms, lifts, escalators, entrances, parking, info; the player
   marker with a view cone; the route; a legend; a "Take me to…" <select> + Go; every
   store/icon is a focusable button that routes there.
8. Directory: filter chips (All + 6 categories, aria-pressed), cards with stripe
   colour, open status, deal badge, [Details] [Take me there]. Restaurants appear
   under Food.
9. Food: restaurant cards (cuisine, status, popular items) → restaurant panel with
   menu + prices, popular badges, hours, location, promos, [Take me there].
10. Deals: list with "Demo promotion" labels and a notice that the offers are fictional.
11. Info: centre hours, parking levels, facilities with Go buttons, "About this
    prototype".
Clicking in-world things: ad screens → Deals, kiosks → Map, facility signs/doors
→ facility panel, food court sign → Food, restaurant counters/signs/menu boards →
restaurant panel.

## Accessibility (first-class, not an afterthought)
- Settings panel (persisted in localStorage inside try/catch): Large text (root
  font-size), High contrast (solid black/white/yellow tokens and thick borders),
  Reduce movement (defaults from prefers-reduced-motion; disables head-bob, spinning,
  ads cycling, fly-throughs and CSS transitions; routes teleport instead of walking),
  Invert look, Look sensitivity slider, plus a list of keyboard shortcuts.
- Keyboard: / search, M map, B directory, R return to centre, H help, Esc closes.
  Everything reachable by Tab, with visible :focus-visible outlines and 44 px targets.
- One dialog at a time: role=dialog, aria-modal, aria-labelledby, focus moves to the
  heading, Tab is trapped, Esc closes, focus is restored to the opener.
- aria-live announcements for entering/leaving stores, arrival, route summaries
  (including the steps), search counts. The canvas has an aria-label that explains the
  controls. The landing page and HUD use `inert` + aria-hidden when hidden.
- Every 3D feature has a non-3D equivalent (directory, map, search, info), so screen
  reader users can do everything without the canvas.
- If WebGL fails, keep the landing, directory, search and map working and show a toast.

## Visual design
Dark cinematic landing (deep navy, warm amber accent #f59e0b, big tight headline
clamp(2.5rem, 7vw, 5.4rem)). Glassy HUD (blurred dark translucent). White panels with
rounded 14–20 px corners, pills and chips coloured per category. On narrow screens,
drawers become bottom sheets, the toolbar becomes an icon row, and the mini-map hides.
Respect safe-area insets.

## Definition of done
- `npm run build` passes with zero TypeScript errors.
- Desktop: land → Enter → walk with WASD → drag to look → click a storefront → Walk
  inside → click a product → pick size → Buy Online shows a placeholder notice.
- Searching "running shoes" lists Stride Athletics — Running Shoes and Sneaker Vault —
  Running Shoes; choosing one draws floor arrows and a map route; Walk me there arrives.
- Map "Take me to Sneaker Vault" works; bathrooms, parking, lifts and food are all
  routable.
- Phone (e.g. an iPhone 13 viewport): joystick walks, swipe looks, tap opens products,
  panels are bottom sheets.
- Everything works with the keyboard only; reduced motion removes all animation.
- Write a README with how to run, controls, and how to replace the demo data.
```

## Tips when running this prompt

- Ask Claude Code to **run `npm run build` after each major step**, and to test with Playwright screenshots (desktop and an iPhone viewport).
- If the scene is slow on phones, ask it to report `renderer.info.render.calls` and reduce draw calls by merging more static geometry.
- Next prompts to try: "Add WebXR VR mode with teleport locomotion", "Load products from a JSON file", "Add a second floor using the lifts and escalators in routing".
