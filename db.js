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
  `
  ALTER TABLE visits ADD COLUMN damaged INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX visits_trailer ON visits(trailer);
  -- History: one row per change. Spot and trailer are copied in as text so
  -- the history still reads correctly after visits or spots are removed.
  CREATE TABLE events (
    id        INTEGER PRIMARY KEY,
    at        INTEGER NOT NULL,
    user_name TEXT,
    action    TEXT NOT NULL,      -- arrive | move | edit | depart | remove
    visit_id  INTEGER,
    trailer   TEXT NOT NULL,
    from_spot TEXT,
    to_spot   TEXT,
    details   TEXT                -- JSON, e.g. {"status":["Loading","Loaded"]}
  );
  CREATE INDEX events_at ON events(at);
  CREATE INDEX events_trailer ON events(trailer);
  CREATE INDEX events_from ON events(from_spot);
  CREATE INDEX events_to ON events(to_spot);
  `,
  `
  -- Taller parking and unassigned spots so trailer numbers are readable.
  UPDATE sections SET geometry = json_set(geometry, '$.sh', 110) WHERE kind = 'park' AND json_extract(geometry, '$.sh') = 80;
  UPDATE sections SET geometry = json_set(geometry, '$.sh', 96) WHERE kind = 'pool' AND json_extract(geometry, '$.sh') = 64;
  `,
  `
  CREATE TABLE users (
    id              INTEGER PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name            TEXT NOT NULL,              -- shown in the header and history
    role            TEXT NOT NULL,              -- viewer | worker | operator | admin
    password_hash   TEXT NOT NULL,
    must_change_pw  INTEGER NOT NULL DEFAULT 1, -- 1 after an admin set a temporary password
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL,
    last_login_at   INTEGER
  );
  -- Logged-in browsers. Only a hash of the cookie value is stored.
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
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

// Current yard: { spotId: { trailer, status, note, damaged, since } }
function getPlacements() {
  const out = {};
  for (const v of db.prepare("SELECT * FROM visits WHERE departed_at IS NULL").all()) {
    out[v.spot_id] = { trailer: v.trailer, status: v.status, note: v.note, damaged: !!v.damaged, since: v.arrived_at };
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
const setSpot = db.prepare("UPDATE visits SET spot_id = ? WHERE id = ?");
const setDeparted = db.prepare("UPDATE visits SET departed_at = ? WHERE id = ?");
const insertEvent = db.prepare(`INSERT INTO events (at, user_name, action, visit_id, trailer, from_spot, to_spot, details)
  VALUES (@at, @by, @action, @visit_id, @trailer, @from, @to, @details)`);

function log(action, v, { by, from = null, to = null, details = null }) {
  insertEvent.run({ at: Date.now(), by: by || null, action, visit_id: v.id, trailer: v.trailer,
    from, to, details: details && JSON.stringify(details) });
}

// Compare a visit with new values; returns { field: [old, new] } or null if nothing changed.
function changes(v, next) {
  const out = {};
  for (const k of Object.keys(next)) if (next[k] !== undefined && next[k] !== v[k]) out[k] = [v[k], next[k]];
  return Object.keys(out).length ? out : null;
}

// Thrown for requests that can't be done (e.g. the spot was just taken);
// the server turns it into an error message for the user.
class YardError extends Error {}
const GONE = "That trailer has already been moved or removed.";

// Save the trailer on a spot (new trailer, or edit of the one already there).
// If that trailer number is already elsewhere in the yard it is moved here,
// keeping its arrival time, and any other trailer on this spot departs.
const placeTrailer = db.transaction(({ spot, trailer, status, note, damaged, arrivedAt, by }) => {
  const here = activeAt.get(spot);
  let v = activeTrailer.get(trailer);
  if (v && here && v.id !== here.id) departVisit(here, by);
  if (v && v.spot_id !== spot) {
    setSpot.run(spot, v.id);
    log("move", v, { by, from: v.spot_id, to: spot });
  }
  v = v || here;
  if (!v) {
    const { lastInsertRowid } = db.prepare(`INSERT INTO visits (trailer, status, note, damaged, spot_id, arrived_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(trailer, status, note, +damaged, spot, arrivedAt || Date.now());
    log("arrive", { id: lastInsertRowid, trailer }, { by, to: spot, details: { status, note, damaged } });
    return;
  }
  // Same visit: status/note/damaged change, corrected number or arrival time.
  const diff = changes(v, { trailer, status, note, damaged: +damaged, arrived_at: arrivedAt });
  if (!diff) return;
  db.prepare("UPDATE visits SET trailer = ?, status = ?, note = ?, damaged = ?, arrived_at = ? WHERE id = ?")
    .run(trailer, status, note, +damaged, arrivedAt || v.arrived_at, v.id);
  log("edit", { id: v.id, trailer }, { by, to: spot, details: diff });
});

