// editor.js — canvas node editor: blocks, wires, pan/zoom, inspector.

"use strict";

const BLOCK_W = 180, HEAD_H = 29, ROW_H = 24, ROWS_PAD = 4;
const HEAD_H_NAMED = 41;       // taller head when a custom name + type subtitle are shown
const MAX_NAME_LEN = 50;
const GRID_SIZE = 24;          // snap-to-grid pitch, matches the canvas dot grid
const WIRE_CORNER_R = 8;       // rounding radius of wire corners, px
const MAX_WIRE_POINTS = 64;
const WIRE_COLORS = ["#ff5d5d", "#ffb84d", "#ffd34d", "#3ecf6f", "#4da3ff", "#b784ff", "#ff7ad0", "#9aa7b4"];

class Editor {
  constructor() {
    this.model = { blocks: new Map() };
    this.nextUid = 1;
    this.pan = { x: 60, y: 40 };
    this.zoom = 1;
    this.snap = true;           // snap blocks and wire corners to GRID_SIZE
    this.selected = null;        // { kind: "block", uid } | { kind: "wire", uid, port }
    this.dragWire = null;
    this.onChange = null;        // (structural: bool, changedUids: number[]) => void
    this.onPropEdit = null;      // (uid) => void
    this.getEngine = null;       // () => engine | null (for inspector live info)

    this.wrap = document.getElementById("canvas-wrap");
    this.world = document.getElementById("world");
    this.svg = document.getElementById("wires");
    this.layer = document.getElementById("blocks-layer");
    this.inspBody = document.getElementById("inspector-body");
    this.status = document.getElementById("canvas-status");

    this.blockEls = new Map();   // uid -> { root, valueEl, extraEl, portEls }
    this.wireEls = [];           // { dst, port, src, visible, hit }
    this.handleGroup = null;     // <g> of corner handles for the selected wire

    this.bindCanvasEvents();
    this.applyTransform();
  }

  // ---------------- model ops ----------------

  setSnap(on) {
    this.snap = !!on;
    this.wrap.classList.toggle("snap-grid", this.snap);
  }

  // World coordinate -> integer px, on the grid lattice while snap is on.
  snapPos(v) {
    return this.snap ? Math.round(v / GRID_SIZE) * GRID_SIZE : Math.round(v);
  }

  addBlock(type, x, y) {
    const uid = this.nextUid++;
    if (x === undefined) {
      const rect = this.wrap.getBoundingClientRect();
      x = (rect.width / 2 - this.pan.x) / this.zoom - BLOCK_W / 2 + ((uid % 5) * 18);
      y = (rect.height / 2 - this.pan.y) / this.zoom - 60 + ((uid % 5) * 18);
    }
    const blk = { uid, type, name: "", x: this.snapPos(x), y: this.snapPos(y), props: defaultProps(type), inputs: {} };
    for (const p of blockInputs(blk)) blk.inputs[p] = null;
    this.model.blocks.set(uid, blk);
    this.renderBlock(uid);
    this.select({ kind: "block", uid });
    this.emitChange(true, [uid]);
    return blk;
  }

  deleteBlock(uid) {
    const changed = [uid];
    this.model.blocks.delete(uid);
    for (const b of this.model.blocks.values()) {
      for (const p of Object.keys(b.inputs)) {
        if (b.inputs[p] === uid) {
          b.inputs[p] = null;
          if (b.wires) delete b.wires[p];
          changed.push(b.uid);
        }
      }
    }
    const el = this.blockEls.get(uid);
    if (el) { el.root.remove(); this.blockEls.delete(uid); }
    if (this.selected && this.selected.uid === uid) this.select(null);
    this.renderWires();
    this.emitChange(true, changed);
  }

  connect(srcUid, dstUid, port) {
    const dst = this.model.blocks.get(dstUid);
    if (!dst) return; // self-loops (srcUid === dstUid) are allowed, as in Mechanica
    dst.inputs[port] = srcUid;
    this.renderWires();
    this.emitChange(true, [dstUid]);
  }

  disconnect(dstUid, port) {
    const dst = this.model.blocks.get(dstUid);
    if (!dst) return;
    dst.inputs[port] = null;
    if (dst.wires) delete dst.wires[port]; // corners/colour belong to the wire
    this.renderWires();
    this.emitChange(true, [dstUid]);
  }

  // Per-wire cosmetics, keyed like inputs: dstBlk.wires[port] = { color, points }.
  wireMeta(blk, port, create) {
    if (!blk.wires) {
      if (!create) return null;
      blk.wires = {};
    }
    let m = blk.wires[port];
    if (!m && create) {
      m = { color: null, points: [] };
      blk.wires[port] = m;
    }
    return m || null;
  }

  setWireColor(dstUid, port, color, refreshInspector = true) {
    const dst = this.model.blocks.get(dstUid);
    if (!dst || dst.inputs[port] == null) return;
    this.wireMeta(dst, port, true).color = color || null;
    this.renderWires();
    if (refreshInspector) this.renderInspector();
    this.emitChange(false, [dstUid]);
  }

  clearWireCorners(dstUid, port) {
    const dst = this.model.blocks.get(dstUid);
    const meta = dst && this.wireMeta(dst, port);
    if (!meta || !meta.points.length) return;
    meta.points = [];
    this.renderWires();
    this.emitChange(false, [dstUid]);
  }

