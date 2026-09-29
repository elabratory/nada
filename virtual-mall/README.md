# Virtual Mall

**An AI shopping centre you can actually explore.** Walk a 3D shopping centre in your browser, on a computer or a phone, with no headset needed. Scout, your AI shopping companion, finds products, compares them, keeps you on budget and walks you to them. Every feature serves one loop:

**DISCOVER → COMPARE → PLAN → SHOP**

This folder is a working prototype of a fictional one-floor centre, *Harbour Central*. It has:
- 6 stores and 36 products
- a 4-outlet food court
- security, facilities, events, and simulated opening hours, crowds and weather

> Everything is **fictional demo data**. Each store stands in for a kind of retailer: Stride Athletics for Nike, Orchard Tech for Apple, Thread & Co for H&M, Lumière Beauty for Sephora, Sneaker Vault for Foot Locker, Volt Hi-Fi for JB Hi-Fi, and Burger House for McDonald's. No real logos, prices or stock are used. The UI labels demo and simulated data everywhere.

## Run it

```bash
cd virtual-mall
npm install
npm run dev            # http://localhost:5173 (use --host to open it on your phone)
npm test               # companion, budget, mission and data-validation tests
npm run build          # type-check + static build in dist/
npm run export:centre  # export the demo centre in the digital-twin JSON format
```

## What you can do

### Discover: Scout, the AI shopping companion
A glowing companion follows you through the centre. Click it, press **C**, choose **Ask Scout**, or ask from the landing page. Try:

- "I need running shoes under $150"
- "I need an outfit for a $200 budget"
- "I'm looking for a birthday gift for my brother". Scout suggests well-rated gifts and asks what the person is into. It never guesses from who the gift is for.
- "I want a black hoodie" · "I need a phone for under $800"
- "Just looking". This is discovery mode, based only on your budget, the categories you pick, items you viewed here, promotions and the current event.
- "compare them", "find something cheaper", "add the best one", "where are the toilets?", "what's on?"

Scout **only uses products that exist in the centre's catalogue**; `npm test` checks this. For each result it shows:
- the price and demo rating
- stock
- which store, and how far away
- *Add*, *View*, *Compare* and *Go* buttons

Voice input works in browsers that support speech recognition. An optional LLM brain can be plugged in behind your own proxy; answers are still validated against the catalogue (`src/ai/llm-brain.ts`).

### Compare
- Add up to 3 products to the comparison tray.
- **Comparison table**: price, rating, features (with the ones only one product has highlighted), colour, availability, store and distance, price difference, plus a written summary.
- **Side by side in 3D**: holographic plinths appear in front of you, showing price, rating, stock and *Cheapest*, *Best rated* and *Best value* badges.

### Plan
- **Shopping missions**. For example, "Buy: running shoes, black hoodie, birthday gift. Budget $300". Scout picks the best combination within budget and orders the stores into the **shortest walk** (exact search). It shows walking time, total cost, stores visited, and any items it couldn't find.
- **Shop before you go**. Plan a real visit from home: day, arrival time, car, bus or on foot, food break, and restroom or parents'-room stops. You get a timed **Your Shopping Plan** (for example "10:00 — Arrive … 10:05 — Stride Athletics …"). It warns you about stores that will be closed, and you can save it, copy it, or walk it in 3D.

### Shop
- **Live cart** that persists on this device: product, store, price, quantity, estimated total.
- **Smart budget**: a budget meter in the HUD. If an item would take you over, Scout says by how much and offers cheaper similar items from the centre, or lets you add it anyway.
- **Modes**:
  - *Explore*: just walk around.
  - *Shopping*: cart and budget stay with you.
  - *Personal Shopper*: Scout guides you proactively. For example: "You're 20 metres from Sneaker Vault", "The shoes you wanted are available here", "After this store, your next stop is Thread & Co".