const moveTrailer = db.transaction(({ from, to, by }) => {
  const v = activeAt.get(from);
  if (!v) throw new YardError(GONE);
  if (activeAt.get(to)) throw new YardError("That spot was just taken.");
  setSpot.run(to, v.id);
  log("move", v, { by, from, to });
});

function departVisit(v, by) {
  setDeparted.run(Date.now(), v.id);
  log("depart", v, { by, from: v.spot_id });
}

const departTrailer = db.transaction(({ spot, by }) => {
  const v = activeAt.get(spot);
  if (!v) throw new YardError(GONE);
  departVisit(v, by);
});

// For trailers entered by mistake: the visit is deleted, the history keeps a note of it.
const removeTrailer = db.transaction(({ spot, by }) => {
  const v = activeAt.get(spot);
  if (!v) throw new YardError(GONE);
  db.prepare("DELETE FROM visits WHERE id = ?").run(v.id);
  log("remove", v, { by, from: spot, details: { status: v.status, note: v.note, arrived_at: v.arrived_at } });
});

// Correct the arrival/departure time of a visit (e.g. one that has already left).
const correctTimes = db.transaction(({ id, arrivedAt, departedAt, by }) => {
  const v = db.prepare("SELECT * FROM visits WHERE id = ?").get(id);
  if (!v) throw new YardError("That visit no longer exists.");
  if (departedAt !== undefined && v.departed_at === null) throw new YardError("This trailer hasn't departed yet.");
  const arr = arrivedAt ?? v.arrived_at, dep = departedAt ?? v.departed_at;
  if (dep !== null && dep < arr) throw new YardError("Departure can't be before arrival.");
  const diff = changes(v, { arrived_at: arrivedAt, departed_at: departedAt });
  if (!diff) return;
  db.prepare("UPDATE visits SET arrived_at = ?, departed_at = ? WHERE id = ?").run(arr, dep, id);
  log("edit", v, { by, from: v.spot_id, details: diff });
});

// History for one trailer (its visits and events), one spot, or the whole yard.
function getHistory({ trailer, spot, limit = 200 }) {
  const ev = (where, ...args) => db.prepare(`SELECT * FROM events ${where} ORDER BY at DESC, id DESC LIMIT ${limit}`)
    .all(...args).map((e) => ({ ...e, details: e.details && JSON.parse(e.details) }));
  if (trailer) {
    return {
      visits: db.prepare("SELECT * FROM visits WHERE trailer = ? ORDER BY arrived_at DESC LIMIT 50").all(trailer),
      events: ev("WHERE trailer = ?", trailer),
    };
  }
  if (spot) return { events: ev("WHERE from_spot = ? OR to_spot = ?", spot, spot) };
  return { events: ev("") };
}

module.exports = {
  db, YardError,
  getStatuses, getSections, getPlacements, spotExists, statusExists, getHistory,
  placeTrailer, moveTrailer, departTrailer, removeTrailer, correctTimes,
};
