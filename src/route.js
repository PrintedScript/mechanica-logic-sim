// route.js — orthogonal wire auto-router for the "Tidy wires" feature.
//
// Pure geometry, no DOM: the editor feeds it block rectangles (obstacles) and
// wire endpoints, and gets back corner points per wire. Routing is A* on a
// coarse grid; wires prefer straight runs (turn cost), avoid blocks entirely
// (blocked cells) and avoid riding on top of already-routed wires (occupancy
// penalty — perpendicular crossings stay cheap, parallel overlap is expensive).

"use strict";

const ROUTE_GRID = 12;         // grid cell size, px
const ROUTE_MARGIN = 6;        // clearance kept around blocks, px
const ROUTE_PAD = 72;          // routable border around the whole build, px
const ROUTE_TURN_COST = 4;     // per 90° bend, in cell-steps
const ROUTE_BUSY_COST = 6;     // per cell already used by another wire
const ROUTE_MAX_CELLS = 160000;
const ROUTE_MAX_POPS = 60000;  // A* safety valve per wire

// wires: [{ id, ax, ay, bx, by }] — (ax, ay) is the source output anchor (the
// wire leaves heading right), (bx, by) the destination input anchor (the wire
// arrives heading right). obstacles: [{ x, y, w, h }] block rectangles.
// snapGrid: 0/undefined routes on the default fine lattice; a pitch in px
// makes every produced corner land on multiples of that pitch (the runs
// touching the ports keep the exact port heights so anchors connect cleanly).
// Returns Map(id -> [{ x, y }, ...]) of interior corner points ([] = leave
// the wire straight / bezier).
function autoRouteWires(wires, obstacles, snapGrid) {
  const out = new Map();
  if (!wires.length) return out;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const take = (x, y) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  for (const o of obstacles) { take(o.x, o.y); take(o.x + o.w, o.y + o.h); }
  for (const w of wires) { take(w.ax, w.ay); take(w.bx, w.by); }
  minX -= ROUTE_PAD; minY -= ROUTE_PAD; maxX += ROUTE_PAD; maxY += ROUTE_PAD;

  // Coarsen the grid until the routable area fits the cell budget. When
  // snapping, cells start at the snap pitch and coarsen by ×2 (so centers
  // stay on the lattice), and the origin is shifted so cell centers land
  // exactly on multiples of snapGrid.
  let G = snapGrid || ROUTE_GRID, cols, rows;
  const rawMinX = minX, rawMinY = minY;
  for (;;) {
    if (snapGrid) {
      minX = Math.floor(rawMinX / snapGrid) * snapGrid - G / 2;
      minY = Math.floor(rawMinY / snapGrid) * snapGrid - G / 2;
    }
    cols = Math.max(2, Math.ceil((maxX - minX) / G));
    rows = Math.max(2, Math.ceil((maxY - minY) / G));
    if (cols * rows <= ROUTE_MAX_CELLS) break;
    G *= snapGrid ? 2 : 1.5;
  }

  const blocked = new Uint8Array(cols * rows);
  const clampI = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  for (const o of obstacles) {
    const c0 = clampI(Math.floor((o.x - ROUTE_MARGIN - minX) / G), 0, cols - 1);
    const c1 = clampI(Math.floor((o.x + o.w + ROUTE_MARGIN - minX) / G), 0, cols - 1);
    const r0 = clampI(Math.floor((o.y - ROUTE_MARGIN - minY) / G), 0, rows - 1);
    const r1 = clampI(Math.floor((o.y + o.h + ROUTE_MARGIN - minY) / G), 0, rows - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) blocked[r * cols + c] = 1;
    }
  }

  const ctx = {
    G, minX, minY, cols, rows, blocked,
    busy: new Uint16Array(cols * rows),
    // A* scratch arrays, reused across wires (4 heading states per cell).
    g: new Float64Array(cols * rows * 4),
    prev: new Int32Array(cols * rows * 4),
  };

  // Short wires first: they claim the direct corridors, long wires detour.
  const order = [...wires].sort((p, q) =>
    (Math.abs(p.bx - p.ax) + Math.abs(p.by - p.ay)) -
    (Math.abs(q.bx - q.ax) + Math.abs(q.by - q.ay)));
  for (const w of order) {
    const res = routeOneWire(ctx, w);
    out.set(w.id, res ? res.corners : []);
    if (res) for (const cell of res.cells) ctx.busy[cell]++;
  }
  return out;
}

