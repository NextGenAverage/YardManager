// SQLite database: schema, first-run seed data and the yard queries.
//
// Times are stored as milliseconds since 1970 (JavaScript's Date.now()).
// A "visit" is one trailer's stay in the yard: it is created when the trailer
// is first placed and gets departed_at when it leaves. A visit with
// departed_at NULL is a trailer currently in the yard, standing on spot_id.
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const defaultLayout = require("./default-layout");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "yard.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Each entry upgrades the database by one version. Only ever append new
// entries; never edit one that has already been released.
const migrations = [
  `
  CREATE TABLE statuses (
    name  TEXT PRIMARY KEY,
    color TEXT NOT NULL,
    sort  INTEGER NOT NULL
  );
  CREATE TABLE sections (
    id             INTEGER PRIMARY KEY,
    sort           INTEGER NOT NULL,
    title          TEXT,
    kind           TEXT NOT NULL,          -- door | park | pool
    default_status TEXT NOT NULL REFERENCES statuses(name),
    noun           TEXT NOT NULL,          -- "Door ", "Parking spot " ...
    spots          TEXT NOT NULL,          -- JSON array of spot IDs
    geometry       TEXT NOT NULL           -- JSON: o, x, y, cols, cw, sh, th
  );
  CREATE TABLE visits (
    id          INTEGER PRIMARY KEY,
    trailer     TEXT NOT NULL,
    status      TEXT NOT NULL REFERENCES statuses(name),
    note        TEXT NOT NULL DEFAULT '',
    spot_id     TEXT,
    arrived_at  INTEGER NOT NULL,
    departed_at INTEGER
  );
  CREATE UNIQUE INDEX visits_active_spot ON visits(spot_id) WHERE departed_at IS NULL;
  CREATE UNIQUE INDEX visits_active_trailer ON visits(trailer) WHERE departed_at IS NULL;
  `,
];

function migrate() {
  const version = db.pragma("user_version", { simple: true });
  for (let v = version; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

function seed() {
  if (db.prepare("SELECT COUNT(*) n FROM statuses").get().n) return;
  db.transaction(() => {
    const status = db.prepare("INSERT INTO statuses (name, color, sort) VALUES (?, ?, ?)");
    [
      ["Loading", "#f2a516"],
      ["Unloading", "#3b82d9"],
      ["Loaded", "#2fa862"],
      ["Empty", "#8b93a5"],
      ["Undefined", "#e6dcc3"],
    ].forEach(([name, color], i) => status.run(name, color, i));

    const section = db.prepare(`INSERT INTO sections (sort, title, kind, default_status, noun, spots, geometry)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    defaultLayout.forEach((s, i) => {
      const { o, x, y, cols, cw, sh, th } = s;
      section.run(i, s.title || null, s.kind, s.defaultStatus, s.noun,
        JSON.stringify(s.spots), JSON.stringify({ o, x, y, cols, cw, sh, th }));
    });
  })();
}

migrate();
seed();

// ---- Queries ----

function getStatuses() {
  return db.prepare("SELECT name, color FROM statuses ORDER BY sort").all();
}

function getSections() {
  return db.prepare("SELECT * FROM sections ORDER BY sort").all().map((s) => ({
    id: s.id,
    title: s.title,
    kind: s.kind,
    defaultStatus: s.default_status,
    noun: s.noun,
    spots: JSON.parse(s.spots),
    ...JSON.parse(s.geometry),
  }));
}

// Current yard: { spotId: { trailer, status, note, since } }
function getPlacements() {
  const out = {};
  for (const v of db.prepare("SELECT * FROM visits WHERE departed_at IS NULL").all()) {
    out[v.spot_id] = { trailer: v.trailer, status: v.status, note: v.note, since: v.arrived_at };
  }
  return out;
}

function spotExists(spot) {
  return getSections().some((s) => s.spots.includes(spot));
}

function statusExists(name) {
  return !!db.prepare("SELECT 1 FROM statuses WHERE name = ?").get(name);
}

const activeAt = db.prepare("SELECT * FROM visits WHERE departed_at IS NULL AND spot_id = ?");
const activeTrailer = db.prepare("SELECT * FROM visits WHERE departed_at IS NULL AND trailer = ?");
const departStmt = db.prepare("UPDATE visits SET departed_at = ? WHERE id = ?");

// Thrown for requests that can't be done (e.g. the spot was just taken);
// the server turns it into an error message for the user.
class YardError extends Error {}

// Save the trailer on a spot (new trailer, or edit of the one already there).
// If that trailer number is already elsewhere in the yard it is moved here,
// keeping its arrival time, like the prototype did.
const placeTrailer = db.transaction(({ spot, trailer, status, note }) => {
  const now = Date.now();
  const here = activeAt.get(spot);
  const elsewhere = activeTrailer.get(trailer);
  if (elsewhere && (!here || elsewhere.id !== here.id)) {
    if (here) departStmt.run(now, here.id);
    db.prepare("UPDATE visits SET spot_id = ?, status = ?, note = ? WHERE id = ?")
      .run(spot, status, note, elsewhere.id);
  } else if (here) {
    // Same visit: a status/note change or a corrected trailer number.
    db.prepare("UPDATE visits SET trailer = ?, status = ?, note = ? WHERE id = ?")
      .run(trailer, status, note, here.id);
  } else {
    db.prepare("INSERT INTO visits (trailer, status, note, spot_id, arrived_at) VALUES (?, ?, ?, ?, ?)")
      .run(trailer, status, note, spot, now);
  }
});

const moveTrailer = db.transaction(({ from, to }) => {
  const v = activeAt.get(from);
  if (!v) throw new YardError("That trailer has already been moved or removed.");
  if (activeAt.get(to)) throw new YardError("That spot was just taken.");
  db.prepare("UPDATE visits SET spot_id = ? WHERE id = ?").run(to, v.id);
});

const clearSpot = db.transaction((spot) => {
  const v = activeAt.get(spot);
  if (v) departStmt.run(Date.now(), v.id);
});

module.exports = {
  db, YardError,
  getStatuses, getSections, getPlacements, spotExists, statusExists,
  placeTrailer, moveTrailer, clearSpot,
};
