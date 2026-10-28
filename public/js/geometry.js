// Sizes of layout pieces in px, shared by the map (map.js) and the map editor
// (manage-map.js) so both draw the yard the same size.

// The outer right and bottom edge of a section: title, rows of spots, door strip.
export function sectionBox(s) {
  const rows = Math.ceil(s.spots.length / s.cols);
  const sideways = s.o === "e" || s.o === "w";
  const rowHeight = sideways ? s.th || 40 : s.sh + (s.kind === "door" ? 28 : 0);
  return { right: s.x + s.cols * s.cw + 6, bottom: s.y + (s.title ? 18 : 0) + rows * rowHeight + 6 };
}

// Empty space kept to the right of the rightmost doors, so they don't end at the
// edge of the map.
const RIGHT_MARGIN = 100;

// How big the map and the street strip must be to hold everything.
// Unassigned ("pool") sections are shown elsewhere and don't count.
export function layoutSize(sections, buildings) {
  let right = 0, bottom = 0, streetRight = 0, streetBottom = 0;
  for (const s of sections) {
    if (s.kind === "pool") continue;
    const box = sectionBox(s);
    if (s.kind === "street") {
      streetRight = Math.max(streetRight, box.right);
      streetBottom = Math.max(streetBottom, box.bottom);
    } else {
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }
  }
  for (const b of buildings) {
    right = Math.max(right, b.x + b.w);
    bottom = Math.max(bottom, b.y + b.h);
  }
  return {
    width: Math.max(800, right + RIGHT_MARGIN, streetRight + 20),
    height: Math.max(600, bottom + 20),
    streetHeight: streetBottom ? streetBottom + 10 : 0,
  };
}
