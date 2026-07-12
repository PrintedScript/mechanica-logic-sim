// engine.js — event-based simulation engine for the Mechanica logic system.
//
// When a block's output changes it force-updates every block that depends on
// it (event chain). Each block counts how many times it has been activated
// within one event chain; past ACTIVATION_LIMIT the block is killed for the
// rest of the run, mirroring the game's infinite-loop protection.

"use strict";

const ACTIVATION_LIMIT = 100;
const STUDS_PER_PX = 0.25;          // canvas px -> studs, for wireless distance delay
const WIRELESS_STUDS_PER_SEC = 400; // simulated signal travel speed

class Engine {
  constructor(model, hooks) {
    this.model = model;             // { blocks: Map<uid, block> }
    this.hooks = hooks || {};       // { onKilled(uid) }
    this.running = false;
    this.paused = false;
    this.simTime = 0;
    this.rt = new Map();            // uid -> { out, state, killed, act, chain }
    this.deps = new Map();          // srcUid -> [{ uid, port }]
    this.timers = [];               // { time, seq, kind: "delay"|"radio", uid, value }
    this.timerSeq = 0;
    this.chainId = 0;
    this.queue = [];
    this.keysDown = new Set();
    this.pendingProps = new Set();      // prop edits made while paused
    this.pendingStructure = new Set();  // structure edits made while paused
  }

  // ---------- lifecycle ----------

  start() {
    this.running = true;
    this.paused = false;
    this.simTime = 0;
    this.timers = [];
    this.timerSeq = 0;
    this.chainId = 0;
    this.rt = new Map();
    this.keysDown.clear();
    this.pendingProps.clear();
    this.pendingStructure.clear();
    this.buildIndex();
    for (const uid of this.model.blocks.keys()) this.ensureRt(uid);
    // Initial event chain: every block announces its starting output.
    this.beginChain();
    for (const uid of this.model.blocks.keys()) this.queue.push({ uid, port: "__init", val: 0 });
    this.processQueue();
  }

  stop() {
    this.running = false;
    this.paused = false;
    this.rt = new Map();
    this.timers = [];
    this.keysDown.clear();
    this.pendingProps.clear();
    this.pendingStructure.clear();
  }

  // Pause freezes the sim clock (timers, sensors) and defers external events;
  // resume applies everything that happened while paused.
  pause() {
    if (this.running) this.paused = true;
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    const props = [...this.pendingProps];
    this.pendingProps.clear();
    for (const uid of props) this.propChanged(uid);
    const struct = [...this.pendingStructure];
    this.pendingStructure.clear();
    if (struct.length) this.structureChanged(struct);
    this.updateKeyDetectors();
    this.updateButtons();
  }

  tick(dt) {
    if (!this.running || this.paused) return;
    this.simTime += dt;

    // Fire due timers (delay gates, wireless deliveries) in schedule order —
    // each is a fresh chain. Timers scheduled during this tick wait for the
    // next one, so zero-delay feedback loops can't stall the frame.
    const seqSnapshot = this.timerSeq;
    for (;;) {
      let idx = -1;
      for (let i = 0; i < this.timers.length; i++) {
        const t = this.timers[i];
        if (t.time > this.simTime || t.seq >= seqSnapshot) continue;
        if (idx < 0 || t.time < this.timers[idx].time ||
            (t.time === this.timers[idx].time && t.seq < this.timers[idx].seq)) idx = i;
      }
      if (idx < 0) break;
      const t = this.timers.splice(idx, 1)[0];
      if (!this.model.blocks.has(t.uid)) continue;
      // The chain runs at the timer's logical due time: timers it schedules
      // (delay loops, wireless echo hops) count from that exact time rather
      // than the frame boundary, so periodic chains don't drift with frame rate.
      const frameTime = this.simTime;
      this.simTime = t.time;
      this.beginChain();
      this.setOut(t.uid, t.value);
      this.processQueue();
      this.simTime = frameTime;
    }

    // Sensors update their output every frame.
    for (const blk of this.model.blocks.values()) {
      if (BLOCK_TYPES[blk.type].kind !== "sensor") continue;
      const rt = this.ensureRt(blk.uid);
      if (rt.killed) continue;
      const v = this.sensorValue(blk);
      if (!valEq(rt.out, v)) {
        this.beginChain();
        this.setOut(blk.uid, v);
        this.processQueue();
      }
    }
  }

  // ---------- external events ----------

  keyDown(key) {
    if (!this.running || this.keysDown.has(key)) return;
    this.keysDown.add(key);
    if (!this.paused) this.updateKeyDetectors();
  }

  keyUp(key) {
    if (!this.running) return;
    this.keysDown.delete(key);
    if (!this.paused) this.updateKeyDetectors();
  }