  setProp(uid, key, value) {
    const blk = this.model.blocks.get(uid);
    if (!blk) return;
    const pdef = BLOCK_TYPES[blk.type].props.find((p) => p.key === key);
    if (pdef && (pdef.type === "number" || pdef.type === "range")) {
      value = Math.min(pdef.max, Math.max(pdef.min, snapNumber(value)));
    }
    blk.props[key] = value;
    // Dynamic input lists (Flat Light Panel mode) may add/remove ports.
    const ports = blockInputs(blk);
    let structural = false;
    for (const p of Object.keys(blk.inputs)) {
      if (!ports.includes(p)) {
        delete blk.inputs[p];
        if (blk.wires) delete blk.wires[p];
        structural = true;
      }
    }
    for (const p of ports) if (!(p in blk.inputs)) { blk.inputs[p] = null; structural = true; }
    this.renderBlock(uid);
    this.renderWires();
    if (structural) this.emitChange(true, [uid]);
    else { this.emitChange(false, [uid]); if (this.onPropEdit) this.onPropEdit(uid); }
  }

  // Custom display name (documentation aid). Whitespace-only counts as unnamed;
  // the raw text is kept while typing so trailing spaces aren't eaten mid-word.
  setName(uid, name) {
    const blk = this.model.blocks.get(uid);
    if (!blk) return;
    name = String(name || "").slice(0, MAX_NAME_LEN);
    if ((blk.name || "") === name) return;
    blk.name = name;
    this.renderBlock(uid);
    // A name appearing/disappearing changes the head height, moving port anchors.
    this.updateWiresFor(uid);
    this.emitChange(false, [uid]);
  }

  clear() {
    this.model.blocks.clear();
    this.nextUid = 1;
    this.layer.innerHTML = "";
    this.blockEls.clear();
    this.select(null);
    this.renderWires();
    this.emitChange(true, []);
  }

  emitChange(structural, uids) {
    if (this.onChange) this.onChange(structural, uids);
  }

  // ---------------- serialize ----------------

  serialize() {
    return {
      format: "mechanica-sim",
      version: 1,
      blocks: [...this.model.blocks.values()].map((b) => {
        const out = {
          uid: b.uid, type: b.type, x: b.x, y: b.y,
          props: { ...b.props },
          inputs: { ...b.inputs },
        };
        const name = (b.name || "").trim();
        if (name) out.name = name;
        // Wire cosmetics: only ports that are wired and have something set.
        const wires = {};
        for (const [p, m] of Object.entries(b.wires || {})) {
          if (b.inputs[p] == null || !m || (!m.color && !m.points.length)) continue;
          wires[p] = {
            color: m.color || null,
            points: m.points.map((pt) => ({ x: pt.x, y: pt.y })),
          };
        }
        if (Object.keys(wires).length) out.wires = wires;
        return out;
      }),
    };
  }

