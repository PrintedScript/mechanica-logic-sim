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
  saveActiveBuild();
  if (running && engine && structural) engine.structureChanged(uids);
};
editor.onPropEdit = (uid) => {
  if (running && engine) engine.propChanged(uid);
};
editor.getEngine = () => engine;

// ---------------- keyboard ----------------

// Copy the current selection into the shared clipboard and restart the paste
// cascade so the next paste lands just off the originals.
function copySelectionToClipboard() {
  const clip = editor.copySelection();
  if (!clip) return false;
  SimClipboard.set(clip, Date.now());
  editor.pasteOffsetStep = 0;
  return true;
}

// Paste the shared clipboard, cascading each successive paste by two grid cells
// so repeated pastes fan out instead of stacking exactly on top of each other.
function pasteFromClipboard() {
  const clip = SimClipboard.get();
  if (!clip) return false;
  editor.pasteOffsetStep += 1;
  const off = editor.pasteOffsetStep * GRID_SIZE * 2;
  const n = editor.pasteClip(clip, off, off);
  return n > 0;
}

window.addEventListener("keydown", (e) => {
  const tag = document.activeElement ? document.activeElement.tagName : "";
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
    editor.deleteSelection();
    e.preventDefault();
    return;
  }
  // Selection / clipboard shortcuts (not while typing or in a modal).
  const modalOpen = !modalBg.classList.contains("hidden");
  if ((e.ctrlKey || e.metaKey) && !typing && !modalOpen) {
    const k = e.key.toLowerCase();
    if (k === "a") { editor.selectAll(); e.preventDefault(); return; }
    if (k === "c") { copySelectionToClipboard(); e.preventDefault(); return; }
    if (k === "x") { if (copySelectionToClipboard()) editor.deleteSelection(); e.preventDefault(); return; }
    if (k === "v") { pasteFromClipboard(); e.preventDefault(); return; }
  }
  if (running && engine && !typing && !e.repeat && !modalOpen && !e.ctrlKey && !e.metaKey) {
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

// ---------------- workspace: tabbed editor sessions ----------------
//
// One Editor instance is shared by every tab (only one tab is visible at a
// time). Each tab is a saved build slot in localStorage plus a name and a
// remembered view (pan/zoom). The index tracks the tab order and which is
// active; switching serializes the current tab, then loads the target.

const WS_INDEX_KEY = "mechanica-sim-workspace";
const WS_BUILD_PREFIX = "mechanica-sim-build:";
const LEGACY_BUILD_KEY = "mechanica-sim-build"; // pre-tabs single build
const MAX_TAB_NAME = 40;

// { activeId, seq, tabs: [{ id, name }] }
const workspace = { activeId: null, seq: 0, tabs: [] };

const tabListEl = document.getElementById("tab-list");

function buildKey(id) { return WS_BUILD_PREFIX + id; }

function saveWorkspaceIndex() {
  try { localStorage.setItem(WS_INDEX_KEY, JSON.stringify(workspace)); } catch (_) {}
}

// Persist the active tab's build (with its current view) into its slot. Called
// on every editor change and before switching away / unloading.
function saveActiveBuild() {
  if (workspace.activeId == null) return;
  try {
    const data = editor.serialize();
    data.view = { pan: { x: editor.pan.x, y: editor.pan.y }, zoom: editor.zoom };
    localStorage.setItem(buildKey(workspace.activeId), JSON.stringify(data));
  } catch (_) {}
}

// Load a tab's build into the shared editor and restore its view. A missing or
// empty slot just clears the canvas. Sets activeId first so the load's onChange
// autosaves into the right slot.
function loadIntoEditor(id) {
  workspace.activeId = id;
  let data = null;
  try {
    const raw = localStorage.getItem(buildKey(id));
    if (raw) data = JSON.parse(raw);
  } catch (_) {}
  if (data && Array.isArray(data.blocks) && data.blocks.length) {
    try { editor.load(data); } catch (_) { editor.clear(); }
  } else {
    editor.clear();
  }
  // Restore the remembered view (fall back to the editor's defaults).
  const view = data && data.view;
  if (view && view.pan && typeof view.zoom === "number") {
    editor.pan.x = Number(view.pan.x) || 0;
    editor.pan.y = Number(view.pan.y) || 0;
    editor.zoom = Math.min(2.5, Math.max(0.25, Number(view.zoom) || 1));
    editor.applyTransform();
  }
}

function findTab(id) { return workspace.tabs.find((t) => t.id === id); }

// A unique "Untitled N" name for a fresh tab.
function nextUntitledName() {
  const used = new Set(workspace.tabs.map((t) => t.name));
  let n = workspace.tabs.length + 1;
  while (used.has("Untitled " + n)) n++;
  return "Untitled " + n;
}

function switchTo(id) {
  if (id === workspace.activeId) return;
  if (!findTab(id)) return;
  if (running) setRunning(false); // engine holds the model we're about to replace
  saveActiveBuild();
  loadIntoEditor(id);
  saveWorkspaceIndex();
  renderTabs();
}

function newTab() {
  if (running) setRunning(false);
  saveActiveBuild();
  const id = "t" + (++workspace.seq);
  workspace.tabs.push({ id, name: nextUntitledName() });
  loadIntoEditor(id);   // clears the canvas for the blank tab
  saveActiveBuild();     // create the (empty) slot
  saveWorkspaceIndex();
  renderTabs();
}

function tabIsEmpty(id) {
  if (id === workspace.activeId) return editor.model.blocks.size === 0;
  try {
    const raw = localStorage.getItem(buildKey(id));
    if (!raw) return true;
    const data = JSON.parse(raw);
    return !(data && Array.isArray(data.blocks) && data.blocks.length);
  } catch (_) { return true; }
}

function closeTab(id) {
  const tab = findTab(id);
  if (!tab) return;
  if (!tabIsEmpty(id) && !confirm(`Close "${tab.name}"? Its build will be discarded.`)) return;
  const idx = workspace.tabs.findIndex((t) => t.id === id);
  workspace.tabs.splice(idx, 1);
  try { localStorage.removeItem(buildKey(id)); } catch (_) {}

  if (workspace.tabs.length === 0) {
    // Never leave the user with zero tabs: open a fresh blank one.
    if (running) setRunning(false);
    const nid = "t" + (++workspace.seq);
    workspace.tabs.push({ id: nid, name: nextUntitledName() });
    workspace.activeId = null; // the old active tab is gone; don't re-save it
    loadIntoEditor(nid);
    saveActiveBuild();
  } else if (id === workspace.activeId) {
    // Closing the active tab: fall to its neighbour.
    if (running) setRunning(false);
    const next = workspace.tabs[Math.min(idx, workspace.tabs.length - 1)];
    workspace.activeId = null;
    loadIntoEditor(next.id);
  }
  saveWorkspaceIndex();
  renderTabs();
}

function renameTab(id, name) {
  const tab = findTab(id);
  if (!tab) return;
  name = String(name || "").trim().slice(0, MAX_TAB_NAME);
  if (!name) return; // ignore empty names, keep the old one
  tab.name = name;
  saveWorkspaceIndex();
  renderTabs();
}

// Swap a tab's label for an inline text field; commit on Enter/blur, cancel on
// Esc. Keydowns are kept local so global shortcuts (Delete, Ctrl+C) don't fire.
function beginRename(tab, tabEl, nameEl) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tab-rename";
  input.maxLength = MAX_TAB_NAME;
  input.value = tab.name;
  input.spellcheck = false;
  let done = false;
  const commit = (save) => {
    if (done) return;
    done = true;
    if (save) renameTab(tab.id, input.value);
    else renderTabs();
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); commit(true); }
    else if (e.key === "Escape") { e.preventDefault(); commit(false); }
  });
  input.addEventListener("blur", () => commit(true));
  input.addEventListener("mousedown", (e) => e.stopPropagation());
  input.addEventListener("dblclick", (e) => e.stopPropagation());
  tabEl.replaceChild(input, nameEl);
  input.focus();
  input.select();
}

