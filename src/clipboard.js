// clipboard.js — portable multi-block clipboard for the Mechanica editor.
//
// A "clip" is a self-contained snapshot of a set of blocks and the wires
// *between* them, in a stable JSON shape that does not depend on any live
// editor. buildClip() produces one from a selection; remapClip() stamps a clip
// with fresh uids (and an optional position offset) so it can be pasted into
// any editor without colliding with existing blocks. Wires to blocks outside
// the copied set are dropped — only references that stay inside the clip are
// preserved, which is exactly what "keep the wire reference to any blocks also
// selected" means.
//
// The clip format is deliberately close to a mechanica-sim build so it can be
// carried anywhere (in-memory, localStorage, or a future cross-window/editor
// channel). SimClipboard is the shared sink: an in-memory copy for the common
// case, mirrored to localStorage so a second editor on the page — or another
// tab/window of the app — can paste what was copied here.

"use strict";

const CLIP_FORMAT = "mechanica-sim-clip";
const CLIP_VERSION = 1;
const CLIP_STORAGE_KEY = "mechanica-sim-clipboard";

// Build a clip from `model` (an object with a `blocks` Map) for the given set
// of block uids. `uids` may be any iterable (Array, Set). Only wires whose
// source is also in the set survive; everything else becomes an unwired port.
function buildClip(model, uids) {
  const keep = uids instanceof Set ? uids : new Set(uids);
  const blocks = [];
  for (const uid of keep) {
    const b = model.blocks.get(uid);
    if (!b) continue;
    const inputs = {};
    for (const [port, src] of Object.entries(b.inputs || {})) {
      // Preserve a connection only if its source is part of the copied set.
      inputs[port] = (src != null && keep.has(src)) ? src : null;
    }
    const out = {
      uid: b.uid,
      type: b.type,
      x: b.x,
      y: b.y,
      props: { ...b.props },
      inputs,
    };
    const name = (b.name || "").trim();
    if (name) out.name = name;
    // Carry wire cosmetics, but only for ports that stayed connected inside
    // the clip (a colour/corner set on a now-severed wire is meaningless).
    const wires = {};
    for (const [port, m] of Object.entries(b.wires || {})) {
      if (inputs[port] == null || !m || (!m.color && !(m.points && m.points.length))) continue;
      wires[port] = {
        color: m.color || null,
        points: (m.points || []).map((pt) => ({ x: pt.x, y: pt.y })),
      };
    }
    if (Object.keys(wires).length) out.wires = wires;
    blocks.push(out);
  }
  return { format: CLIP_FORMAT, version: CLIP_VERSION, blocks };
}

function isClip(clip) {
  return !!clip && clip.format === CLIP_FORMAT && Array.isArray(clip.blocks);
}

// Produce paste-ready blocks from a clip: every block gets a fresh uid from
// `allocUid()`, internal references are rewired to the new uids, references to
// blocks not in the clip become null, and positions plus wire corners are
// shifted by (dx, dy). Returns { blocks, newUids, idMap }. Pure: it neither
// reads nor mutates any editor; the caller decides what to do with the blocks.
function remapClip(clip, allocUid, dx = 0, dy = 0) {
  const src = isClip(clip) ? clip.blocks : [];
  const idMap = new Map();
  for (const b of src) {
    if (b && Number.isFinite(b.uid) && !idMap.has(b.uid)) idMap.set(b.uid, allocUid());
  }
  const blocks = [];
  const newUids = [];
  for (const b of src) {
    if (!b || !idMap.has(b.uid)) continue;
    const uid = idMap.get(b.uid);
    const inputs = {};
    for (const [port, ref] of Object.entries(b.inputs || {})) {
      inputs[port] = (ref != null && idMap.has(ref)) ? idMap.get(ref) : null;
    }
    const block = {
      uid,
      type: b.type,
      name: typeof b.name === "string" ? b.name : "",
      x: (Number(b.x) || 0) + dx,
      y: (Number(b.y) || 0) + dy,
      props: { ...(b.props || {}) },
      inputs,
    };
    const wires = {};
    for (const [port, m] of Object.entries(b.wires || {})) {
      if (inputs[port] == null || !m) continue;
      const points = (Array.isArray(m.points) ? m.points : [])
        .map((pt) => ({ x: (Number(pt && pt.x) || 0) + dx, y: (Number(pt && pt.y) || 0) + dy }));
      const color = m.color || null;
      if (color || points.length) wires[port] = { color, points };
    }
    if (Object.keys(wires).length) block.wires = wires;
    blocks.push(block);
    newUids.push(uid);
  }
  return { blocks, newUids, idMap };
}

// Shared clipboard sink. In-memory for the fast path; mirrored to localStorage
// so another editor instance on the page, or another tab/window of the app,
// can read the same clip — the groundwork for copy/paste between editors.
const SimClipboard = {
  _clip: null,
  _stamp: 0,

  // now() is injected-free: we read a monotonic-ish stamp only to break ties
  // between the in-memory clip and a clip written by another window.
  set(clip, now) {
    if (!isClip(clip)) return;
    this._clip = clip;
    this._stamp = now || 0;
    try {
      localStorage.setItem(CLIP_STORAGE_KEY, JSON.stringify({ stamp: this._stamp, clip }));
    } catch (_) { /* storage may be unavailable; in-memory copy still works */ }
  },

  // Return the most recent clip, preferring whichever of the in-memory copy
  // and the stored copy (possibly written by another window) is newer.
  get() {
    let stored = null;
    try {
      const raw = localStorage.getItem(CLIP_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && isClip(parsed.clip)) stored = parsed;
      }
    } catch (_) { /* ignore malformed / unavailable storage */ }
    if (stored && (!this._clip || (stored.stamp || 0) > this._stamp)) {
      this._clip = stored.clip;
      this._stamp = stored.stamp || 0;
    }
    return this._clip;
  },

  has() { return isClip(this.get()); },
};

// Node (test.js) picks these up; the browser leaves module.exports undefined.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildClip, remapClip, isClip, SimClipboard, CLIP_FORMAT, CLIP_VERSION, CLIP_STORAGE_KEY };
}