  load(data) {
    if (!data || data.format !== "mechanica-sim" || !Array.isArray(data.blocks)) {
      throw new Error("Not a valid mechanica-sim build (expected format: \"mechanica-sim\").");
    }
    const blocks = new Map();
    let maxUid = 0;
    for (const raw of data.blocks) {
      const type = Number(raw.type);
      if (!BLOCK_TYPES[type]) throw new Error(`Unknown block type id: ${raw.type}`);
      const uid = Number(raw.uid);
      if (!Number.isInteger(uid) || uid <= 0 || blocks.has(uid)) throw new Error(`Bad/duplicate uid: ${raw.uid}`);
      const blk = {
        uid, type,
        name: typeof raw.name === "string" ? raw.name.slice(0, MAX_NAME_LEN) : "",
        x: Number(raw.x) || 0, y: Number(raw.y) || 0,
        props: { ...defaultProps(type), ...(raw.props || {}) },
        inputs: {},
      };
      // Imported numbers obey the same 0.005-step rule as typed ones.
      for (const p of BLOCK_TYPES[type].props) {
        if (p.type === "number" || p.type === "range") {
          blk.props[p.key] = Math.min(p.max, Math.max(p.min, snapNumber(blk.props[p.key])));
        }
      }
      for (const p of blockInputs(blk)) {
        const src = raw.inputs ? raw.inputs[p] : null;
        blk.inputs[p] = (src == null) ? null : Number(src);
      }
      if (raw.wires && typeof raw.wires === "object") {
        for (const p of blockInputs(blk)) {
          const m = raw.wires[p];
          if (!m || blk.inputs[p] == null) continue;
          const color = (typeof m.color === "string" && /^#[0-9a-f]{6}$/i.test(m.color)) ? m.color : null;
          const points = (Array.isArray(m.points) ? m.points : [])
            .slice(0, MAX_WIRE_POINTS)
            .map((pt) => ({ x: Number(pt && pt.x) || 0, y: Number(pt && pt.y) || 0 }));
          if (color || points.length) {
            if (!blk.wires) blk.wires = {};
            blk.wires[p] = { color, points };
          }
        }
      }
      blocks.set(uid, blk);
      maxUid = Math.max(maxUid, uid);
    }
    // Drop references to blocks that don't exist.
    for (const b of blocks.values()) {
      for (const p of Object.keys(b.inputs)) {
        if (b.inputs[p] != null && !blocks.has(b.inputs[p])) {
          b.inputs[p] = null;
          if (b.wires) delete b.wires[p];
        }
      }
    }
    this.model.blocks = blocks;
    this.nextUid = maxUid + 1;
    this.select(null);
    this.renderAll();
    this.emitChange(true, [...blocks.keys()]);
  }

  // ---------------- geometry ----------------

  // Head height depends on whether a custom name (with its type subtitle) is shown.
  headH(blk) {
    return (blk.name || "").trim() ? HEAD_H_NAMED : HEAD_H;
  }

  portAnchor(blk, port) {
    const ports = blockInputs(blk);
    const headH = this.headH(blk);
    if (port === "__out") {
      const y = blk.y + headH + ROWS_PAD + ports.length * ROW_H + ROW_H / 2;
      return { x: blk.x + BLOCK_W, y };
    }
    const i = ports.indexOf(port);
    return { x: blk.x, y: blk.y + headH + ROWS_PAD + i * ROW_H + ROW_H / 2 };
  }

  screenToWorld(cx, cy) {
    const r = this.wrap.getBoundingClientRect();
    return { x: (cx - r.left - this.pan.x) / this.zoom, y: (cy - r.top - this.pan.y) / this.zoom };
  }

  applyTransform() {
    this.world.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    // Keep the background dots glued to world coordinates: one dot on every
    // grid point, so snap-to-grid lands blocks exactly on the visible dots.
    const g = GRID_SIZE * this.zoom;
    this.wrap.style.backgroundSize = `${g}px ${g}px`;
    this.wrap.style.backgroundPosition = `${this.pan.x - g / 2}px ${this.pan.y - g / 2}px`;
    this.status.textContent = `zoom ${Math.round(this.zoom * 100)}%`;
  }

  // ---------------- rendering ----------------

  renderAll() {
    this.layer.innerHTML = "";
    this.blockEls.clear();
    for (const uid of this.model.blocks.keys()) this.renderBlock(uid);
    this.renderWires();
  }

  renderBlock(uid) {
    const blk = this.model.blocks.get(uid);
    if (!blk) return;
    const def = BLOCK_TYPES[blk.type];
    const old = this.blockEls.get(uid);
    if (old) old.root.remove();

    const root = document.createElement("div");
    root.className = `block cat-${def.cat}${def.kind === "note" ? " note" : ""}`;
    root.dataset.uid = uid;
    root.style.left = blk.x + "px";
    root.style.top = blk.y + "px";

    const head = document.createElement("div");
    head.className = "block-head";
    // A custom name replaces the title; the real block name drops to a subtitle.
    const customName = (blk.name || "").trim();
    const tid = `<span class="tid">${def.virtual ? "sim" : blk.type}</span>`;
    if (customName) {
      head.classList.add("named");
      head.innerHTML = `<span class="head-title"><span class="custom-name" title="${escapeHtml(customName)}">${escapeHtml(customName)}</span><span class="type-sub">${escapeHtml(def.name)}</span></span>${tid}`;
    } else {
      head.innerHTML = `<span>${def.name}</span>${tid}`;
    }
    root.appendChild(head);

    const rows = document.createElement("div");
    rows.className = "block-rows";
    const ports = blockInputs(blk);
    const portEls = {};
    const inValEls = {};
    ports.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "port-row";
      const lbl = document.createElement("span");
      lbl.className = "in-label";
      lbl.textContent = p;
      row.appendChild(lbl);
      const val = document.createElement("span");
      val.className = "in-val";
      row.appendChild(val);
      inValEls[p] = val;
      rows.appendChild(row);
      const dot = document.createElement("div");
      dot.className = "port in";
      dot.dataset.uid = uid;
      dot.dataset.port = p;
      dot.title = p;
      dot.style.top = (ROWS_PAD + i * ROW_H + 6) + "px";
      rows.appendChild(dot);
      portEls[p] = dot;
    });
    if (def.hasOutput) {
      const row = document.createElement("div");
      row.className = "port-row out-row";
      row.textContent = "Out";
      rows.appendChild(row);
      const dot = document.createElement("div");
      dot.className = "port out";
      dot.dataset.uid = uid;
      dot.dataset.port = "__out";
      dot.title = "Output";
      dot.style.top = (ROWS_PAD + ports.length * ROW_H + 6) + "px";
      rows.appendChild(dot);
      portEls["__out"] = dot;
    }
    if (ports.length || def.hasOutput) root.appendChild(rows);

