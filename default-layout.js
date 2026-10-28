// The starting yard layout, copied into the database the first time the app
// starts; after that the database copy is used (and changed by upgrades in
// db.js or, later, the map editor).
//
// Sections are rows of doors or blocks of parking spots:
//   kind: door | park | pool (Unassigned, shown in the side panel) | street (below the gate)
//   o:    which way trailers point from the building: n, s, e, w (e/w = lying sideways)
//   x, y: position in px on the map (street: within the street strip)
//   cols: spots per row; cw: spot width; sh: stall length; th: spot height when sideways
// Buildings are the grey warehouse blocks: x, y, w, h and an optional label.
const range = (a, b, prefix = "") => Array.from({ length: b - a + 1 }, (_, i) => prefix + (a + i));
const rev = (a, b, prefix = "") => range(a, b, prefix).reverse();

const door = { kind: "door", defaultStatus: "Loading", noun: "Door ", sh: 100 };
const parking = { kind: "park", defaultStatus: "Loaded", noun: "Parking spot " };

const sections = [
  { ...door, spots: ["R03"], o: "n", x: 980, y: 6, cols: 1, cw: 56 },
  { ...door, spots: ["R04"], o: "n", x: 1760, y: 6, cols: 1, cw: 56 },
  { ...door, spots: ["301", "302"], o: "n", x: 710, y: 436, cols: 2, cw: 40 },
  { ...door, spots: range(401, 406), o: "e", x: 1880, y: 470, cols: 1, cw: 124, th: 40 },
  { ...door, spots: ["215", "216"], o: "w", x: 526, y: 740, cols: 1, cw: 124, th: 40 },
  { ...door, spots: rev(201, 214), o: "s", x: 690, y: 860, cols: 14, cw: 40 },
  { ...door, spots: ["200"], o: "s", x: 1250, y: 860, cols: 1, cw: 56 },
  { ...door, spots: range(101, 110), o: "s", x: 1390, y: 710, cols: 10, cw: 40 },
  { ...door, spots: ["R01"], o: "s", x: 1790, y: 710, cols: 1, cw: 56 },
  { ...parking, title: "Trailer parking", spots: range(1, 7, "P"), o: "s", x: 190, y: 1052, cols: 7, cw: 40, sh: 110 },
  // P8-P13: a column of sideways spots left of the building, P8 at the bottom.
  { ...parking, spots: rev(8, 13, "P"), o: "w", x: 30, y: 880, cols: 1, cw: 130, sh: 130, th: 50 },
  // P14-P18: top-left corner.
  { ...parking, spots: range(14, 18, "P"), o: "s", x: 74, y: 30, cols: 5, cw: 48, sh: 110 },
  { title: "Unassigned trailers", spots: range(1, 27, "U"), kind: "pool", defaultStatus: "Undefined",
    noun: "Unassigned slot ", o: "s", x: 760, y: 1010, cols: 9, cw: 48, sh: 96 },
  // Street parking outside the gate: 8 spots along the curb, trailers lying sideways.
  { title: "Street parking", spots: range(1, 8, "S"), kind: "street", defaultStatus: "Undefined",
    noun: "Street spot ", o: "e", x: 10, y: 6, cols: 8, cw: 190, sh: 190, th: 56 },
];

const buildings = [
  { label: "WAREHOUSE", x: 920, y: 130, w: 960, h: 430 },
  { x: 650, y: 560, w: 1230, h: 150 },
  { x: 650, y: 560, w: 700, h: 300 },
];

module.exports = { sections, buildings };