function renderTabs() {
  tabListEl.innerHTML = "";
  for (const tab of workspace.tabs) {
    const el = document.createElement("div");
    el.className = "tab" + (tab.id === workspace.activeId ? " active" : "");
    el.title = tab.name + " — double-click to rename";

    const nameEl = document.createElement("span");
    nameEl.className = "tab-name";
    nameEl.textContent = tab.name;
    el.appendChild(nameEl);

    const close = document.createElement("button");
    close.className = "tab-close";
    close.textContent = "×";
    close.title = "Close tab";
    close.addEventListener("mousedown", (e) => { e.stopPropagation(); });
    close.addEventListener("click", (e) => { e.stopPropagation(); closeTab(tab.id); });
    el.appendChild(close);

    el.addEventListener("mousedown", () => switchTo(tab.id));
    el.addEventListener("dblclick", () => beginRename(tab, el, el.querySelector(".tab-name")));
    tabListEl.appendChild(el);
  }
}

document.getElementById("btn-new-tab").addEventListener("click", newTab);

// Pan/zoom don't trigger onChange, so capture the final view on the way out.
window.addEventListener("beforeunload", saveActiveBuild);

// Restore the workspace, migrating a pre-tabs single build if present.
(function initWorkspace() {
  let idx = null;
  try {
    const raw = localStorage.getItem(WS_INDEX_KEY);
    if (raw) idx = JSON.parse(raw);
  } catch (_) {}

  if (idx && Array.isArray(idx.tabs) && idx.tabs.length) {
    workspace.seq = Number(idx.seq) || 0;
    workspace.tabs = idx.tabs
      .filter((t) => t && typeof t.id === "string")
      .map((t) => ({ id: t.id, name: String(t.name || "Untitled").slice(0, MAX_TAB_NAME) }));
    const active = workspace.tabs.find((t) => t.id === idx.activeId) || workspace.tabs[0];
    loadIntoEditor(active.id);
    saveWorkspaceIndex();
    renderTabs();
    return;
  }

  // First run with the tab system. Migrate a legacy single build into tab #1.
  workspace.seq = 1;
  const id = "t1";
  workspace.tabs = [{ id, name: "Untitled 1" }];
  let migrated = false;
  try {
    const legacy = localStorage.getItem(LEGACY_BUILD_KEY);
    if (legacy) {
      const data = JSON.parse(legacy);
      if (data && Array.isArray(data.blocks) && data.blocks.length) {
        localStorage.setItem(buildKey(id), legacy);
        workspace.tabs[0].name = "My build";
        migrated = true;
      }
    }
  } catch (_) {}
  loadIntoEditor(id);
  saveActiveBuild();
  saveWorkspaceIndex();
  if (migrated) { try { localStorage.removeItem(LEGACY_BUILD_KEY); } catch (_) {} }
  renderTabs();
})();

