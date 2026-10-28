// The yard layout from the original prototype. It is copied into the database
// the first time the app starts; after that the database copy is used.
const range = (a, b, prefix = "") => Array.from({ length: b - a + 1 }, (_, i) => prefix + (a + i));
const rev = (a, b) => range(a, b).reverse();

const door = { kind: "door", defaultStatus: "Loading", noun: "Door ", sh: 100 };

module.exports = [
  { ...door, spots: ["R03"], o: "n", x: 520, y: 6, cols: 1, cw: 56 },
  { ...door, spots: ["R04"], o: "n", x: 1300, y: 6, cols: 1, cw: 56 },
  { ...door, spots: ["301", "302"], o: "n", x: 250, y: 436, cols: 2, cw: 40 },
  { ...door, spots: range(401, 406), o: "e", x: 1420, y: 470, cols: 1, cw: 124, th: 40 },
  { ...door, spots: ["215", "216"], o: "w", x: 66, y: 740, cols: 1, cw: 124, th: 40 },
  { ...door, spots: rev(201, 214), o: "s", x: 230, y: 860, cols: 14, cw: 40 },
  { ...door, spots: ["200"], o: "s", x: 790, y: 860, cols: 1, cw: 56 },
  { ...door, spots: range(101, 110), o: "s", x: 930, y: 710, cols: 10, cw: 40 },
  { ...door, spots: ["R01"], o: "s", x: 1330, y: 710, cols: 1, cw: 56 },
  { title: "Trailer parking", spots: range(1, 24, "P"), kind: "park", defaultStatus: "Loaded",
    noun: "Parking spot ", o: "s", x: 190, y: 1010, cols: 12, cw: 40, sh: 80 },
  { title: "Unassigned trailers", spots: range(1, 27, "U"), kind: "pool", defaultStatus: "Undefined",
    noun: "Unassigned slot ", o: "s", x: 760, y: 1010, cols: 9, cw: 48, sh: 64 },
];
