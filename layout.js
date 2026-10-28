// Checks a yard layout sent by the map editor before it is saved.
//
// A layout is { sections: [...], buildings: [...] } in the same shape as
// default-layout.js. checkLayout() returns { layout } (cleaned up) or
// { error } with a message for the admin.

const KINDS = ["door", "park", "pool", "street"];
const DIRECTIONS = ["n", "s", "e", "w"];
const MAX_SPOTS = 1000;

// A whole number between min and max, or null.
function int(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

const text = (value, max) => String(value ?? "").trim().slice(0, max);

// statuses: names that exist. placements: { spotId: { plate } } (trailers in the yard now).
function checkLayout(input, { statuses, placements }) {
  if (!input || !Array.isArray(input.sections) || !Array.isArray(input.buildings)) {
    return { error: "The layout is incomplete." };
  }
  const sections = [], buildings = [], seen = new Map();
  let spotCount = 0;

  for (const [i, s] of input.sections.entries()) {
    const name = `Section ${i + 1}${s.title ? ` (${text(s.title, 40)})` : ""}`;
    const spots = (Array.isArray(s.spots) ? s.spots : []).map((id) => text(id, 10).toUpperCase());
    const clean = {
      title: text(s.title, 40) || null,
      kind: s.kind,
      defaultStatus: s.defaultStatus,
      noun: text(s.noun, 30),
      spots,
      o: s.o,
      x: int(s.x, -50, 6000), y: int(s.y, -50, 6000),
      cols: int(s.cols, 1, 100),
      cw: int(s.cw, 20, 400), sh: int(s.sh, 20, 400), th: int(s.th ?? 40, 20, 200),
    };
    if (!KINDS.includes(clean.kind)) return { error: `${name}: unknown type.` };
    if (!DIRECTIONS.includes(clean.o)) return { error: `${name}: unknown direction.` };
    if (!statuses.includes(clean.defaultStatus)) return { error: `${name}: unknown default status.` };
    if (!clean.noun) return { error: `${name}: the spot name (e.g. "Door ") is missing.` };
    for (const key of ["x", "y", "cols", "cw", "sh", "th"]) {
      if (clean[key] === null) return { error: `${name}: "${key}" is out of range.` };
    }
    if (!spots.length) return { error: `${name} has no spots. Delete it instead.` };
    for (const id of spots) {
      if (!/^[A-Z0-9-]{1,10}$/.test(id)) return { error: `${name}: "${id}" is not a valid spot name (letters, digits, dash).` };
      if (seen.has(id)) return { error: `Spot ${id} is in both ${seen.get(id)} and ${name}.` };
      seen.set(id, name);
    }
    spotCount += spots.length;
    sections.push(clean);
  }
  if (spotCount > MAX_SPOTS) return { error: `Too many spots (${spotCount}, at most ${MAX_SPOTS}).` };

  for (const [i, b] of input.buildings.entries()) {
    const clean = {
      label: text(b.label, 40) || null,
      x: int(b.x, -50, 6000), y: int(b.y, -50, 6000), w: int(b.w, 10, 6000), h: int(b.h, 10, 6000),
    };
    if ([clean.x, clean.y, clean.w, clean.h].includes(null)) return { error: `Building ${i + 1}: position or size out of range.` };
    buildings.push(clean);
  }

  // A spot with a trailer on it can't disappear (or be renamed).
  const stranded = Object.entries(placements).filter(([spot]) => !seen.has(spot));
  if (stranded.length) {
    return {
      error: "These spots have trailers on them and would disappear: "
        + stranded.map(([spot, t]) => `${spot} (${t.plate})`).join(", ")
        + ". Move the trailers first, or keep the spots.",
    };
  }
  return { layout: { sections, buildings } };
}

module.exports = { checkLayout, KINDS, DIRECTIONS };
