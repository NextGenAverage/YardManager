// The starting yard layout, copied into the database the first time the app
// starts; after that the database copy is used (and changed by upgrades in
// db.js or, later, the map editor).
//
// Sections are rows of doors or blocks of parking spots:
//   kind: door | park | pool (Unassigned, shown in the side panel) | street (outside the fence)
//   o:    which way trailers point from the building: n, s, e, w (e/w = lying sideways)
//   x, y: position in px on the map (street: within the street strip)
//   cols: spots per row; cw: spot width; sh: stall length; th: spot height when sideways
// Buildings are the grey warehouse blocks: x, y, w, h and an optional label.
const range = (a, b, prefix = "") => Array.from({ length: b - a + 1 }, (_, i) => prefix + (a + i));
const rev = (a, b, prefix = "") => range(a, b, prefix).reverse();

const door = { kind: "door", defaultStatus: "Loading", noun: "Door ", sh: 100 };
const parking = { kind: "park", defaultStatus: "Loaded", noun: "Parking spot " };

const sections = [
  { ...door, spots: ["R03"], o: "n", x: 870, y: 6, cols: 1, cw: 56 },
  { ...door, spots: ["R04"], o: "n", x: 1650, y: 6, cols: 1, cw: 56 },
  { ...door, spots: ["301", "302"], o: "n", x: 600, y: 311, cols: 2, cw: 40 },
  { ...door, spots: range(401, 406), o: "e", x: 1770, y: 345, cols: 1, cw: 124, th: 40 },
  { ...door, spots: ["215", "216"], o: "w", x: 416, y: 615, cols: 1, cw: 124, th: 40 },
  { ...door, spots: rev(201, 214), o: "s", x: 580, y: 735, cols: 14, cw: 40 },
  { ...door, spots: ["200"], o: "s", x: 1140, y: 735, cols: 1, cw: 56 },
  { ...door, spots: rev(101, 110), o: "s", x: 1280, y: 585, cols: 10, cw: 40 },
  { ...door, spots: ["R01"], o: "s", x: 1680, y: 585, cols: 1, cw: 56 },
  { ...parking, title: "Trailer parking", spots: range(1, 7, "P"), o: "s", x: 208, y: 965, cols: 7, cw: 40, sh: 110 },
  // P8-P13: a column of sideways spots left of the building, P8 at the bottom.
  { ...parking, spots: rev(8, 13, "P"), o: "w", x: 52, y: 795, cols: 1, cw: 130, sh: 130, th: 50 },
  // P14-P18: left of the warehouse, near the top.
  { ...parking, spots: range(14, 18, "P"), o: "s", x: 530, y: 140, cols: 5, cw: 48, sh: 110 },
  { title: "Delayed trailers", spots: range(1, 20, "U"), kind: "pool", defaultStatus: "Delayed",
    noun: "Delayed slot ", o: "s", x: 760, y: 1010, cols: 9, cw: 48, sh: 96 },
  // Street parking outside the fence: 8 spots along the curb, trailers lying sideways.
  { title: "Street parking", spots: range(1, 8, "S"), kind: "street", defaultStatus: "Undefined",
    noun: "Street spot ", o: "e", x: 10, y: 6, cols: 8, cw: 190, sh: 190, th: 56 },
];

const buildings = [
  { label: "WAREHOUSE", x: 810, y: 130, w: 960, h: 305 },
  { x: 540, y: 435, w: 1230, h: 150 },
  { x: 540, y: 435, w: 700, h: 300 },
];

module.exports = { sections, buildings };
