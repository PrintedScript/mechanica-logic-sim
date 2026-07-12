// blocks.js — block type registry for the Mechanica logic system.
// Semantics follow README.md: all data is numbers; truish = value > 0.5;
// boolean blocks output exactly 1 or 0; "nothing" is represented as null.

"use strict";

const truish = (v) => typeof v === "number" && v > 0.5;
const num = (v) => (typeof v === "number" && isFinite(v) ? v : (v === Infinity || v === -Infinity ? v : 0));

// The game only accepts number properties in steps of 0.005 — typed values
// snap to the nearest step (1.023 -> 1.025).
const NUMBER_STEP = 0.005;
function snapNumber(v) {
  v = Number(v);
  if (!isFinite(v)) return 0;
  return Math.round(v * 200) / 200; // 1 / 0.005 = 200, avoids float dust
}

// ins[port] === undefined  -> port not connected
// ins[port] === null       -> connected, upstream outputs "nothing"
// otherwise a number.
const inN = (ins, port) => {
  const v = ins[port];
  return typeof v === "number" ? v : 0;
};

const bool2 = (fn) => (ins) => (fn(truish(ins["Input 1"]), truish(ins["Input 2"])) ? 1 : 0);

const BLOCK_TYPES = {
  // ---------------- Boolean logic ----------------
  31: {
    name: "Toggle Gate", cat: "Boolean", kind: "toggle",
    inputs: ["Activate"], hasOutput: true,
    props: [],
    initState: () => ({ state: false }),
  },
  32: { name: "AND Gate",  cat: "Boolean", kind: "pure", inputs: ["Input 1", "Input 2"], hasOutput: true, props: [], compute: bool2((a, b) => a && b) },
  33: { name: "OR Gate",   cat: "Boolean", kind: "pure", inputs: ["Input 1", "Input 2"], hasOutput: true, props: [], compute: bool2((a, b) => a || b) },
  34: { name: "NOT Gate",  cat: "Boolean", kind: "pure", inputs: ["Input"], hasOutput: true, props: [], compute: (ins) => (truish(ins["Input"]) ? 0 : 1) },
  35: { name: "NAND Gate", cat: "Boolean", kind: "pure", inputs: ["Input 1", "Input 2"], hasOutput: true, props: [], compute: bool2((a, b) => !(a && b)) },
  36: { name: "NOR Gate",  cat: "Boolean", kind: "pure", inputs: ["Input 1", "Input 2"], hasOutput: true, props: [], compute: bool2((a, b) => !(a || b)) },
  37: { name: "XOR Gate",  cat: "Boolean", kind: "pure", inputs: ["Input 1", "Input 2"], hasOutput: true, props: [], compute: bool2((a, b) => a !== b) },
  38: { name: "XNOR Gate", cat: "Boolean", kind: "pure", inputs: ["Input 1", "Input 2"], hasOutput: true, props: [], compute: bool2((a, b) => a === b) },

  // ---------------- Number logic ----------------
  45: {
    name: "Delay Gate", cat: "Number", kind: "delay",
    inputs: ["Activate"], hasOutput: true,
    props: [{ key: "delay", label: "Delay (s)", type: "number", min: 0, max: 600, step: NUMBER_STEP, default: 1 }],
  },
  49: {
    name: "Memory Gate", cat: "Number", kind: "memory",
    inputs: ["Set", "Data"], hasOutput: true,
    props: [{ key: "onlyUpdateWithSet", label: "Only Update With Set", type: "bool", default: false }],
    initState: () => ({ mem: 0 }),
  },
  76: {
    name: "Relay Gate", cat: "Number", kind: "pure",
    inputs: ["Relay", "Data 0", "Data 1"], hasOutput: true,
    props: [],
    // If the selected data port has no valid object connected, output "nothing" (null).
    compute: (ins) => {
      const port = truish(ins["Relay"]) ? "Data 1" : "Data 0";
      const v = ins[port];
      if (v === undefined) return null;      // not connected -> nothing
      return v;                              // relays numbers and "nothing" alike
    },
  },
  82: {
    name: "Constant Gate", cat: "Number", kind: "const",
    inputs: [], hasOutput: true,
    props: [{ key: "value", label: "Output Value", type: "number", min: -10000000, max: 10000000, step: NUMBER_STEP, default: 0 }],
  },
  83: { name: "Addition Gate",    cat: "Number", kind: "pure", inputs: ["Input 1", "Input 2"], hasOutput: true, props: [], compute: (ins) => inN(ins, "Input 1") + inN(ins, "Input 2") },
  84: { name: "Subtraction Gate", cat: "Number", kind: "pure", inputs: ["Input 1", "Input 2"], hasOutput: true, props: [], compute: (ins) => inN(ins, "Input 1") - inN(ins, "Input 2") },
  85: { name: "Multiply Gate",    cat: "Number", kind: "pure", inputs: ["Input 1", "Input 2"], hasOutput: true, props: [], compute: (ins) => inN(ins, "Input 1") * inN(ins, "Input 2") },
  86: { name: "Divide Gate",      cat: "Number", kind: "pure", inputs: ["Input 1", "Input 2"], hasOutput: true, props: [], compute: (ins) => inN(ins, "Input 1") / inN(ins, "Input 2") },
  87: {
    name: "Round Gate", cat: "Number", kind: "pure",
    inputs: ["Input"], hasOutput: true,
    props: [{ key: "roundingMode", label: "Rounding Mode", type: "select", options: ["Round", "Ceil", "Floor"], default: "Round" }],
    compute: (ins, props) => {
      const v = inN(ins, "Input");
      if (props.roundingMode === "Ceil") return Math.ceil(v);
      if (props.roundingMode === "Floor") return Math.floor(v);
      return Math.floor(v + 0.5); // Lua-style round-half-up, matches Roblox convention
    },
  },
  88: {
    name: "Compare Gate", cat: "Number", kind: "pure",
    inputs: ["Input 1", "Input 2"], hasOutput: true,
    props: [{ key: "compareMode", label: "Compare Mode", type: "select", options: ["EqualTo", "GreaterThan", "LessThan"], default: "EqualTo" }],
    compute: (ins, props) => {
      const a = inN(ins, "Input 1"), b = inN(ins, "Input 2");
      const r = props.compareMode === "GreaterThan" ? a > b
              : props.compareMode === "LessThan"    ? a < b
              : a === b;
      return r ? 1 : 0;
    },
  },

  // ---------------- Input ----------------
  14: {
    name: "Key Detector", cat: "Input", kind: "key",
    inputs: [], hasOutput: true,
    props: [{ key: "key", label: "Activation Key", type: "key", default: "E" }],
  },
  21: {
    name: "Sensor", cat: "Input", kind: "sensor",
    inputs: [], hasOutput: true,
    props: [
      { key: "range", label: "Range (studs)", type: "number", min: 0, max: 500, step: 1, default: 20 },
      { key: "distanceMode", label: "Distance Mode", type: "bool", default: false },
      { key: "ignoreWater", label: "Ignore Water", type: "bool", default: false },
      // Simulation-only stand-ins for the 3D world:
      { key: "simDetected", label: "Object in range", type: "bool", default: false, sim: true },
      { key: "simDistance", label: "Object distance", type: "range", min: 0, max: 500, step: 1, default: 10, sim: true },
    ],
  },
  44: {
    name: "Wireless Transceiver", cat: "Input", kind: "wireless",
    inputs: ["Send Signal"], hasOutput: true,
    props: [{ key: "channel", label: "Channel", type: "number", min: -4000, max: 4000, step: 1, default: 0 }],
  },
  61: {
    name: "Push Button", cat: "Input", kind: "button",
    inputs: [], hasOutput: true,
    // Normal mode: 1 while held, 0 when released. Toggle mode: like a push
    // button wired to a toggle gate — flips state on each press-down.
    props: [{ key: "toggle", label: "Toggle", type: "bool", default: false }],
    initState: () => ({ pressed: false, applied: false, state: false }),
  },

  // ---------------- Misc (displays, no output) ----------------
  47: {
    name: "Flat Light Panel", cat: "Misc", kind: "display",
    hasOutput: false,
    inputs: (props) => (props.inputMode === "RGB" ? ["Red", "Green", "Blue"] : ["Activate"]),
    props: [
      { key: "inputMode", label: "Input Mode", type: "select", options: ["Brightness", "RGB"], default: "Brightness" },
      { key: "lightColor", label: "Light Color", type: "color", default: "#ffffff" },
    ],
  },
  89: {
    name: "Number Display", cat: "Misc", kind: "display",
    hasOutput: false,
    inputs: ["Input"],
    props: [
      { key: "textColor", label: "Text Color", type: "color", default: "#ffffff" },
      { key: "bgColor", label: "Background Color", type: "color", default: "#1a1a1a" },
    ],
  },
  // Simulator-only helper, not a game block (no game type id): a sticky note
  // for documenting builds. Ignored by the engine.
  999: {
    name: "Note", cat: "Misc", kind: "note", virtual: true,
    inputs: [], hasOutput: false,
    props: [{ key: "text", label: "Text", type: "textarea", default: "" }],
  },
};

const BLOCK_ORDER = {
  "Boolean": [31, 32, 33, 34, 35, 36, 37, 38],
  "Number": [45, 49, 76, 82, 83, 84, 85, 86, 87, 88],
  "Input": [14, 21, 44, 61],
  "Misc": [47, 89, 999],
};

function blockInputs(block) {
  const def = BLOCK_TYPES[block.type];
  return typeof def.inputs === "function" ? def.inputs(block.props) : def.inputs;
}

function defaultProps(type) {
  const props = {};
  for (const p of BLOCK_TYPES[type].props) props[p.key] = p.default;
  return props;
}

function formatValue(v) {
  if (v === null || v === undefined) return "nothing";
  if (!isFinite(v)) return v > 0 ? "inf" : (v < 0 ? "-inf" : "nan");
  if (Number.isNaN(v)) return "nan";
  return String(Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : +v.toFixed(4));
}