function routeOneWire(ctx, w) {
  const { G, minX, minY, cols, rows, blocked } = ctx;
  const clampI = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cellOf = (x, y) => ({
    c: clampI(Math.floor((x - minX) / G), 0, cols - 1),
    r: clampI(Math.floor((y - minY) / G), 0, rows - 1),
  });

  // Ports sit on block edges, so step the start/end cells sideways until they
  // clear the inflated block rectangles.
  let s = cellOf(w.ax + G, w.ay);
  for (let i = 0; blocked[s.r * cols + s.c] && i < 6 && s.c < cols - 1; i++) s = { c: s.c + 1, r: s.r };
  let e = cellOf(w.bx - G, w.by);
  for (let i = 0; blocked[e.r * cols + e.c] && i < 6 && e.c > 0; i++) e = { c: e.c - 1, r: e.r };
  if (blocked[s.r * cols + s.c] || blocked[e.r * cols + e.c]) return null;
  if (s.c === e.c && s.r === e.r) return null;

  const cellPath = astarRoute(ctx, s, e);
  if (!cellPath) return null;

  const center = (cell) => ({
    x: minX + (cell % cols) * G + G / 2,
    y: minY + ((cell / cols) | 0) * G + G / 2,
  });
  const pts = cellPath.map(center);
  // Align the first and last straight runs with the exact port heights so the
  // segments touching the anchors stay perfectly horizontal.
  alignRun(pts, 0, 1, w.ay);
  alignRun(pts, pts.length - 1, -1, w.by);
  const full = [{ x: w.ax, y: w.ay }, ...pts, { x: w.bx, y: w.by }];
  return { corners: compressCorners(full), cells: cellPath };
}

// From pts[from], walking by step, rewrite the y of every point sharing the
// first point's row. Only y changes, so vertical segments stay vertical.
function alignRun(pts, from, step, y) {
  const y0 = pts[from].y;
  for (let i = from; i >= 0 && i < pts.length && pts[i].y === y0; i += step) pts[i].y = y;
}

// Drop duplicate and collinear points; return only the interior turn points.
function compressCorners(pts) {
  const clean = [];
  for (const p of pts) {
    const q = clean[clean.length - 1];
    if (!q || Math.abs(q.x - p.x) > 0.01 || Math.abs(q.y - p.y) > 0.01) clean.push({ x: p.x, y: p.y });
  }
  if (clean.length < 3) return [];
  const kept = [clean[0]];
  for (let i = 1; i < clean.length - 1; i++) {
    const a = kept[kept.length - 1], p = clean[i], n = clean[i + 1];
    const cross = (p.x - a.x) * (n.y - p.y) - (p.y - a.y) * (n.x - p.x);
    if (Math.abs(cross) > 0.01) kept.push(p);
  }
  return kept.slice(1); // kept[0] is the start anchor; the end anchor was never pushed
}

// A* over (cell, heading) states — headings E/S/W/N so turns can be priced.
function astarRoute(ctx, s, e) {
  const { cols, rows, blocked, busy, g, prev } = ctx;
  g.fill(Infinity);
  prev.fill(-1);
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // E, S, W, N

  // Binary min-heap of [f, stateIdx, gAtPush].
  const heap = [];
  const push = (entry) => {
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const hcost = (c, r) => Math.abs(c - e.c) + Math.abs(r - e.r);

  const startIdx = (s.r * cols + s.c) * 4 + 0; // leaves the output heading E
  g[startIdx] = 0;
  push([hcost(s.c, s.r), startIdx, 0]);

  let pops = 0;
  while (heap.length) {
    const [, idx, gAt] = pop();
    if (gAt > g[idx] + 1e-9) continue; // stale heap entry
    const cell = idx >> 2, dir = idx & 3;
    const c = cell % cols, r = (cell / cols) | 0;
    if (c === e.c && r === e.r) {
      const cells = [];
      for (let i = idx; i !== -1; i = prev[i]) {
        const cl = i >> 2;
        if (!cells.length || cells[cells.length - 1] !== cl) cells.push(cl);
      }
      return cells.reverse();
    }
    if (++pops > ROUTE_MAX_POPS) return null;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (dir + 2) % 4) continue; // no about-face
      const nc = c + DX[nd], nr = r + DY[nd];
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ncell = nr * cols + nc;
      if (blocked[ncell]) continue;
      const nidx = ncell * 4 + nd;
      const ng = g[idx] + 1 + (nd !== dir ? ROUTE_TURN_COST : 0) + busy[ncell] * ROUTE_BUSY_COST;
      if (ng < g[nidx] - 1e-9) {
        g[nidx] = ng;
        prev[nidx] = idx;
        push([ng + hcost(nc, nr), nidx, ng]);
      }
    }
  }
  return null;
}
