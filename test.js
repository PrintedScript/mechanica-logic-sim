// test.js — headless smoke test for the engine (node test.js)
const fs = require("fs");
const vm = require("vm");
vm.runInThisContext(fs.readFileSync("src/blocks.js", "utf8"), { filename: "blocks.js" });
vm.runInThisContext(fs.readFileSync("src/engine.js", "utf8"), { filename: "engine.js" });
vm.runInThisContext(fs.readFileSync("src/route.js", "utf8"), { filename: "route.js" });
// clipboard.js is a plain module (buildClip / remapClip / SimClipboard); its
// pure helpers are exercised directly here.
const { buildClip, remapClip, isClip } = require("./src/clipboard.js");
// editor.js only touches the DOM when an Editor is constructed; loading it
// headless gives access to the pure wire-geometry helpers.
vm.runInThisContext(fs.readFileSync("src/editor.js", "utf8"), { filename: "editor.js" });

let failures = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name);
  if (!cond) failures++;
}
function mkModel(blocks) {
  const m = { blocks: new Map() };
  for (const b of blocks) {
    b.props = { ...defaultProps(b.type), ...(b.props || {}) };
    const inputs = {};
    for (const p of blockInputs(b)) inputs[p] = (b.inputs && b.inputs[p] != null) ? b.inputs[p] : null;
    b.inputs = inputs;
    m.blocks.set(b.uid, b);
  }
  return m;
}