    const extra = document.createElement("div");
    extra.className = "block-extra";
    let valueEl = null, extraEl = null;
    if (blk.type === 47) {
      extraEl = document.createElement("div");
      extraEl.className = "light-swatch";
      extra.appendChild(extraEl);
    } else if (blk.type === 89) {
      extraEl = document.createElement("div");
      extraEl.className = "numdisp";
      extra.appendChild(extraEl);
    } else if (blk.type === 14) {
      const cap = document.createElement("div");
      cap.className = "block-value";
      cap.innerHTML = `key: <span class="keycap">${escapeHtml(String(blk.props.key || "?"))}</span>`;
      extra.appendChild(cap);
    } else if (blk.type === 61) {
      // Pressable while the simulation runs; the window listeners make sure a
      // press started on the button is released even if the cursor leaves it.
      extraEl = document.createElement("button");
      extraEl.type = "button";
      extraEl.className = "pushbtn";
      extraEl.textContent = "Push";
      extraEl.disabled = !(this.getEngine && this.getEngine());
      extraEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        extraEl.classList.add("held");
        const eng = this.getEngine ? this.getEngine() : null;
        if (eng) eng.buttonDown(blk.uid);
        const release = () => {
          window.removeEventListener("mouseup", release);
          window.removeEventListener("blur", release);
          extraEl.classList.remove("held");
          const eng2 = this.getEngine ? this.getEngine() : null;
          if (eng2) eng2.buttonUp(blk.uid);
        };
        window.addEventListener("mouseup", release);
        window.addEventListener("blur", release);
      });
      extra.appendChild(extraEl);
    } else if (blk.type === 999) {
      extraEl = document.createElement("div");
      extraEl.className = "note-text";
      const txt = String(blk.props.text || "");
      extraEl.textContent = txt || "Empty note — edit in the Inspector.";
      extraEl.classList.toggle("empty", !txt);
      extra.appendChild(extraEl);
    }
    if (def.hasOutput) {
      valueEl = document.createElement("div");
      valueEl.className = "block-value";
      // Constant gates show their configured value while editing; when the
      // sim runs, updateRuntime replaces it with the live output.
      if (def.kind === "const" && !(this.getEngine && this.getEngine())) {
        valueEl.textContent = "= " + formatValue(blk.props.value);
        valueEl.classList.add("const-preview");
      }
      extra.appendChild(valueEl);
    }
    root.appendChild(extra);

    this.layer.appendChild(root);
    this.blockEls.set(uid, { root, valueEl, extraEl, portEls, inValEls });
    if (this.selected && this.selected.kind === "block" && this.selected.uid === uid) {
      root.classList.add("selected");
    }
    this.bindBlockEvents(root, blk);
  }

  renderWires() {
    this.svg.innerHTML = "";
    this.wireEls = [];
    this.handleGroup = null;
    for (const blk of this.model.blocks.values()) {
      for (const port of blockInputs(blk)) {
        const src = blk.inputs[port];
        if (src == null || !this.model.blocks.has(src)) continue;
        const meta = this.wireMeta(blk, port);
        const d = this.wirePath(this.model.blocks.get(src), blk, port);
        const vis = mkSvg("path", { class: "wire", d });
        const hit = mkSvg("path", { class: "hit", d });
        if (meta && meta.color) {
          vis.classList.add("colored");
          vis.style.stroke = meta.color;
          vis.style.color = meta.color; // .on glow uses currentColor
        }
        hit.dataset.dst = blk.uid;
        hit.dataset.port = port;
        this.svg.appendChild(vis);
        this.svg.appendChild(hit);
        this.wireEls.push({ dst: blk.uid, port, src, visible: vis, hit });
        if (this.selected && this.selected.kind === "wire" &&
            this.selected.uid === blk.uid && this.selected.port === port) {
          vis.classList.add("selected");
        }
      }
    }
    this.renderHandles();
  }

  // Corner dots of the selected wire, draggable; double-click removes one.
  renderHandles() {
    if (this.handleGroup) { this.handleGroup.remove(); this.handleGroup = null; }
    if (!this.selected || this.selected.kind !== "wire") return;
    const blk = this.model.blocks.get(this.selected.uid);
    if (!blk || blk.inputs[this.selected.port] == null) return;
    const meta = this.wireMeta(blk, this.selected.port);
    if (!meta || !meta.points.length) return;
    const g = mkSvg("g", { class: "wire-handles" });
    meta.points.forEach((p, i) => {
      const c = mkSvg("circle", { class: "wire-handle", cx: p.x, cy: p.y, r: 5 });
      c.dataset.dst = this.selected.uid;
      c.dataset.port = this.selected.port;
      c.dataset.index = i;
      g.appendChild(c);
    });
    this.svg.appendChild(g);
    this.handleGroup = g;
  }

  wirePath(srcBlk, dstBlk, port) {
    const a = this.portAnchor(srcBlk, "__out");
    const b = this.portAnchor(dstBlk, port);
    const meta = this.wireMeta(dstBlk, port);
    if (meta && meta.points.length) return roundedPolyPath([a, ...meta.points, b]);
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  updateWireEl(dstUid, port) {
    for (const w of this.wireEls) {
      if (w.dst !== dstUid || w.port !== port) continue;
      const d = this.wirePath(this.model.blocks.get(w.src), this.model.blocks.get(w.dst), w.port);
      w.visible.setAttribute("d", d);
      w.hit.setAttribute("d", d);
    }
  }

  updateWiresFor(uid) {
    for (const w of this.wireEls) {
      if (w.src !== uid && w.dst !== uid) continue;
      const d = this.wirePath(this.model.blocks.get(w.src), this.model.blocks.get(w.dst), w.port);
      w.visible.setAttribute("d", d);
      w.hit.setAttribute("d", d);
    }
  }

  // ---------------- selection ----------------

  select(sel) {
    if (this.selected && this.selected.kind === "block") {
      const el = this.blockEls.get(this.selected.uid);
      if (el) el.root.classList.remove("selected");
    }
    if (this.selected && this.selected.kind === "wire") {
      for (const w of this.wireEls) w.visible.classList.remove("selected");
    }
    this.selected = sel;
    if (sel && sel.kind === "block") {
      const el = this.blockEls.get(sel.uid);
      if (el) el.root.classList.add("selected");
    }
    if (sel && sel.kind === "wire") {
      for (const w of this.wireEls) {
        if (w.dst === sel.uid && w.port === sel.port) w.visible.classList.add("selected");
      }
    }
    this.renderHandles();
    this.renderInspector();
  }

  deleteSelection() {
    if (!this.selected) return;
    if (this.selected.kind === "block") this.deleteBlock(this.selected.uid);
    else if (this.selected.kind === "wire") {
      this.disconnect(this.selected.uid, this.selected.port);
      this.select(null);
    }
  }

  // ---------------- events ----------------

  bindCanvasEvents() {
    // Pan + deselect on empty space.
    this.wrap.addEventListener("mousedown", (e) => {
      if (e.target !== this.wrap && e.target !== this.svg && e.target !== this.world && e.target !== this.layer) return;
      this.select(null);
      const start = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
      const move = (ev) => {
        this.pan.x = start.px + (ev.clientX - start.x);
        this.pan.y = start.py + (ev.clientY - start.y);
        this.applyTransform();
      };
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });

    // Zoom to cursor.
    this.wrap.addEventListener("wheel", (e) => {
      e.preventDefault();
      const before = this.screenToWorld(e.clientX, e.clientY);
      this.zoom = Math.min(2.5, Math.max(0.25, this.zoom * Math.exp(-e.deltaY * 0.0012)));
      const r = this.wrap.getBoundingClientRect();
      this.pan.x = e.clientX - r.left - before.x * this.zoom;
      this.pan.y = e.clientY - r.top - before.y * this.zoom;
      this.applyTransform();
    }, { passive: false });

    // Wires: drag a corner handle to move it, drag the wire itself to bend a
    // new corner into it, plain click to select.
    this.svg.addEventListener("mousedown", (e) => {
      const handle = e.target.closest ? e.target.closest("circle.wire-handle") : null;
      if (handle) {
        e.preventDefault();
        e.stopPropagation();
        this.dragCorner(Number(handle.dataset.dst), handle.dataset.port, Number(handle.dataset.index), e);
        return;
      }
      const p = e.target.closest ? e.target.closest("path.hit") : null;
      if (p) {
        e.stopPropagation();
        const uid = Number(p.dataset.dst), port = p.dataset.port;
        this.select({ kind: "wire", uid, port });
        this.bendWireDrag(uid, port, e);
      }
    });

    // Double-click a corner handle to remove that corner.
    this.svg.addEventListener("dblclick", (e) => {
      const handle = e.target.closest ? e.target.closest("circle.wire-handle") : null;
      if (!handle) return;
      e.preventDefault();
      e.stopPropagation();
      const blk = this.model.blocks.get(Number(handle.dataset.dst));
      const meta = blk && this.wireMeta(blk, handle.dataset.port);
      if (!meta) return;
      meta.points.splice(Number(handle.dataset.index), 1);
      this.renderWires();
      this.emitChange(false, [blk.uid]);
    });
  }

  // Drag an existing corner of a wire.
  dragCorner(dstUid, port, index, e) {
    const blk = this.model.blocks.get(dstUid);
    const meta = blk && this.wireMeta(blk, port);
    if (!meta || !meta.points[index]) return;
    const move = (ev) => {
      if (index >= meta.points.length) return; // corner was removed mid-drag
      const m = this.screenToWorld(ev.clientX, ev.clientY);
      meta.points[index] = { x: this.snapPos(m.x), y: this.snapPos(m.y) };
      this.updateWireEl(dstUid, port);
      const c = this.handleGroup && this.handleGroup.children[index];
      if (c) { c.setAttribute("cx", meta.points[index].x); c.setAttribute("cy", meta.points[index].y); }
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      this.emitChange(false, [dstUid]);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // Mousedown on the wire body: once the cursor moves a few px, insert a new
  // corner at the grabbed spot and keep dragging it. A plain click (no
  // movement) stays a selection.
  bendWireDrag(dstUid, port, e) {
    const start = { x: e.clientX, y: e.clientY };
    const move = (ev) => {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const blk = this.model.blocks.get(dstUid);
      if (!blk || blk.inputs[port] == null) return;
      const meta = this.wireMeta(blk, port, true);
      if (meta.points.length >= MAX_WIRE_POINTS) return;
      const src = this.model.blocks.get(blk.inputs[port]);
      const grab = this.screenToWorld(start.x, start.y);
      const poly = [this.portAnchor(src, "__out"), ...meta.points, this.portAnchor(blk, port)];
      let best = 0, bestD = Infinity;
      for (let i = 0; i < poly.length - 1; i++) {
        const d = distToSegment(grab, poly[i], poly[i + 1]);
        if (d < bestD) { bestD = d; best = i; }
      }
      meta.points.splice(best, 0, { x: this.snapPos(grab.x), y: this.snapPos(grab.y) });
      this.renderWires();
      this.dragCorner(dstUid, port, best, ev);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  bindBlockEvents(root, blk) {
    const head = root.querySelector(".block-head");
    head.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.select({ kind: "block", uid: blk.uid });
      const start = this.screenToWorld(e.clientX, e.clientY);
      const orig = { x: blk.x, y: blk.y };
      const move = (ev) => {
        const cur = this.screenToWorld(ev.clientX, ev.clientY);
        blk.x = this.snapPos(orig.x + cur.x - start.x);
        blk.y = this.snapPos(orig.y + cur.y - start.y);
        root.style.left = blk.x + "px";
        root.style.top = blk.y + "px";
        this.updateWiresFor(blk.uid);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        this.emitChange(false, [blk.uid]);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });

    root.addEventListener("mousedown", (e) => {
      const dot = e.target.closest ? e.target.closest(".port") : null;
      if (dot) { e.preventDefault(); e.stopPropagation(); this.startWireDrag(dot); return; }
      if (e.target.closest(".block")) this.select({ kind: "block", uid: blk.uid });
    });
  }

  startWireDrag(dot) {
    const uid = Number(dot.dataset.uid);
    const port = dot.dataset.port;
    let fromOut, fromUid;
    if (port === "__out") {
      fromOut = true; fromUid = uid;
    } else {
      const blk = this.model.blocks.get(uid);
      if (blk.inputs[port] != null) {
        // Grab the existing wire: detach and re-drag from its source output.
        fromOut = true; fromUid = blk.inputs[port];
        this.disconnect(uid, port);
      } else {
        fromOut = false; fromUid = uid;
        this.dragInPort = port;
      }
    }
    const temp = mkSvg("path", { class: "temp", d: "" });
    this.svg.appendChild(temp);

    const anchorOf = () => {
      const blk = this.model.blocks.get(fromUid);
      return fromOut ? this.portAnchor(blk, "__out") : this.portAnchor(blk, this.dragInPort);
    };
    const move = (ev) => {
      const m = this.screenToWorld(ev.clientX, ev.clientY);
      const a = anchorOf();
      const dx = Math.max(40, Math.abs(m.x - a.x) * 0.5);
      temp.setAttribute("d", fromOut
        ? `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${m.x - dx} ${m.y}, ${m.x} ${m.y}`
        : `M ${m.x} ${m.y} C ${m.x + dx} ${m.y}, ${a.x - dx} ${a.y}, ${a.x} ${a.y}`);
    };
    const up = (ev) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      temp.remove();
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = el && el.closest ? el.closest(".port") : null;
      if (target) {
        const tUid = Number(target.dataset.uid);
        const tPort = target.dataset.port;
        if (fromOut && tPort !== "__out") this.connect(fromUid, tUid, tPort);
        else if (!fromOut && tPort === "__out") this.connect(tUid, fromUid, this.dragInPort);
      }
      this.dragInPort = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // ---------------- auto format ----------------

  // Re-route every wire orthogonally around blocks and other wires (route.js).
  // Existing corners are replaced; colours are untouched. Returns the number
  // of wires routed.
  autoFormat() {
    const obstacles = [];
    for (const blk of this.model.blocks.values()) {
      const els = this.blockEls.get(blk.uid);
      const w = (els && els.root.offsetWidth) || BLOCK_W;
      const h = (els && els.root.offsetHeight) ||
                (this.headH(blk) + ROWS_PAD * 2 + (blockInputs(blk).length + 1) * ROW_H + 24);
      obstacles.push({ x: blk.x, y: blk.y, w, h });
    }
    const wires = [];
    for (const blk of this.model.blocks.values()) {
      for (const port of blockInputs(blk)) {
        const src = blk.inputs[port];
        if (src == null || !this.model.blocks.has(src)) continue;
        const a = this.portAnchor(this.model.blocks.get(src), "__out");
        const b = this.portAnchor(blk, port);
        wires.push({ id: `${blk.uid}:${port}`, ax: a.x, ay: a.y, bx: b.x, by: b.y, dst: blk.uid, port });
      }
    }
    if (!wires.length) return 0;
    const routes = autoRouteWires(wires, obstacles, this.snap ? GRID_SIZE : 0);
    for (const w of wires) {
      const meta = this.wireMeta(this.model.blocks.get(w.dst), w.port, true);
      meta.points = (routes.get(w.id) || []).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    }
    this.renderWires();
    this.emitChange(false, []);
    return wires.length;
  }

  // ---------------- inspector ----------------

  // Display label for a block: custom name if set, else the type name.
  blockLabel(blk) {
    const name = (blk.name || "").trim();
    return name || BLOCK_TYPES[blk.type].name;
  }

  renderInspector() {
    const body = this.inspBody;
    if (!this.selected) { body.innerHTML = `<em class="muted">Nothing selected</em>`; return; }
    if (this.selected.kind === "wire") {
      const { uid, port } = this.selected;
      const dst = this.model.blocks.get(uid);
      const src = dst ? this.model.blocks.get(dst.inputs[port]) : null;
      const meta = dst ? this.wireMeta(dst, port) : null;
      body.innerHTML = `<div class="insp-block-name">Wire</div>
        <div class="insp-sub">${src ? escapeHtml(this.blockLabel(src)) : "?"} → ${dst ? escapeHtml(this.blockLabel(dst)) : "?"} · ${escapeHtml(port)}</div>`;

      // Colour coding: preset swatches, a custom picker, and a reset.
      const colorField = document.createElement("div");
      colorField.className = "insp-field";
      const colorLabel = document.createElement("label");
      colorLabel.textContent = "Wire color";
      colorField.appendChild(colorLabel);
      const swatches = document.createElement("div");
      swatches.className = "wire-swatches";
      const current = meta ? meta.color : null;
      const none = document.createElement("button");
      none.type = "button";
      none.className = "wire-swatch none" + (current ? "" : " active");
      none.title = "Default (uncolored)";
      none.addEventListener("click", () => this.setWireColor(uid, port, null));
      swatches.appendChild(none);
      for (const c of WIRE_COLORS) {
        const s = document.createElement("button");
        s.type = "button";
        s.className = "wire-swatch" + (current && current.toLowerCase() === c ? " active" : "");
        s.style.background = c;
        s.title = c;
        s.addEventListener("click", () => this.setWireColor(uid, port, c));
        swatches.appendChild(s);
      }
      const custom = document.createElement("input");
      custom.type = "color";
      custom.className = "wire-swatch custom";
      custom.value = current || "#8fa1b5";
      custom.title = "Custom color";
      // Live preview while the native picker is open (no inspector rebuild —
      // that would close the picker); rebuild once the choice is committed.
      custom.addEventListener("input", () => this.setWireColor(uid, port, custom.value, false));
      custom.addEventListener("change", () => this.renderInspector());
      swatches.appendChild(custom);
      colorField.appendChild(swatches);
      body.appendChild(colorField);

      // Corners.
      const nCorners = meta ? meta.points.length : 0;
      const cornersInfo = document.createElement("div");
      cornersInfo.className = "insp-sub";
      cornersInfo.textContent = nCorners
        ? `${nCorners} corner${nCorners === 1 ? "" : "s"} — drag dots to move, double-click to remove`
        : "Drag the wire to add a corner";
      body.appendChild(cornersInfo);
      if (nCorners) {
        const straighten = document.createElement("button");
        straighten.textContent = "Straighten (remove corners)";
        straighten.style.width = "100%";
        straighten.onclick = () => { this.clearWireCorners(uid, port); this.renderInspector(); };
        body.appendChild(straighten);
      }

      const del = document.createElement("button");
      del.className = "danger insp-del";
      del.textContent = "Delete wire (Del)";
      del.onclick = () => this.deleteSelection();
      body.appendChild(del);
      return;
    }
    const blk = this.model.blocks.get(this.selected.uid);
    if (!blk) { body.innerHTML = ""; return; }
    const def = BLOCK_TYPES[blk.type];
    const subText = (customName) =>
      `${customName ? def.name + " · " : ""}${def.virtual ? "simulator-only" : `type ${blk.type}`} · uid ${blk.uid} · ${def.cat}`;
    const curName = (blk.name || "").trim();
    body.innerHTML = `<div class="insp-block-name">${escapeHtml(curName || def.name)}</div>
      <div class="insp-sub">${escapeHtml(subText(curName))}</div>`;
    const titleEl = body.querySelector(".insp-block-name");
    const subEl = body.querySelector(".insp-sub");

    // Custom name: shown as the block's title, with the real name as subtitle.
    const nameField = document.createElement("div");
    nameField.className = "insp-field";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Custom name";
    nameField.appendChild(nameLabel);
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = MAX_NAME_LEN;
    nameInput.placeholder = def.name;
    nameInput.spellcheck = false;
    nameInput.value = blk.name || "";
    // Update the block and the inspector header in place — no renderInspector,
    // which would rebuild the body and kick focus out of this input.
    nameInput.addEventListener("input", () => {
      this.setName(blk.uid, nameInput.value);
      const cur = this.model.blocks.get(blk.uid);
      const name = cur ? (cur.name || "").trim() : "";
      titleEl.textContent = name || def.name;
      subEl.textContent = subText(name);
    });
    nameField.appendChild(nameInput);
    body.appendChild(nameField);

    const addField = (p) => {
      const wrap = document.createElement("div");
      wrap.className = "insp-field";
      const label = document.createElement("label");
      label.textContent = p.label;
      wrap.appendChild(label);
      let input;
      if (p.type === "number" || p.type === "range") {
        input = document.createElement("input");
        input.type = p.type === "range" ? "range" : "number";
        input.min = p.min; input.max = p.max; input.step = p.step || "any";
        input.value = blk.props[p.key];
        input.addEventListener("input", () => {
          let v = Number(input.value);
          if (!isFinite(v)) v = p.default;
          this.setProp(blk.uid, p.key, v); // setProp snaps to 0.005 steps and clamps
        });
        input.addEventListener("change", () => {
          const cur = this.model.blocks.get(blk.uid);
          if (cur) input.value = cur.props[p.key]; // show the snapped value, e.g. 1.023 -> 1.025
        });
      } else if (p.type === "bool") {
        const row = document.createElement("div");
        row.className = "insp-row";
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!blk.props[p.key];
        input.addEventListener("change", () => this.setProp(blk.uid, p.key, input.checked));
        row.appendChild(input);
        row.appendChild(document.createTextNode(p.label));
        wrap.innerHTML = "";
        wrap.appendChild(row);
        body.appendChild(wrap);
        return;
      } else if (p.type === "select") {
        input = document.createElement("select");
        for (const o of p.options) {
          const opt = document.createElement("option");
          opt.value = o; opt.textContent = o;
          input.appendChild(opt);
        }
        input.value = blk.props[p.key];
        input.addEventListener("change", () => this.setProp(blk.uid, p.key, input.value));
      } else if (p.type === "textarea") {
        input = document.createElement("textarea");
        input.rows = 6;
        input.spellcheck = false;
        input.value = String(blk.props[p.key] || "");
        input.addEventListener("input", () => this.setProp(blk.uid, p.key, input.value));
      } else if (p.type === "color") {
        input = document.createElement("input");
        input.type = "color";
        input.value = blk.props[p.key];
        input.addEventListener("input", () => this.setProp(blk.uid, p.key, input.value));
      } else if (p.type === "key") {
        input = document.createElement("button");
        input.textContent = `Key: ${blk.props[p.key]} (click to rebind)`;
        input.addEventListener("click", () => {
          input.textContent = "Press any key…";
          const grab = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            window.removeEventListener("keydown", grab, true);
            const k = ev.key.length === 1 ? ev.key.toUpperCase() : ev.key.toUpperCase();
            this.setProp(blk.uid, p.key, k);
            this.renderInspector();
          };
          window.addEventListener("keydown", grab, true);
        });
      }
      wrap.appendChild(input);
      body.appendChild(wrap);
    };

    const normal = def.props.filter((p) => !p.sim);
    const sim = def.props.filter((p) => p.sim);
    for (const p of normal) addField(p);
    if (sim.length) {
      const t = document.createElement("div");
      t.className = "insp-sim-title";
      t.textContent = "World simulation";
      body.appendChild(t);
      for (const p of sim) addField(p);
    }

    const del = document.createElement("button");
    del.className = "danger insp-del";
    del.textContent = "Delete block (Del)";
    del.onclick = () => this.deleteSelection();
    body.appendChild(del);
  }

  // ---------------- runtime visuals ----------------

  updateRuntime(engine, running) {
    for (const [uid, els] of this.blockEls) {
      const blk = this.model.blocks.get(uid);
      if (!blk) continue;
      const def = BLOCK_TYPES[blk.type];
      const killed = running && engine.isKilled(uid);
      els.root.classList.toggle("killed", killed);
      if (els.valueEl) {
        if (running) {
          els.valueEl.textContent = killed ? "☠ killed" : formatValue(engine.getOut(uid));
          els.valueEl.classList.remove("const-preview");
        } else if (def.kind === "const") {
          els.valueEl.textContent = "= " + formatValue(blk.props.value);
          els.valueEl.classList.add("const-preview");
        } else {
          els.valueEl.textContent = "";
        }
      }
      // Live input values, shown in yellow next to each wired port label.
      for (const port of Object.keys(els.inValEls || {})) {
        const span = els.inValEls[port];
        span.textContent = running && blk.inputs[port] != null
          ? formatValue(engine.getIn(blk, port)) : "";
      }
      if (blk.type === 47 && els.extraEl) {
        els.extraEl.style.background = running ? lightPanelColor(blk, engine) : "#000";
      }
      if (blk.type === 61 && els.extraEl) {
        els.extraEl.disabled = !running;
        els.extraEl.classList.toggle("on", running && truish(engine.getOut(uid)));
      }
      if (blk.type === 89 && els.extraEl) {
        els.extraEl.style.color = blk.props.textColor;
        els.extraEl.style.background = blk.props.bgColor;
        els.extraEl.textContent = running ? formatValue(engine.getIn(blk, "Input")) : "–";
      }
    }
    for (const w of this.wireEls) {
      const on = running && truish(engine.getOut(w.src));
      w.visible.classList.toggle("on", on);
    }
  }
}

function lightPanelColor(blk, engine) {
  const hex = blk.props.lightColor || "#ffffff";
  const c = hexToRgb(hex);
  if (blk.props.inputMode === "RGB") {
    const r = clamp01(numOr0(engine.getIn(blk, "Red")));
    const g = clamp01(numOr0(engine.getIn(blk, "Green")));
    const b = clamp01(numOr0(engine.getIn(blk, "Blue")));
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }
  const bright = clamp01(numOr0(engine.getIn(blk, "Activate")));
  return `rgb(${Math.round(c.r * bright)}, ${Math.round(c.g * bright)}, ${Math.round(c.b * bright)})`;
}

function clamp01(v) { return Math.min(1, Math.max(0, v)); }
function numOr0(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mkSvg(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
  return el;
}

// Polyline through pts with rounded corners (quadratic arcs at each interior
// point, radius shrunk on short segments).
function roundedPolyPath(pts) {
  const r2 = (v) => Math.round(v * 100) / 100;
  let d = `M ${r2(pts[0].x)} ${r2(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], n = pts[i + 1];
    const l1 = Math.hypot(p.x - a.x, p.y - a.y);
    const l2 = Math.hypot(n.x - p.x, n.y - p.y);
    if (l1 < 0.01 || l2 < 0.01) continue;
    const r = Math.min(WIRE_CORNER_R, l1 / 2, l2 / 2);
    const inX = p.x - ((p.x - a.x) / l1) * r, inY = p.y - ((p.y - a.y) / l1) * r;
    const outX = p.x + ((n.x - p.x) / l2) * r, outY = p.y + ((n.y - p.y) / l2) * r;
    d += ` L ${r2(inX)} ${r2(inY)} Q ${r2(p.x)} ${r2(p.y)} ${r2(outX)} ${r2(outY)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${r2(last.x)} ${r2(last.y)}`;
  return d;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
