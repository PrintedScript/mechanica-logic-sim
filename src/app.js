// app.js — application shell: palette, toolbar, run loop, import/export, examples.

"use strict";

const editor = new Editor();
let engine = null;
let running = false;
let lastFrame = 0;

// ---------------- palette ----------------

const paletteList = document.getElementById("palette-list");
for (const [cat, ids] of Object.entries(BLOCK_ORDER)) {
  const h = document.createElement("div");
  h.className = "pal-cat";
  h.textContent = cat;
  paletteList.appendChild(h);
  for (const id of ids) {
    const item = document.createElement("div");
    item.className = "pal-item";
    item.innerHTML = `${escapeHtml(BLOCK_TYPES[id].name)}<span class="tid">${BLOCK_TYPES[id].virtual ? "sim" : id}</span>`;
    item.addEventListener("click", () => editor.addBlock(id));
    paletteList.appendChild(item);
  }
}

// ---------------- run / pause / reset / speed ----------------

const btnRun = document.getElementById("btn-run");
const btnPause = document.getElementById("btn-pause");
const btnReset = document.getElementById("btn-reset");
const selSpeed = document.getElementById("sel-speed");
const simTimeEl = document.getElementById("sim-time");
let speed = 1;

selSpeed.addEventListener("change", () => { speed = Number(selSpeed.value) || 1; });

function updatePauseButton() {
  const paused = !!(engine && engine.paused);
  btnPause.textContent = paused ? "▶ Resume" : "⏸ Pause";
  btnPause.classList.toggle("paused", paused);
}

function setRunning(on) {
  running = on;
  btnRun.textContent = on ? "⏹ Stop" : "▶ Run";
  btnRun.classList.toggle("running", on);
  btnReset.disabled = !on;
  btnPause.disabled = !on;
  if (on) {
    engine = new Engine(editor.model, {});
    engine.start();
    lastFrame = performance.now();
  } else {
    if (engine) engine.stop();
    engine = null;
    simTimeEl.textContent = "0.00s";
    editor.updateRuntime({ getOut: () => undefined, getIn: () => undefined, isKilled: () => false }, false);
  }
  updatePauseButton();
}

btnRun.addEventListener("click", () => setRunning(!running));
btnPause.addEventListener("click", () => {
  if (!running || !engine) return;
  if (engine.paused) engine.resume(); else engine.pause();
  updatePauseButton();
});
btnReset.addEventListener("click", () => {
  if (running) { engine.stop(); engine.start(); updatePauseButton(); }
});

function frame(now) {
  if (running && engine) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    engine.tick(dt * speed);
    simTimeEl.textContent = engine.simTime.toFixed(2) + "s" + (engine.paused ? " ⏸" : "");
    editor.updateRuntime(engine, true);
  }
  lastFrame = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- editor <-> engine bridge ----------------

editor.onChange = (structural, uids) => {
  saveLocal();
  if (running && engine && structural) engine.structureChanged(uids);
};
editor.onPropEdit = (uid) => {
  if (running && engine) engine.propChanged(uid);
};
editor.getEngine = () => engine;

// ---------------- keyboard ----------------

window.addEventListener("keydown", (e) => {
  const tag = document.activeElement ? document.activeElement.tagName : "";
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
    editor.deleteSelection();
    e.preventDefault();
    return;
  }
  if (running && engine && !typing && !e.repeat && modalBg.classList.contains("hidden")) {
    engine.keyDown(e.key.toUpperCase());
  }
});
window.addEventListener("keyup", (e) => {
  if (running && engine) engine.keyUp(e.key.toUpperCase());
});
window.addEventListener("blur", () => {
  if (running && engine) for (const k of [...engine.keysDown]) engine.keyUp(k);
});

// ---------------- modal ----------------

const modalBg = document.getElementById("modal-bg");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalActions = document.getElementById("modal-actions");