// 1. Toggle: key press flips state on rising edge only.
{
  const m = mkModel([
    { uid: 1, type: 14, x: 0, y: 0, props: { key: "E" } },
    { uid: 2, type: 31, x: 0, y: 0, inputs: { "Activate": 1 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  check("toggle starts False", e.getOut(2) === 0);
  e.keyDown("E");
  check("toggle flips on press", e.getOut(2) === 1);
  e.keyUp("E"); // falling edge: 0 is not truish, no flip
  check("toggle holds on release", e.getOut(2) === 1);
  e.keyDown("E");
  check("toggle flips back", e.getOut(2) === 0);
}

// 2. Blinker: NOT -> Delay(0.5) -> NOT oscillates.
{
  const m = mkModel([
    { uid: 1, type: 34, x: 0, y: 0, inputs: { "Input": 2 } },
    { uid: 2, type: 45, x: 0, y: 0, props: { delay: 0.5 }, inputs: { "Activate": 1 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  check("blinker: NOT=1, delay=0 at t=0", e.getOut(1) === 1 && e.getOut(2) === 0);
  e.tick(0.6);
  check("blinker: delay=1 after 0.6s", e.getOut(2) === 1 && e.getOut(1) === 0);
  e.tick(0.6);
  check("blinker: delay=0 after 1.2s", e.getOut(2) === 0 && e.getOut(1) === 1);
  check("blinker: nothing killed", !e.isKilled(1) && !e.isKilled(2));
}

// 3. Counter: key -> memory(set-only) storing memory+1.
{
  const m = mkModel([
    { uid: 1, type: 14, x: 0, y: 0, props: { key: " " } },
    { uid: 2, type: 82, x: 0, y: 0, props: { value: 1 } },
    { uid: 3, type: 49, x: 0, y: 0, props: { onlyUpdateWithSet: true }, inputs: { "Set": 1, "Data": 4 } },
    { uid: 4, type: 83, x: 0, y: 0, inputs: { "Input 1": 3, "Input 2": 2 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  check("counter: memory=0, add=1 at start", e.getOut(3) === 0 && e.getOut(4) === 1);
  e.keyDown(" "); e.keyUp(" ");
  e.keyDown(" "); e.keyUp(" ");
  e.keyDown(" "); e.keyUp(" ");
  check("counter: 3 presses -> memory=3", e.getOut(3) === 3);
  check("counter: not killed", !e.isKilled(3) && !e.isKilled(4));
}

// 4. Relay: unwired selected data port outputs "nothing" (null), not 0.
{
  const m = mkModel([
    { uid: 1, type: 82, x: 0, y: 0, props: { value: 7 } },
    { uid: 2, type: 76, x: 0, y: 0, inputs: { "Relay": 1, "Data 1": 1 } }, // Data 0 unwired
    { uid: 3, type: 76, x: 0, y: 0, inputs: { "Data 1": 1 } },             // Relay unwired -> selects Data 0 (unwired)
  ]);
  const e = new Engine(m, {});
  e.start();
  check("relay: truish relay passes Data 1", e.getOut(2) === 7);
  check("relay: unwired selected port -> nothing", e.getOut(3) === null);
}

// 5. Infinite loop protection: XOR feeding itself with a constant 1 oscillates and gets killed.
{
  const m = mkModel([
    { uid: 1, type: 82, x: 0, y: 0, props: { value: 1 } },
    { uid: 2, type: 37, x: 0, y: 0, inputs: { "Input 1": 1, "Input 2": 2 } }, // out = 1 XOR out -> unstable
  ]);
  let killed = null;
  const e = new Engine(m, { onKilled: (uid) => { killed = uid; } });
  e.start();
  check("loop protection kills the oscillating XOR", killed === 2 && e.isKilled(2));
}

// 6. Math + compare + round chain.
{
  const m = mkModel([
    { uid: 1, type: 82, x: 0, y: 0, props: { value: 7 } },
    { uid: 2, type: 82, x: 0, y: 0, props: { value: 2 } },
    { uid: 3, type: 86, x: 0, y: 0, inputs: { "Input 1": 1, "Input 2": 2 } },      // 3.5
    { uid: 4, type: 87, x: 0, y: 0, props: { roundingMode: "Floor" }, inputs: { "Input": 3 } }, // 3
    { uid: 5, type: 88, x: 0, y: 0, props: { compareMode: "GreaterThan" }, inputs: { "Input 1": 3, "Input 2": 4 } }, // 3.5 > 3 -> 1
  ]);
  const e = new Engine(m, {});
  e.start();
  check("divide 7/2 = 3.5", e.getOut(3) === 3.5);
  check("floor(3.5) = 3", e.getOut(4) === 3);
  check("compare 3.5 > 3 -> 1", e.getOut(5) === 1);
}

// 7. Wireless: same channel delivers after distance delay; other channel silent.
{
  const m = mkModel([
    { uid: 1, type: 82, x: 0, y: 0, props: { value: 5 } },
    { uid: 2, type: 44, x: 0, y: 0, props: { channel: 3 }, inputs: { "Send Signal": 1 } },
    { uid: 3, type: 44, x: 4000, y: 0, props: { channel: 3 } },   // 4000px * 0.25 = 1000 studs -> 2.5s
    { uid: 4, type: 44, x: 100, y: 0, props: { channel: 9 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  check("wireless: not yet delivered at t=0", e.getOut(3) === 0);
  e.tick(1.0);
  check("wireless: still in flight at 1s", e.getOut(3) === 0);
  e.tick(2.0);
  check("wireless: delivered after distance delay", e.getOut(3) === 5);
  check("wireless: other channel untouched", e.getOut(4) === 0);
}

// 8. Sensor distance mode: normalised 0..1 against range.
{
  const m = mkModel([
    { uid: 1, type: 21, x: 0, y: 0, props: { range: 20, distanceMode: true, simDistance: 5 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  e.tick(0.016);
  check("sensor distance 5/20 = 0.25", e.getOut(1) === 0.25);
  m.blocks.get(1).props.simDistance = 100; // beyond range clamps to 1
  e.tick(0.016);
  check("sensor clamps to 1 beyond range", e.getOut(1) === 1);
}

// 9. Memory in continuous mode: updates while Set truish and Data changes.
{
  const m = mkModel([
    { uid: 1, type: 14, x: 0, y: 0, props: { key: "S" } },                 // Set
    { uid: 2, type: 21, x: 0, y: 0, props: { range: 100, distanceMode: true, simDistance: 10 } }, // Data
    { uid: 3, type: 49, x: 0, y: 0, inputs: { "Set": 1, "Data": 2 } },
  ]);
  const e = new Engine(m, {});
  e.start(); e.tick(0.016);
  check("memory idle while Set false", e.getOut(3) === 0);
  e.keyDown("S");
  m.blocks.get(2).props.simDistance = 50;
  e.tick(0.016);
  check("memory follows Data while Set truish", e.getOut(3) === 0.5);
  e.keyUp("S");
  m.blocks.get(2).props.simDistance = 90;
  e.tick(0.016);
  check("memory frozen once Set false", e.getOut(3) === 0.5);
}

// 10. Serialization round-trip shape (mirror of editor.serialize()).
{
  const m = mkModel([
    { uid: 1, type: 82, x: 10, y: 20, props: { value: 42 } },
    { uid: 2, type: 34, x: 30, y: 40, inputs: { "Input": 1 } },
  ]);
  const json = JSON.stringify({
    format: "mechanica-sim", version: 1,
    blocks: [...m.blocks.values()].map((b) => ({ uid: b.uid, type: b.type, x: b.x, y: b.y, props: { ...b.props }, inputs: { ...b.inputs } })),
  });
  const back = JSON.parse(json);
  check("export/import JSON round-trips", back.blocks.length === 2 && back.blocks[1].inputs["Input"] === 1 && back.blocks[0].props.value === 42);
}

// 11. Pause: clock, timers, and key events freeze; resume catches up.
{
  const m = mkModel([
    { uid: 1, type: 34, x: 0, y: 0, inputs: { "Input": 2 } },
    { uid: 2, type: 45, x: 0, y: 0, props: { delay: 0.5 }, inputs: { "Activate": 1 } },
    { uid: 3, type: 14, x: 0, y: 0, props: { key: "E" } },
    { uid: 4, type: 31, x: 0, y: 0, inputs: { "Activate": 3 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  e.pause();
  const t0 = e.simTime;
  e.tick(2.0);
  check("pause: clock frozen", e.simTime === t0);
  check("pause: delay timer not fired", e.getOut(2) === 0);
  e.keyDown("E");
  check("pause: key press deferred", e.getOut(4) === 0);
  e.resume();
  check("resume: deferred key press applied", e.getOut(4) === 1);
  e.tick(0.6);
  check("resume: timers run again", e.getOut(2) === 1);
}

// 12. Fast-forward tick (speed factor): a big dt fires multiple due timers in order.
{
  const m = mkModel([
    { uid: 1, type: 82, x: 0, y: 0, props: { value: 1 } },
    { uid: 2, type: 45, x: 0, y: 0, props: { delay: 0.2 }, inputs: { "Activate": 1 } },
    { uid: 3, type: 45, x: 0, y: 0, props: { delay: 0.4 }, inputs: { "Activate": 1 } },
    { uid: 4, type: 49, x: 0, y: 0, props: { onlyUpdateWithSet: true }, inputs: { "Set": 3, "Data": 2 } },
  ]);
  const e = new Engine(m, {});
  e.start(); // constant 1 announced -> both delays schedule at 0.2 and 0.4
  e.tick(1.0); // one big fast-forwarded tick covers both
  check("fast tick: both delays fired", e.getOut(2) === 1 && e.getOut(3) === 1);
  check("fast tick: fired in schedule order (memory latched delay-0.2's value)", e.getOut(4) === 1);
}

// 13. Zero-delay feedback loop can't hang a tick (fires once per tick).
{
  const m = mkModel([
    { uid: 1, type: 34, x: 0, y: 0, inputs: { "Input": 2 } },
    { uid: 2, type: 45, x: 0, y: 0, props: { delay: 0 }, inputs: { "Activate": 1 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  const before = Date.now();
  for (let i = 0; i < 10; i++) e.tick(1.0);
  check("zero-delay loop: ticks terminate quickly", Date.now() - before < 1000);
  check("zero-delay loop: still oscillating, not killed", !e.isKilled(1) && !e.isKilled(2));
}

// 14. Counter with "Only Update With Set" = false: holding the key makes
// Memory and Addition feed each other in one chain -> overflow -> memory killed.
{
  const m = mkModel([
    { uid: 1, type: 14, x: 0, y: 0, props: { key: " " } },
    { uid: 2, type: 82, x: 0, y: 0, props: { value: 1 } },
    { uid: 3, type: 49, x: 0, y: 0, props: { onlyUpdateWithSet: false }, inputs: { "Set": 1, "Data": 4 } },
    { uid: 4, type: 83, x: 0, y: 0, inputs: { "Input 1": 3, "Input 2": 2 } },
  ]);
  const killed = [];
  const e = new Engine(m, { onKilled: (uid) => killed.push(uid) });
  e.start();
  e.keyDown(" "); // held down: Set stays truish while Data keeps changing
  check("overflow: memory gate killed by activation limit", e.isKilled(3) && killed.includes(3));
  check("overflow: memory counted up to the limit before dying", e.getOut(3) === 100);
  check("overflow: chain stopped once the memory died", e.getOut(4) === 101 && !e.isKilled(1));
}

// 15. Number properties snap to the game's 0.005 steps.
{
  check("snap: 1.023 -> 1.025", snapNumber(1.023) === 1.025);
  check("snap: 1.022 -> 1.02", snapNumber(1.022) === 1.02);
  check("snap: -2.0074 -> -2.005", snapNumber(-2.0074) === -2.005);
  check("snap: 0.615 stays 0.615 (no float dust)", snapNumber(0.615) === 0.615);
  check("snap: multiples of 0.005 unchanged", snapNumber(42) === 42 && snapNumber(0.005) === 0.005);
  check("snap: non-numeric -> 0", snapNumber("abc") === 0 && snapNumber(NaN) === 0);
}

// 16. Timer chains keep exact cadence under frame quantisation: a 0.5s blinker
// counted for 30s of 1/60s frames must tick exactly 30 times (no drift from
// rescheduling off late frame boundaries).
{
  const m = mkModel([
    { uid: 1, type: 34, x: 0, y: 0, inputs: { "Input": 2 } },
    { uid: 2, type: 45, x: 0, y: 0, props: { delay: 0.5 }, inputs: { "Activate": 1 } },
    { uid: 3, type: 82, x: 0, y: 0, props: { value: 1 } },
    { uid: 4, type: 83, x: 0, y: 0, inputs: { "Input 1": 5, "Input 2": 3 } },
    { uid: 5, type: 49, x: 0, y: 0, props: { onlyUpdateWithSet: true }, inputs: { "Set": 2, "Data": 4 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  for (let i = 0; i < 1800; i++) e.tick(1 / 60);
  check("timer cadence: 0.5s blinker rises exactly 30x in 30s", e.getOut(5) === 30);
}

// 17. Rangefinder example (mirrors EXAMPLES.rangefinder in app.js): the echo
// round trip through transceivers 1600px = 400 studs apart takes 2s at
// 400 studs/s, measured by latching a 0.1s tick counter at send and at echo.
{
  const m = mkModel([
    { uid: 1, type: 34, x: 0, y: 0, inputs: { "Input": 2 } },
    { uid: 2, type: 45, x: 0, y: 0, props: { delay: 0.05 }, inputs: { "Activate": 1 } },
    { uid: 3, type: 82, x: 0, y: 0, props: { value: 1 } },
    { uid: 4, type: 83, x: 0, y: 0, inputs: { "Input 1": 5, "Input 2": 3 } },
    { uid: 5, type: 49, x: 0, y: 0, props: { onlyUpdateWithSet: true }, inputs: { "Set": 2, "Data": 4 } },
    { uid: 6, type: 14, x: 0, y: 0, props: { key: "P" } },
    { uid: 7, type: 44, x: 280, y: 340, props: { channel: 7 }, inputs: { "Send Signal": 6 } },
    { uid: 8, type: 49, x: 0, y: 0, props: { onlyUpdateWithSet: true }, inputs: { "Set": 6, "Data": 5 } },
    { uid: 9, type: 49, x: 0, y: 0, props: { onlyUpdateWithSet: true }, inputs: { "Set": 7, "Data": 5 } },
    { uid: 10, type: 84, x: 0, y: 0, inputs: { "Input 1": 9, "Input 2": 8 } },
    { uid: 11, type: 49, x: 0, y: 0, props: { onlyUpdateWithSet: true }, inputs: { "Set": 9, "Data": 10 } },
    { uid: 12, type: 82, x: 0, y: 0, props: { value: 0.1 } },
    { uid: 13, type: 85, x: 0, y: 0, inputs: { "Input 1": 11, "Input 2": 12 } },
    { uid: 15, type: 82, x: 0, y: 0, props: { value: 200 } },
    { uid: 16, type: 85, x: 0, y: 0, inputs: { "Input 1": 13, "Input 2": 15 } },
    { uid: 18, type: 37, x: 0, y: 0, inputs: { "Input 1": 6, "Input 2": 7 } },
    { uid: 20, type: 44, x: 1880, y: 340, props: { channel: 7 }, inputs: { "Send Signal": 20 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  for (let i = 0; i < 20; i++) e.tick(1 / 60); // let the clock run to an arbitrary phase
  e.keyDown("P");
  check("rangefinder: in-flight lamp on after ping", e.getOut(18) === 1);
  check("rangefinder: no result before the echo lands", e.getOut(16) === 0);
  for (let i = 0; i < 150; i++) e.tick(1 / 60); // 2.5s > 2s round trip
  check("rangefinder: round trip reads 2s", e.getOut(13) === 2);
  check("rangefinder: distance reads 400 studs", e.getOut(16) === 400);
  check("rangefinder: in-flight lamp off once echoed", e.getOut(18) === 0);
  e.keyUp("P"); // the falling level echoes too; the result must not change
  for (let i = 0; i < 150; i++) e.tick(1 / 60);
  check("rangefinder: result holds after the release echo", e.getOut(16) === 400 && e.getOut(18) === 0);
}

// 18. Push Button normal mode: 1 while held, 0 on release (README type 61).
{
  const m = mkModel([
    { uid: 1, type: 61, x: 0, y: 0 },
    { uid: 2, type: 31, x: 0, y: 0, inputs: { "Activate": 1 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  check("button: starts 0", e.getOut(1) === 0);
  e.buttonDown(1);
  check("button: 1 while held", e.getOut(1) === 1);
  check("button: press drives a toggle gate", e.getOut(2) === 1);
  e.buttonUp(1);
  check("button: 0 on release", e.getOut(1) === 0);
  check("button: release is a falling edge, toggle holds", e.getOut(2) === 1);
}

// 19. Push Button toggle mode: flips latched state on press-down only.
{
  const m = mkModel([
    { uid: 1, type: 61, x: 0, y: 0, props: { toggle: true } },
  ]);
  const e = new Engine(m, {});
  e.start();
  check("button toggle: starts 0", e.getOut(1) === 0);
  e.buttonDown(1);
  check("button toggle: press flips to 1", e.getOut(1) === 1);
  e.buttonUp(1);
  check("button toggle: release keeps 1", e.getOut(1) === 1);
  e.buttonDown(1);
  check("button toggle: second press flips back to 0", e.getOut(1) === 0);
  e.buttonUp(1);
  check("button toggle: stays 0 after release", e.getOut(1) === 0);
}

// 20. Push Button presses while paused are deferred (level applies on resume,
// like key detectors); switching the Toggle prop re-bases the output.
{
  const m = mkModel([
    { uid: 1, type: 61, x: 0, y: 0 },
  ]);
  const e = new Engine(m, {});
  e.start();
  e.pause();
  e.buttonDown(1);
  check("button pause: press deferred", e.getOut(1) === 0);
  e.resume();
  check("button pause: deferred press applied on resume", e.getOut(1) === 1);
  m.blocks.get(1).props.toggle = true; // held button switched to toggle mode: latched state is still false
  e.propChanged(1);
  check("button prop: switch to toggle re-bases output on latched state", e.getOut(1) === 0);
}

// 21. Note block (simulator-only) is inert: no output, no effect on the sim.
{
  const m = mkModel([
    { uid: 1, type: 999, x: 0, y: 0, props: { text: "wiring docs\nline 2" } },
    { uid: 2, type: 82, x: 0, y: 0, props: { value: 3 } },
  ]);
  const e = new Engine(m, {});
  e.start();
  e.tick(0.5);
  check("note: has no output (nothing, not 0)", e.getOut(1) === undefined);
  check("note: rest of the sim unaffected", e.getOut(2) === 3 && !e.isKilled(1));
  check("note: text survives in props", m.blocks.get(1).props.text === "wiring docs\nline 2");
}

// ---------- wire routing (route.js) + wire geometry (editor.js) ----------

// Helpers for the routing tests: polylines from the router are orthogonal.
function fullPolyline(w, corners) {
  return [{ x: w.ax, y: w.ay }, ...corners, { x: w.bx, y: w.by }];
}
function isOrthogonal(poly) {
  for (let i = 1; i < poly.length; i++) {
    if (Math.abs(poly[i].x - poly[i - 1].x) > 0.01 && Math.abs(poly[i].y - poly[i - 1].y) > 0.01) return false;
  }
  return true;
}
function segmentHitsRect(a, b, rect) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return x1 > rect.x && x0 < rect.x + rect.w && y1 > rect.y && y0 < rect.y + rect.h;
}
function polylineHitsRect(poly, rect) {
  for (let i = 1; i < poly.length; i++) {
    if (segmentHitsRect(poly[i - 1], poly[i], rect)) return true;
  }
  return false;
}

// 22. Unobstructed straight wire: router leaves it corner-free.
{
  const w = { id: "a", ax: 0, ay: 50, bx: 620, by: 50 };
  const routes = autoRouteWires([w], []);
  check("route: straight clear wire has no corners", routes.get("a").length === 0);
}

// 23. A block in the way: the route bends around it without touching it.
{
  const rect = { x: 250, y: -30, w: 180, h: 160 };
  const w = { id: "a", ax: 0, ay: 50, bx: 620, by: 50 };
  const routes = autoRouteWires([w], [rect]);
  const corners = routes.get("a");
  const poly = fullPolyline(w, corners);
  check("route: obstacle forces corners", corners.length >= 2);
  check("route: path is orthogonal", isOrthogonal(poly));
  check("route: path avoids the block", !polylineHitsRect(poly, rect));
  check("route: first segment leaves at the output height", poly[1].y === 50 || poly.length === 2);
  check("route: last segment arrives at the input height", poly[poly.length - 2].y === 50 || poly.length === 2);
}

// 24. Two wires sharing a corridor: the second detours around the first
// instead of riding on top of it.
{
  const a = { id: "a", ax: 0, ay: 50, bx: 620, by: 50 };
  const b = { id: "b", ax: 0, ay: 50, bx: 620, by: 50 };
  const routes = autoRouteWires([a, b], []);
  const straightCount = [routes.get("a"), routes.get("b")].filter((c) => c.length === 0).length;
  check("route: only one wire takes the direct corridor", straightCount === 1);
  const detour = routes.get("a").length ? routes.get("a") : routes.get("b");
  check("route: the other wire detours with corners", detour.length >= 2);
  check("route: detour stays orthogonal", isOrthogonal(fullPolyline(a, detour)));
}

// 25. Dense scene: routes exist for all wires and none crosses any block.
{
  const rects = [];
  const wires = [];
  for (let i = 0; i < 4; i++) {
    rects.push({ x: 220, y: i * 140 - 40, w: 180, h: 110 });
    wires.push({ id: "w" + i, ax: 0, ay: i * 140, bx: 640, by: (3 - i) * 140 });
  }
  const routes = autoRouteWires(wires, rects);
  let ok = true, avoid = true;
  for (const w of wires) {
    const poly = fullPolyline(w, routes.get(w.id));
    if (!isOrthogonal(poly)) ok = false;
    for (const r of rects) if (polylineHitsRect(poly, r)) avoid = false;
  }
  check("route: dense scene stays orthogonal", ok);
  check("route: dense scene avoids every block", avoid);
}

// 25b. Snap-to-grid routing: with a snap pitch every corner lands on the
// lattice, except that runs touching a port keep the exact port height.
{
  const SNAP = 24;
  const rect = { x: 250, y: -30, w: 180, h: 160 };
  const w = { id: "a", ax: 0, ay: 50, bx: 620, by: 50 };
  const routes = autoRouteWires([w], [rect], SNAP);
  const corners = routes.get("a");
  const poly = fullPolyline(w, corners);
  const onGrid = (v) => Math.abs(v / SNAP - Math.round(v / SNAP)) < 1e-9;
  check("route: snapped route still bends around the block", corners.length >= 2);
  check("route: snapped path stays orthogonal", isOrthogonal(poly));
  check("route: snapped path avoids the block", !polylineHitsRect(poly, rect));
  check("route: snapped corner x's sit on the lattice", corners.every((p) => onGrid(p.x)));
  check("route: snapped corner y's sit on the lattice or at port height",
        corners.every((p) => onGrid(p.y) || p.y === w.ay || p.y === w.by));
}

// 26. Wire path geometry helpers (editor.js).
{
  const d = roundedPolyPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }]);
  check("roundedPolyPath: starts at the first point", d.startsWith("M 0 0"));
  check("roundedPolyPath: one corner -> one arc", (d.match(/Q/g) || []).length === 1);
  check("roundedPolyPath: ends at the last point", / L 100 80$/.test(d));
  const straight = roundedPolyPath([{ x: 0, y: 0 }, { x: 50, y: 50 }]);
  check("roundedPolyPath: two points is a plain segment", straight === "M 0 0 L 50 50");
  check("distToSegment: point beside a segment", distToSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 }) === 10);
  check("distToSegment: point past the end clamps", distToSegment({ x: 110, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }) === 10);
  check("distToSegment: degenerate segment", distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }) === 5);
}

// 27. Wire cosmetics survive the export shape (mirror of editor.serialize()).
{
  const wires = { "Input": { color: "#ff5d5d", points: [{ x: 120, y: 80 }, { x: 120, y: 160 }] } };
  const json = JSON.stringify({
    format: "mechanica-sim", version: 1,
    blocks: [{ uid: 2, type: 34, x: 30, y: 40, props: {}, inputs: { "Input": 1 }, wires }],
  });
  const back = JSON.parse(json);
  const m = back.blocks[0].wires["Input"];
  check("wire meta: colour round-trips", m.color === "#ff5d5d");
  check("wire meta: corners round-trip", m.points.length === 2 && m.points[1].y === 160);
}

// ---------- multi-block clipboard (clipboard.js) ----------

// 28. buildClip keeps wires between copied blocks and drops wires to blocks
// left behind; wire cosmetics follow the surviving wires only.
{
  const m = mkModel([
    { uid: 1, type: 82, x: 0, y: 0, props: { value: 5 } },                          // outside the copy
    { uid: 2, type: 83, x: 40, y: 0, inputs: { "Input 1": 1, "Input 2": 3 } },       // In1 external, In2 internal
    { uid: 3, type: 82, x: 40, y: 60, props: { value: 2 } },                         // inside the copy
  ]);
  // Colour/corners on both an internal wire (Input 2) and an external one (Input 1).
  m.blocks.get(2).wires = {
    "Input 1": { color: "#ff5d5d", points: [{ x: 10, y: 10 }] },
    "Input 2": { color: "#3ecf6f", points: [{ x: 20, y: 20 }] },
  };
  const clip = buildClip(m, [2, 3]);
  check("clip: is a valid clip", isClip(clip) && clip.blocks.length === 2);
  const b2 = clip.blocks.find((b) => b.uid === 2);
  check("clip: internal wire reference kept", b2.inputs["Input 2"] === 3);
  check("clip: external wire reference dropped", b2.inputs["Input 1"] === null);
  check("clip: cosmetics kept for internal wire", b2.wires && b2.wires["Input 2"] && b2.wires["Input 2"].color === "#3ecf6f");
  check("clip: cosmetics dropped for severed wire", !(b2.wires && b2.wires["Input 1"]));
  check("clip: only selected blocks copied", !clip.blocks.some((b) => b.uid === 1));
}

// 29. remapClip assigns fresh uids, rewires internal references to them,
// offsets positions and corners, and nulls references to blocks not in the clip.
{
  const clip = {
    format: "mechanica-sim-clip", version: 1,
    blocks: [
      { uid: 2, type: 83, x: 40, y: 0, props: {}, inputs: { "Input 1": null, "Input 2": 3, "Input 3": 99 },
        wires: { "Input 2": { color: "#3ecf6f", points: [{ x: 20, y: 20 }] } } },
      { uid: 3, type: 82, x: 40, y: 60, props: { value: 2 }, inputs: {} },
    ],
  };
  let next = 100;
  const out = remapClip(clip, () => next++, 48, 24);
  check("remap: fresh uids allocated in order", out.newUids.length === 2 && out.newUids[0] === 100 && out.newUids[1] === 101);
  const nb2 = out.blocks.find((b) => b.uid === 100);
  const nb3 = out.blocks.find((b) => b.uid === 101);
  check("remap: internal reference rewired to new uid", nb2.inputs["Input 2"] === nb3.uid);
  check("remap: reference to a block outside the clip nulled", nb2.inputs["Input 3"] === null);
  check("remap: positions offset", nb2.x === 88 && nb2.y === 24 && nb3.y === 84);
  check("remap: wire corners offset", nb2.wires["Input 2"].points[0].x === 68 && nb2.wires["Input 2"].points[0].y === 44);
  check("remap: idMap maps old->new", out.idMap.get(2) === 100 && out.idMap.get(3) === 101);
}

// 30. A self-loop (block feeding its own input) is preserved and rewired to the
// block's new uid on paste.
{
  const m = mkModel([
    { uid: 7, type: 37, x: 0, y: 0, inputs: { "Input 1": 7, "Input 2": 7 } },
  ]);
  const clip = buildClip(m, [7]);
  check("clip: self-loop reference kept", clip.blocks[0].inputs["Input 1"] === 7);
  let next = 50;
  const out = remapClip(clip, () => next++, 0, 0);
  check("remap: self-loop points at the new uid", out.blocks[0].inputs["Input 1"] === out.blocks[0].uid);
  check("remap: self-loop both ports rewired", out.blocks[0].inputs["Input 2"] === out.blocks[0].uid);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll tests passed.");
process.exit(failures ? 1 : 0);