  updateKeyDetectors() {
    for (const blk of this.model.blocks.values()) {
      if (BLOCK_TYPES[blk.type].kind !== "key") continue;
      const want = this.keysDown.has(String(blk.props.key || "").toUpperCase()) ? 1 : 0;
      const rt = this.ensureRt(blk.uid);
      if (!rt.killed && !valEq(rt.out, want)) {
        this.beginChain();
        this.setOut(blk.uid, want);
        this.processQueue();
      }
    }
  }

  // The user pushed/released a push button in the editor. Like key presses,
  // level changes made while paused are applied on resume; a press that is
  // also released while paused collapses to nothing.
  buttonDown(uid) {
    this.setButtonPressed(uid, true);
  }

  buttonUp(uid) {
    this.setButtonPressed(uid, false);
  }

  setButtonPressed(uid, pressed) {
    if (!this.running) return;
    const blk = this.model.blocks.get(uid);
    if (!blk || BLOCK_TYPES[blk.type].kind !== "button") return;
    this.ensureRt(uid).state.pressed = pressed;
    if (!this.paused) this.updateButtons();
  }

  updateButtons() {
    for (const blk of this.model.blocks.values()) {
      if (BLOCK_TYPES[blk.type].kind !== "button") continue;
      const rt = this.ensureRt(blk.uid);
      if (rt.killed) continue;
      const st = rt.state;
      if (st.pressed === st.applied) continue;
      st.applied = st.pressed;
      // Toggle mode flips the latched state on press-down only; normal mode
      // follows the hold level directly.
      if (blk.props.toggle && !st.pressed) continue;
      if (blk.props.toggle) st.state = !st.state;
      const want = (blk.props.toggle ? st.state : st.pressed) ? 1 : 0;
      if (!valEq(rt.out, want)) {
        this.beginChain();
        this.setOut(blk.uid, want);
        this.processQueue();
      }
    }
  }

  buttonValue(blk, rt) {
    return (blk.props.toggle ? rt.state.state : rt.state.applied) ? 1 : 0;
  }

  // A property was edited while running.
  propChanged(uid) {
    if (!this.running) return;
    if (this.paused) { this.pendingProps.add(uid); return; }
    const blk = this.model.blocks.get(uid);
    if (!blk) return;
    const kind = BLOCK_TYPES[blk.type].kind;
    if (kind === "const" || kind === "pure") {
      this.beginChain();
      this.queue.push({ uid, port: "__recompute", val: 0 });
      this.processQueue();
    } else if (kind === "key") {
      this.updateKeyDetectors();
    } else if (kind === "button") {
      // Switching Toggle mode re-bases the output on the mode's own source
      // (latched state vs. hold level).
      const rt = this.ensureRt(uid);
      if (!rt.killed && !valEq(rt.out, this.buttonValue(blk, rt))) {
        this.beginChain();
        this.setOut(uid, this.buttonValue(blk, rt));
        this.processQueue();
      }
    }
    // sensor props are picked up on the next tick
  }

  // Blocks or wires were added/removed while running.
  structureChanged(changedUids) {
    this.buildIndex();
    if (!this.running) return;
    for (const uid of this.rt.keys()) if (!this.model.blocks.has(uid)) this.rt.delete(uid);
    if (this.paused) {
      for (const uid of changedUids || []) this.pendingStructure.add(uid);
      return;
    }
    this.beginChain();
    for (const uid of changedUids || []) {
      const blk = this.model.blocks.get(uid);
      if (!blk) continue;
      const isNew = !this.rt.has(uid);
      this.ensureRt(uid);
      const kind = BLOCK_TYPES[blk.type].kind;
      if (isNew) this.queue.push({ uid, port: "__init", val: 0 });
      else if (kind === "pure") this.queue.push({ uid, port: "__recompute", val: 0 });
    }
    this.processQueue();
  }

  // ---------- internals ----------

  ensureRt(uid) {
    let rt = this.rt.get(uid);
    if (!rt) {
      const def = BLOCK_TYPES[this.model.blocks.get(uid).type];
      rt = { out: undefined, state: def.initState ? def.initState() : {}, killed: false, act: 0, chain: -1 };
      this.rt.set(uid, rt);
    }
    return rt;
  }

  buildIndex() {
    this.deps = new Map();
    for (const blk of this.model.blocks.values()) {
      for (const port of blockInputs(blk)) {
        const src = blk.inputs[port];
        if (src == null || !this.model.blocks.has(src)) continue;
        if (!this.deps.has(src)) this.deps.set(src, []);
        this.deps.get(src).push({ uid: blk.uid, port });
      }
    }
  }

  beginChain() { this.chainId++; }

