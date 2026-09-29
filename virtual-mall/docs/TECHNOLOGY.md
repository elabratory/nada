# Technology recommendation

## Short answer

**Three.js + TypeScript + Vite, with a plain-DOM UI layer.** This is what the prototype in this folder uses.

- **Three.js** renders the 3D centre in WebGL.
- **HTML/CSS** (not WebGL) handles every menu, panel, search box and map. That keeps them accessible to screen readers and keyboards.
- **Vite** builds a static site that any CDN can host. No server is needed for the MVP.

Move to **React (or Next.js) + React Three Fiber** once there is a real backend: centre accounts, a CMS for tenants, analytics dashboards. Add **WebXR** for headsets as a progressive enhancement after that.

## How the options compare

| Option | Role | Verdict for the MVP |
| --- | --- | --- |
| **WebGL** | Low-level browser graphics API | Always the foundation. Nobody should write raw WebGL for this. Use a library on top. |
| **Three.js** | Most widely used WebGL library. Scene graph, materials, loaders (glTF), raycasting, WebXR support | ✅ **Use it.** Small core, huge community and examples, and AI coding tools know it very well. Easy to generate geometry from data, which is what "upload a floor plan and generate a centre" needs. |
| **Babylon.js** | Full 3D engine: physics, GUI, inspector, strong WebXR helpers | Strong alternative. It bundles more "game engine" features, but it's heavier, and its GUI system competes with accessible HTML UI. A good choice if the team already knows it or wants its built-in XR tooling. |
| **React** | UI component model | Not needed for 7 panels. It becomes worthwhile for the retailer/centre **admin portal** and for a larger consumer UI. |
| **React Three Fiber** | React renderer for Three.js | The natural next step if you adopt React. The same Three.js underneath, but declarative. |
| **Next.js** | React framework: routing, SSR, API routes | For the **product website**: SEO pages for each centre/store, marketing, auth, API. Load the 3D view as a client-only component. Overkill for the 3D prototype itself. |
| **WebXR** | Browser API for VR/AR headsets | Add later (see below). Must never be required. |

### Why Three.js wins for this product

1. **Data-driven geometry.** The long-term product turns a centre's uploaded floor plan into a 3D space. Three.js makes it simple to build boxes, extrusions and textures from JSON, which is exactly what `src/scene/world.ts` does from `src/data/mall.ts`.
2. **Lightweight.** The whole prototype ships about 180 KB gzipped of JavaScript and zero image assets. All signage is drawn on canvases at runtime. It loads quickly on phones over 4G.
3. **Ecosystem.** glTF loading (for real retailer 3D product models), Draco/Meshopt compression, KTX2 textures, navmesh libraries (`recast-navigation-js`) and WebXR are all first-class.
4. **Hiring and AI tooling.** It's the most common 3D-on-the-web stack, so one developer with AI coding tools can move fast.

## Architecture of the prototype

```
src/
  data/mall.ts          ← single source of truth: floor plan rects, stores, products,
                          restaurants, facilities, promotions, hours (fictional demo data)
  scene/world.ts        ← builds the 3D centre from the data; merges static geometry
  scene/products3d.ts   ← low-poly product stand-ins (replace with glTF later)
  scene/textures.ts     ← canvas-drawn signs, ads, kiosks, floor (no image files)
  scene/people.ts       ← animated shopper silhouettes
  controls/player.ts    ← WASD / drag-look / touch joystick / collisions / auto-walk
  nav/pathfinding.ts    ← visibility-graph + Dijkstra routing, turn-by-turn text
  nav/route3d.ts        ← floor arrows for the active route
  ui/*.ts               ← accessible panels, search combobox, SVG map, settings
  main.ts               ← app state: landing ↔ mall, routing, interactions
```

Performance choices:

- Static geometry is merged into one mesh per material, about 320 draw calls in total.
- Pixel ratio is capped at 1.5 on phones.
- Shadows are replaced by lighting and an environment map.
- Nothing downloads after the first page load.

## Rendering quality (implemented)

`src/scene/pipeline.ts` has three tiers:
- **High**: GTAO ambient occlusion, bloom, MSAA ×4, planar floor reflections, 4K sun shadows, light shafts
- **Medium**: bloom, MSAA ×2, 2K shadows
- **Low**: direct render

The sun's shadow map is only re-rendered when the time of day changes, so shadows are nearly free per frame. The crowd is instanced, at about 9 draw calls for 45 people. **Auto** quality steps down when the frame rate drops below 30 fps.

## VR headset support (WebXR): implemented as a progressive enhancement

This is now in `src/xr/xr.ts`, behind feature detection (see `docs/DIGITAL_TWIN.md`). It hasn't been tested on a physical headset yet. The design it follows:

1. **Feature-detect.** Show an "Enter VR" button only when `navigator.xr?.isSessionSupported('immersive-vr')` resolves to `true`. Everyone else sees the normal site.
2. **Enable XR in the renderer.** Set `renderer.xr.enabled = true` and use `VRButton.createButton(renderer)` from `three/examples/jsm/webxr/VRButton.js`. Switch the loop to `renderer.setAnimationLoop(tick)` (XR requires it).
3. **Camera rig.** Put the camera inside a `Group` ("dolly"). The player's `x/z/yaw` moves the dolly, and the headset moves the camera inside it. Eye height comes from the headset, so drop the fixed 1.65 m.
4. **Locomotion.** Use teleport as the default (arc from the controller, landing only where the nav graph allows) and snap-turn in 30° steps. Offer smooth locomotion from the thumbstick as an option, because teleport and snap-turn are the most comfortable for most people. The existing `Player.place()` and `NavGraph.clear()` already provide what's needed.
5. **Interaction.** Controller rays reuse the same raycasting code as mouse clicks. The `userData.interact` tags are already on every clickable object.
6. **UI in VR.** HTML panels don't render inside a headset. Show product and store info on a world-space panel: a canvas texture on a plane, like the in-scene signs, or `three-mesh-ui`. Keep the HTML UI for flat screens.
7. **Hand tracking and AR (later).** `immersive-ar` on phones and Quest could place a single product at real scale in your room ("see this TV on your wall").

Estimated effort once the MVP is stable: **3–5 developer-days** for a basic VR mode (enter VR, teleport, point-and-click products, world-space info panel).

## Path to production

| Stage | Add |
| --- | --- |
| MVP (this repo) | Static Vite site, fictional data in TypeScript |
| Pilot with one centre | Move data to JSON served from an API or CMS. Add real floor-plan import (SVG/DXF → rectangles and walls). Use glTF product models and retailer images. Add privacy-respecting analytics events. |
| Multi-centre platform | Next.js site (SEO pages for each store and product), admin portal (React) for centres and tenants, Postgres, object storage/CDN for models, navmesh generation from floor plans, auth, billing |
| Premium | WebXR mode, multi-floor with lifts and escalators in routing, live stock and price feeds from retailer APIs, affiliate links, accessibility routes (step-free) |