function openModal(title, bodyEl, actions) {
  modalTitle.textContent = title;
  modalBody.innerHTML = "";
  modalBody.appendChild(bodyEl);
  modalActions.innerHTML = "";
  for (const a of actions) {
    const b = document.createElement("button");
    b.textContent = a.label;
    if (a.primary) b.className = "primary";
    b.addEventListener("click", () => a.onClick(b));
    modalActions.appendChild(b);
  }
  const close = document.createElement("button");
  close.textContent = "Close";
  close.addEventListener("click", closeModal);
  modalActions.appendChild(close);
  modalBg.classList.remove("hidden");
}
function closeModal() { modalBg.classList.add("hidden"); }
modalBg.addEventListener("mousedown", (e) => { if (e.target === modalBg) closeModal(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ---------------- export / import ----------------

document.getElementById("btn-export").addEventListener("click", () => {
  const json = JSON.stringify(editor.serialize(), null, 2);
  const ta = document.createElement("textarea");
  ta.value = json;
  ta.readOnly = true;
  openModal("Export build", ta, [
    { label: "Copy", onClick: (b) => { navigator.clipboard.writeText(json).then(() => { b.textContent = "Copied!"; }); } },
    { label: "Download .json", primary: true, onClick: () => {
        const blob = new Blob([json], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "mechanica-build.json";
        a.click();
        URL.revokeObjectURL(a.href);
      } },
  ]);
});

document.getElementById("btn-import").addEventListener("click", () => {
  const wrap = document.createElement("div");
  const ta = document.createElement("textarea");
  ta.placeholder = "Paste an exported build JSON here…";
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.style.marginBottom = "8px";
  file.addEventListener("change", () => {
    const f = file.files[0];
    if (!f) return;
    f.text().then((t) => { ta.value = t; });
  });
  const err = document.createElement("div");
  err.style.color = "var(--red)";
  err.style.marginTop = "6px";
  wrap.appendChild(file);
  wrap.appendChild(ta);
  wrap.appendChild(err);
  openModal("Import build", wrap, [
    { label: "Load", primary: true, onClick: () => {
        try {
          const data = JSON.parse(ta.value);
          if (running) setRunning(false);
          editor.load(data);
          closeModal();
        } catch (ex) {
          err.textContent = "Import failed: " + ex.message;
        }
      } },
  ]);
});

// ---------------- clear / tidy / snap / autosave ----------------

document.getElementById("btn-tidy").addEventListener("click", () => {
  editor.autoFormat();
});

const btnSnap = document.getElementById("btn-snap");
function updateSnapButton() {
  btnSnap.classList.toggle("on", editor.snap);
  btnSnap.title = `Snap blocks and wire corners to the ${GRID_SIZE}px grid while dragging (currently ${editor.snap ? "on" : "off"})`;
}
btnSnap.addEventListener("click", () => {
  editor.setSnap(!editor.snap);
  try { localStorage.setItem("mechanica-sim-snap", editor.snap ? "1" : "0"); } catch (_) {}
  updateSnapButton();
});
(function restoreSnap() {
  try { if (localStorage.getItem("mechanica-sim-snap") === "1") editor.setSnap(true); } catch (_) {}
  updateSnapButton();
})();

document.getElementById("btn-clear").addEventListener("click", () => {
  if (!editor.model.blocks.size || confirm("Clear the whole build?")) {
    if (running) setRunning(false);
    editor.clear();
  }
});

function saveLocal() {
  try { localStorage.setItem("mechanica-sim-build", JSON.stringify(editor.serialize())); } catch (_) {}
}
(function restoreLocal() {
  try {
    const raw = localStorage.getItem("mechanica-sim-build");
    if (raw) {
      const data = JSON.parse(raw);
      if (data.blocks && data.blocks.length) editor.load(data);
    }
  } catch (_) {}
})();

// ---------------- help ----------------

document.getElementById("btn-help").addEventListener("click", () => {
  const div = document.createElement("div");
  div.innerHTML = `
    <h3>Editing</h3>
    <ul>
      <li>Click a palette entry to add a block. Drag its header to move it.</li>
      <li>Drag from a green output dot to an input dot to wire blocks (dragging a wired input dot grabs that wire).</li>
      <li><b>Wire corners:</b> drag anywhere on a wire to bend a new corner into it. With the wire selected, drag a corner dot to move it, double-click a dot to remove it, or use "Straighten" in the Inspector.</li>
      <li><b>Wire colours:</b> select a wire and pick a colour in the Inspector (presets or a custom colour). Coloured wires glow in their own colour when carrying a True value. Colours and corners are saved with the build.</li>
      <li><b>⌗ Tidy wires</b> auto-routes every wire at right angles, steering around blocks and keeping wires from riding on top of each other. It replaces existing corners (colours are kept) — you can still adjust any wire by hand afterwards.</li>
      <li><b>▦ Snap</b> toggles snap-to-grid: newly added blocks, dragged blocks and wire corners align to the ${GRID_SIZE}px dot grid, and ⌗ Tidy wires routes its corners on the grid too. Existing positions are untouched until you drag them. The setting is remembered in this browser.</li>
      <li>Click a block or wire, then press <b>Delete</b> to remove it. Drag empty space to pan, scroll to zoom.</li>
      <li><b>Note</b> blocks (marked "sim") are simulator-only sticky notes for documenting your build — select one and edit its text in the Inspector. They are ignored by the simulation.</li>
      <li>A selected wire animates in the direction the data travels (source → destination).</li>
      <li>Number properties snap to steps of <b>0.005</b> like in the game — typing 1.023 stores 1.025.</li>
    </ul>
    <h3>Simulation (Mechanica rules)</h3>
    <ul>
      <li>All data is numbers. A value &gt; 0.5 counts as <b>True</b>; boolean gates output exactly 1 or 0.</li>
      <li>Event-based: outputs push updates to dependents when they change. A block activated more than ${ACTIVATION_LIMIT}× in one event chain is <b>killed</b> (shown in red) — the game's infinite-loop protection. Use Reset to revive.</li>
      <li><b>Pause</b> freezes the simulation clock (delays, wireless signals, sensors) without losing state; key presses and edits made while paused apply on Resume. The <b>Speed</b> factor runs the clock slower or faster (up to 10×).</li>
      <li>Key Detectors listen to your keyboard while running. Sensors are fed by the "World simulation" controls in the Inspector.</li>
      <li><b>Push Buttons</b> are pressed with the mouse on the block itself while running: normal mode outputs 1 only while held; Toggle mode flips the latched output on each press.</li>
      <li>Relay Gates output <b>nothing</b> (not 0) when the selected data port is unwired.</li>
      <li>Wireless Transceivers share a channel; delivery is delayed by the on-canvas distance between them (0.25 studs per px, signals travel 400 studs/s).</li>
    </ul>
    <h3>Import / Export</h3>
    <p>Export produces a JSON build you can save or share; Import loads it back. Your build also autosaves to this browser.</p>`;
  openModal("Help", div, []);
});

document.getElementById("sel-example").addEventListener("change", (e) => {
  const key = e.target.value;
  e.target.value = "";
  if (!key || !EXAMPLES[key]) return;
  if (editor.model.blocks.size && !confirm("Replace the current build with this example?")) return;
  if (running) setRunning(false);
  editor.load(JSON.parse(JSON.stringify(EXAMPLES[key])));
});