  setOut(uid, v) {
    const rt = this.ensureRt(uid);
    if (valEq(rt.out, v)) return;
    rt.out = v;
    for (const dep of this.deps.get(uid) || []) {
      this.queue.push({ uid: dep.uid, port: dep.port, val: v });
    }
  }

  processQueue() {
    while (this.queue.length) {
      const ev = this.queue.shift();
      const blk = this.model.blocks.get(ev.uid);
      if (!blk) continue;
      const rt = this.ensureRt(ev.uid);
      if (rt.killed) continue;
      if (rt.chain !== this.chainId) { rt.chain = this.chainId; rt.act = 0; }
      if (++rt.act > ACTIVATION_LIMIT) {
        rt.killed = true;
        if (this.hooks.onKilled) this.hooks.onKilled(ev.uid);
        continue;
      }
      this.dispatch(blk, rt, ev.port, ev.val);
    }
  }

  dispatch(blk, rt, port, val) {
    const def = BLOCK_TYPES[blk.type];
    const init = port === "__init";
    switch (def.kind) {
      case "pure":
        this.setOut(blk.uid, def.compute(this.gatherIns(blk), blk.props));
        break;
      case "const":
        this.setOut(blk.uid, clampNum(blk.props.value, -10000000, 10000000));
        break;
      case "key":
        if (init) this.setOut(blk.uid, this.keysDown.has(String(blk.props.key || "").toUpperCase()) ? 1 : 0);
        break;
      case "button":
        if (init) this.setOut(blk.uid, this.buttonValue(blk, rt));
        break;
      case "sensor":
        if (init) this.setOut(blk.uid, this.sensorValue(blk));
        break;
      case "toggle":
        if (init) this.setOut(blk.uid, rt.state.state ? 1 : 0);
        else if (port === "Activate" && truish(val)) {
          rt.state.state = !rt.state.state;
          this.setOut(blk.uid, rt.state.state ? 1 : 0);
        }
        break;
      case "memory":
        if (init) this.setOut(blk.uid, rt.state.mem);
        else if (port === "Set" && truish(val)) {
          // Set turning truish captures Data in both modes.
          rt.state.mem = num(this.getIn(blk, "Data"));
          this.setOut(blk.uid, rt.state.mem);
        } else if (port === "Data" && !blk.props.onlyUpdateWithSet && truish(this.getIn(blk, "Set"))) {
          // Continuous mode additionally follows Data while Set stays truish.
          rt.state.mem = num(val);
          this.setOut(blk.uid, rt.state.mem);
        }
        break;
      case "delay":
        if (init) this.setOut(blk.uid, 0);
        else if (port === "Activate") {
          const d = clampNum(blk.props.delay, 0, 600);
          this.timers.push({ time: this.simTime + d, seq: this.timerSeq++, kind: "delay", uid: blk.uid, value: val });
        }
        break;
      case "wireless":
        if (init) this.setOut(blk.uid, 0);
        else if (port === "Send Signal") {
          for (const other of this.model.blocks.values()) {
            if (other.uid === blk.uid || BLOCK_TYPES[other.type].kind !== "wireless") continue;
            if ((other.props.channel | 0) !== (blk.props.channel | 0)) continue;
            const distStuds = Math.hypot(other.x - blk.x, other.y - blk.y) * STUDS_PER_PX;
            const d = distStuds / WIRELESS_STUDS_PER_SEC;
            this.timers.push({ time: this.simTime + d, seq: this.timerSeq++, kind: "radio", uid: other.uid, value: val });
          }
        }
        break;
      case "display":
        break; // displays are rendered by the editor from their inputs
      case "note":
        break; // simulator-only annotation, no runtime behaviour
    }
  }

  gatherIns(blk) {
    const ins = {};
    for (const port of blockInputs(blk)) ins[port] = this.getIn(blk, port);
    return ins;
  }

  getIn(blk, port) {
    const src = blk.inputs[port];
    if (src == null) return undefined;
    const rt = this.rt.get(src);
    return rt ? rt.out : undefined;
  }

  getOut(uid) {
    const rt = this.rt.get(uid);
    return rt ? rt.out : undefined;
  }

  isKilled(uid) {
    const rt = this.rt.get(uid);
    return rt ? rt.killed : false;
  }

  sensorValue(blk) {
    const range = clampNum(blk.props.range, 0, 500);
    if (blk.props.distanceMode) {
      if (range <= 0) return 0;
      return clampNum(blk.props.simDistance / range, 0, 1);
    }
    return blk.props.simDetected ? 1 : 0;
  }
}

function valEq(a, b) {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

function clampNum(v, min, max) {
  v = Number(v);
  if (!isFinite(v)) v = 0;
  return Math.min(max, Math.max(min, v));
}
