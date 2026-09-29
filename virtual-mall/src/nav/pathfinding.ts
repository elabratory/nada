import { RESTAURANTS, STORES, FACILITIES, storeInside, storeOutside, type Rect } from '../data/mall';

/**
 * Indoor navigation for the prototype: a visibility graph over hand-picked
 * waypoints (concourse lanes, doorways, food-court aisles). Two waypoints are
 * connected when the straight line between them clears every collider.
 * Start and goal are linked the same way, then Dijkstra finds the route.
 *
 * Real deployments would swap this for a navmesh generated from the
 * centre's uploaded floor plan; the public API (findRoute) stays the same.
 */

export interface P {
  x: number;
  z: number;
}

const RADIUS = 0.45;
const MAX_EDGE = 26;

export class NavGraph {
  private nodes: P[] = [];
  private edges: number[][] = [];
  private boxes: Rect[];

  constructor(colliders: Rect[]) {
    this.boxes = colliders.map((c) => ({ x1: c.x1 - RADIUS, z1: c.z1 - RADIUS, x2: c.x2 + RADIUS, z2: c.z2 + RADIUS }));
    const n: P[] = [];
    const laneXs = [-45.5, -36, -26, -16, -7, 7, 16, 26, 36, 45.5];
    for (const x of laneXs) for (const z of [-3.8, 3.8]) n.push({ x, z });
    for (const s of STORES) {
      n.push(storeOutside(s), storeInside(s));
      const deep = storeInside(s);
      n.push({ x: deep.x, z: deep.z + (s.side === 'north' ? -6 : 6) });
    }
    for (const x of [11, 17, 23, 29, 35, 41]) for (const z of [9, 14.1, 19.4]) n.push({ x, z });
    for (const r of RESTAURANTS) n.push({ x: r.x, z: r.z - 3.5 });
    n.push({ x: 0, z: 9 }, { x: 0, z: 17.5 }, { x: 0, z: -6.5 }, { x: -2, z: -9.5 });
    for (const f of FACILITIES) if (f.approach) n.push(f.approach);
    this.nodes = n.filter((p) => !this.blockedPoint(p));
    this.edges = this.nodes.map(() => []);
    for (let i = 0; i < this.nodes.length; i++)
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i];
        const b = this.nodes[j];
        if (Math.hypot(a.x - b.x, a.z - b.z) <= MAX_EDGE && this.clear(a, b)) {
          this.edges[i].push(j);
          this.edges[j].push(i);
        }
      }
  }

  blockedPoint(p: P) {
    return this.boxes.some((b) => p.x > b.x1 && p.x < b.x2 && p.z > b.z1 && p.z < b.z2);
  }

  /** True when the segment a→b does not cross any (inflated) collider. */
  clear(a: P, b: P) {
    for (const r of this.boxes) if (segmentHitsRect(a, b, r)) return false;
    return true;
  }

  findRoute(start: P, goal: P): P[] | null {
    if (this.clear(start, goal)) return [start, goal];
    const N = this.nodes.length;
    const S = N;
    const G = N + 1;
    const pts = [...this.nodes, start, goal];
    const extra: number[][] = [[], []];
    for (let i = 0; i < N; i++) {
      if (this.clear(start, this.nodes[i])) extra[0].push(i);
      if (this.clear(goal, this.nodes[i])) extra[1].push(i);
    }
    // If the goal sits inside furniture slightly, allow the nearest node.
    if (!extra[1].length) extra[1].push(this.nearest(goal));
    if (!extra[0].length) extra[0].push(this.nearest(start));
    const neighbours = (i: number): number[] => {
      if (i === S) return extra[0];
      if (i === G) return [];
      const base = this.edges[i];
      return extra[1].includes(i) ? [...base, G] : base;
    };
    const dist = new Array(N + 2).fill(Infinity);
    const prev = new Array(N + 2).fill(-1);
    const done = new Array(N + 2).fill(false);
    dist[S] = 0;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < N + 2; i++)
        if (!done[i] && dist[i] < best) {
          best = dist[i];
          u = i;
        }
      if (u === -1) return null;
      if (u === G) break;
      done[u] = true;
      for (const v of neighbours(u)) {
        const d = dist[u] + Math.hypot(pts[u].x - pts[v].x, pts[u].z - pts[v].z);
        if (d < dist[v]) {
          dist[v] = d;
          prev[v] = u;
        }
      }
    }
    const path: P[] = [];
    for (let v = G; v !== -1; v = prev[v]) path.unshift(pts[v]);
    return path;
  }

  private nearest(p: P) {
    let best = 0;
    let bd = Infinity;
    this.nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
}

function segmentHitsRect(a: P, b: P, r: Rect) {
  // Liang–Barsky clip of the segment against the rectangle.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const checks: [number, number][] = [
    [-dx, a.x - r.x1],
    [dx, r.x2 - a.x],
    [-dz, a.z - r.z1],
    [dz, r.z2 - a.z],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 - t0 > 1e-6;
}

export function pathLength(path: P[]) {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return d;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function heading(dx: number, dz: number) {
  // North is -z on our floor plan.
  const ang = Math.atan2(dx, -dz); // 0 = north, +90° = east
  const idx = Math.round(((ang * 180) / Math.PI + 360) / 45) % 8;
  return COMPASS[idx];
}

/** Human-readable turn-by-turn steps for a route. */
export function describeRoute(path: P[], destination: string): string[] {
  const steps: string[] = [];
  let prevAng: number | null = null;
  let acc = 0;
  let accDir = '';
  const flush = (turn: string) => {
    if (acc < 0.8) return;
    const m = Math.max(1, Math.round(acc));
    steps.push(turn ? `${turn} and walk ${m} m ${accDir}` : `Head ${accDir} for ${m} m`);
  };
  let pendingTurn = '';
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dz = path[i].z - path[i - 1].z;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) continue;
    const ang = Math.atan2(dx, -dz);
    const dir = heading(dx, dz);
    if (prevAng === null) {
      accDir = dir;
      acc = len;
    } else {
      const delta = ((ang - prevAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (Math.abs(delta) < 0.35) {
        acc += len;
      } else {
        flush(pendingTurn);
        pendingTurn = Math.abs(delta) > 2.4 ? 'Turn around' : delta > 0 ? (Math.abs(delta) < 1.0 ? 'Bear right' : 'Turn right') : Math.abs(delta) < 1.0 ? 'Bear left' : 'Turn left';
        accDir = dir;
        acc = len;
      }
    }
    prevAng = ang;
  }
  flush(pendingTurn);
  steps.push(`Arrive at ${destination}`);
  return steps;
}