### A living mall (simulated)
- **Time of day and day/night cycle**: the sun moves through the skylights, and evenings are lit by the centre's own lights. Choose *Live now* or preview any time; fast-forward is available.
- **Opening hours**: closed stores drop their shutters and dim their lights, you can't walk in, and Scout warns you before a store closes.
- **Crowds**: quiet mornings, lunchtime peak, busier weekends and events.
- **Weather** visible through the entrances and skylights: clear, cloudy or rain.
- **Events** with their own set-pieces: a sneaker launch, a gaming night, a fashion runway, a food festival, and a Christmas market. The ad screens switch to the event.
- **People**: animated shoppers with varied skin tones, hair, clothes and shopping bags. They are drawn efficiently, so about 45 people cost around 9 draw calls.
- **Security**: guards patrol the centre, with a Security & First Aid desk at the main entrance and CCTV. Ask Scout "I need first aid".
- **Ambient sound**, off by default; turn it on in Accessibility settings.

### Graphics tiers
| | High | Medium | Low |
| --- | --- | --- | --- |
| Sun shadows through skylights | 4K | 2K | — |
| Real-time floor reflections | ✓ | — | — |
| Ambient occlusion (GTAO) | ✓ | — | — |
| Bloom on lights and screens | ✓ | ✓ | — |
| Light shafts | ✓ | — | — |
| Anti-aliasing | MSAA ×4 | MSAA ×2 | native |

*Auto* starts at High on computers and Medium on phones, and steps down if frame rate drops. It's always adjustable in Accessibility settings.

### VR headsets (WebXR)
An **Enter VR** button appears only on browsers with `immersive-vr` support. In VR:
- point at the floor and pull the trigger to teleport
- left stick to move, right stick to snap-turn
- point at a product to see its info card; trigger on the card adds it to your cart

Desktop and mobile are unaffected. This mode hasn't been tested on a physical headset yet.

## Controls

| | Desktop | Phone / tablet |
|---|---|---|
| Walk | `W` `A` `S` `D` (hold `Shift` to go faster), `↑` `↓` | Joystick (bottom left) |
| Look | Drag; `←` `→`; `Page Up/Down` | Swipe |
| Interact | Click, or `E` for the object under the centre dot | Tap |
| Shortcuts | `/` search · `C` Scout · `K` cart · `M` map · `B` stores · `R` centre · `H` help · `Esc` close | Toolbar |

Accessibility options: large text, high contrast, reduce movement, invert look, sensitivity, graphics quality and sound. Keyboard control and screen-reader announcements work throughout, and every 3D feature has a non-3D equivalent.

## Architecture

```
src/
  data/mall.ts        centre, stores, products (+ ratings, colours, gift/outfit metadata), facilities
  data/events.ts      simulated events calendar
  ai/engine.ts        Scout: offline language understanding, catalogue search, outfits, gifts,
                      comparisons, discovery, missions. Only ever returns catalogue products
  ai/llm-brain.ts     optional LLM adapter (validated against the catalogue)
  shop/cart.ts        persistent cart + budget
  app/shopping.ts     companion chat, modes, smart budget, comparison, missions, Personal Shopper
  app/live.ts         simulated clock, crowds, weather, opening hours, events (LiveFeed)
  app/plan.ts         "Shop before you go" itinerary
  app/audio.ts        synthesised ambient sound
  scene/world.ts      3D centre: skylights, sun/shadows, reflective marble floor, shutters, security
  scene/pipeline.ts   quality tiers: GTAO, bloom, MSAA, colour grade
  scene/people.ts     instanced, animated shoppers and guards
  scene/events3d.ts   event set-pieces
  scene/compare3d.ts  holographic comparison stage
  scene/companion3d.ts  the companion orb
  xr/xr.ts            WebXR mode
  platform/           digital-twin contracts, demo + JSON sources, validator
```

## Docs
- [`docs/DIGITAL_TWIN.md`](docs/DIGITAL_TWIN.md): connecting a real centre (floor plans, stores, products, promotions, hours, events) and the path to production
- [`docs/TECHNOLOGY.md`](docs/TECHNOLOGY.md): technology choices and WebXR
- [`docs/BUSINESS_MODEL.md`](docs/BUSINESS_MODEL.md): how this could make money, and what it must prove first
- [`docs/CLAUDE_CODE_PROMPT.md`](docs/CLAUDE_CODE_PROMPT.md): a prompt to rebuild the original MVP