// ---------------- help ----------------

document.getElementById("btn-help").addEventListener("click", () => {
  const div = document.createElement("div");
  div.innerHTML = `
    <h3>Editing</h3>
    <ul>
      <li>Click a palette entry to add a block. Drag its header to move it.</li>
      <li>Drag from a green output dot to an input dot to wire blocks (dragging a wired input dot grabs that wire).</li>
      <li><b>Selecting many:</b> drag across empty canvas to rubber-band select every block the box touches. <b>Shift+click</b> a block toggles it in/out of the selection, and <b>Shift+drag</b> adds a marquee to the current selection. <b>Ctrl/⌘+A</b> selects everything.</li>
      <li><b>Moving a group:</b> drag any selected block and the whole selection moves together, keeping each block's spacing. Wires that run between two selected blocks keep their bent corners in the same place relative to the blocks.</li>
      <li><b>Copy &amp; paste:</b> <b>Ctrl/⌘+C</b> copies the selected blocks, <b>Ctrl/⌘+V</b> pastes them (offset a little so they don't cover the originals; paste again to fan out more), and <b>Ctrl/⌘+X</b> cuts. Wires between copied blocks are kept; wires to blocks that weren't copied are dropped. The clipboard is shared, so you can paste the same selection again later.</li>
      <li><b>Wire corners:</b> drag anywhere on a wire to bend a new corner into it. With the wire selected, drag a corner dot to move it, double-click a dot to remove it, or use "Straighten" in the Inspector.</li>
      <li><b>Wire colours:</b> select a wire and pick a colour in the Inspector (presets or a custom colour). Coloured wires glow in their own colour when carrying a True value. Colours and corners are saved with the build.</li>
      <li><b>⌗ Tidy wires</b> auto-routes every wire at right angles, steering around blocks and keeping wires from riding on top of each other. It replaces existing corners (colours are kept) — you can still adjust any wire by hand afterwards.</li>
      <li><b>▦ Snap</b> toggles snap-to-grid: newly added blocks, dragged blocks and wire corners align to the ${GRID_SIZE}px dot grid, and ⌗ Tidy wires routes its corners on the grid too. Existing positions are untouched until you drag them. The setting is remembered in this browser.</li>
      <li>Click a block or wire, then press <b>Delete</b> to remove it (Delete clears the whole selection at once). <b>Middle-drag</b> or hold <b>Space</b> and drag to pan; scroll to zoom.</li>
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
    <h3>Tabs</h3>
    <ul>
      <li>Each tab is a separate build. Click <b>+ New</b> to open a blank one; click a tab to switch to it.</li>
      <li><b>Double-click a tab</b> to rename it (Enter to confirm, Esc to cancel). The <b>×</b> closes it (you're asked first if it isn't empty).</li>
      <li>Every tab autosaves to this browser — its blocks, wires, and even its pan/zoom are restored when you come back. Import, Export and Clear act on the current tab.</li>
      <li>Copy in one tab and paste in another: the clipboard is shared across tabs.</li>
    </ul>
    <h3>Import / Export</h3>
    <p>Export produces a JSON build you can save or share; Import loads it into the current tab. Every tab also autosaves to this browser.</p>`;
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
