// Yard Manager web server: serves the pages and the shared yard API.
const path = require("path");
const express = require("express");
const yard = require("./db");
const auth = require("./auth");
const authRoutes = require("./auth-routes");
const { readTrailerCsv, normalizePlate, cleanTrailerId } = require("./csv-import");
const { checkLayout } = require("./layout");
const { readArrivals } = require("./incoming-import");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "public");

const app = express();
app.set("trust proxy", "loopback"); // correct client address and https when behind a local reverse proxy
// Read JSON request bodies. The CSV import and layout routes read their own, larger ones.
const smallJson = express.json({ limit: "200kb" });
const ownBodyParser = ["/api/trailers/import", "/api/layout", "/api/incoming/import"];
app.use((req, res, next) => (ownBodyParser.includes(req.path) ? next() : smallJson(req, res, next)));
app.use(auth.loadUser);

// Changes must be sent as JSON. Browsers can't send JSON to another site
// without its permission, so other web pages can't act as a logged-in user.
app.use("/api", (req, res, next) => {
  if (req.method === "POST" && !req.is("application/json")) return res.status(415).json({ error: "Send JSON." });
  next();
});

// Pages that need a login send you to the login page first.
function page(file) {
  return (req, res) => {
    if (!req.user || req.user.must_change_pw) return res.redirect("/login.html");
    res.sendFile(path.join(PUBLIC, file));
  };
}
app.get(["/", "/index.html"], page("index.html"));
app.get("/manage.html", page("manage.html"));
app.get("/users.html", (_req, res) => res.redirect("/manage.html#users")); // old address
app.use(express.static(PUBLIC, { index: false }));

function state() {
  return {
    statuses: yard.getStatuses(),
    sections: yard.getSections(),
    buildings: yard.getBuildings(),
    placements: yard.getPlacements(),
    carriers: yard.getCarriers(),
    incoming: yard.getIncoming(),
  };
}

// Input checks shared by the endpoints. Each returns an error message or null.
const clean = (v, max) => String(v ?? "").trim().slice(0, max);
function checkSpot(spot) {
  return yard.spotExists(spot) ? null : "Unknown spot.";
}
// Times arrive as milliseconds; missing means "don't change".
const time = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));
// Planned times may be in the future (up to 60 days ahead).
function checkPlannedTime(t) {
  if (t === undefined || t === null) return null;
  const now = Date.now();
  return Number.isFinite(t) && t > now - 400 * 864e5 && t < now + 60 * 864e5 ? null : "That planned time isn't valid.";
}
function checkTime(t) {
  if (t === undefined) return null;
  const now = Date.now();
  return Number.isFinite(t) && t > now - 400 * 864e5 && t < now + 10 * 60e3 ? null : "That time isn't valid (it can't be in the future).";
}

// Live updates (Server-Sent Events): every open map keeps /api/events open
// and gets the whole yard state again each time something changes.
const listeners = new Map(); // response -> user id
const event = (s = state()) => `data: ${JSON.stringify(s)}\n\n`;

app.get("/api/events", auth.requireRole("viewer"), (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 3000\n" + event()); // browsers reconnect after 3 s if the line drops
  listeners.set(res, req.user.id);
  req.on("close", () => listeners.delete(res));
});

// Close a user's live connections, e.g. after they were logged out by an admin.
// Their browser then reconnects, gets "please log in" and goes to the login page.
function disconnect(userId) {
  for (const [res, id] of listeners) if (id === userId) res.end();
}

// A comment line every 25 s stops proxies and firewalls closing idle connections.
setInterval(() => {
  for (const res of listeners.keys()) res.write(": ping\n\n");
}, 25000);

// Reply to the request that changed the yard, and tell everyone else.
function changed(res) {
  const s = state();
  const msg = event(s);
  for (const l of listeners.keys()) l.write(msg);
  res.json(s);
}

app.use(authRoutes({ disconnect }));

const viewer = auth.requireRole("viewer");
const worker = auth.requireRole("worker");
const operator = auth.requireRole("operator");

// The logged-in user's name, recorded in the history.
const who = (req) => req.user.name;

app.get("/api/yard", viewer, (_req, res) => res.json(state()));

// Add a trailer or edit the one on a spot. Workers may only change status,
// note and damaged of the trailer already there.
app.post("/api/place", worker, (req, res) => {
  const spot = clean(req.body.spot, 20);
  const plate = normalizePlate(req.body.plate);
  const trailerId = clean(req.body.trailerId, 60);
  const carrier = clean(req.body.carrier, 10) || null;
  const status = clean(req.body.status, 40);
  const note = clean(req.body.note, 200);
  const arrivedAt = time(req.body.arrivedAt);
  // Planned departure: a time, null to clear it, or left out for no change.
  const expectedDeparture = req.body.expectedDeparture === null ? null : time(req.body.expectedDeparture);
  const err = checkSpot(spot)
    || (!plate && "Reg. number (licence plate) is required.")
    || (!yard.statusExists(status) && "Unknown status.")
    || checkTime(arrivedAt)
    || checkPlannedTime(expectedDeparture);
  if (err) return res.status(400).json({ error: err });
  if (auth.atLeast(req.user.role, "operator") && !trailerId && !yard.getTrailer(plate)) {
    return res.status(400).json({ error: "Trailer ID is required for a new reg. number." });
  }
  if (!auth.atLeast(req.user.role, "operator")) {
    const here = yard.getPlacements()[spot];
    if (!here || here.plate !== plate || here.trailerId !== trailerId || arrivedAt !== undefined || expectedDeparture !== undefined) {
      return res.status(403).json({ error: "Workers can change status, note and damaged only. Ask an operator for other changes." });
    }
  }
  yard.placeTrailer({
    spot, plate, trailerId, carrier, status, note, damaged: !!req.body.damaged, arrivedAt, expectedDeparture, by: who(req),
  });
  changed(res);
});

app.post("/api/move", operator, (req, res) => {
  const from = clean(req.body.from, 20);
  const to = clean(req.body.to, 20);
  const err = checkSpot(from) || checkSpot(to);
  if (err) return res.status(400).json({ error: err });
  yard.moveTrailer({ from, to, by: who(req) });
  changed(res);
});

// The trailer has left the yard.
app.post("/api/depart", operator, (req, res) => {
  const spot = clean(req.body.spot, 20);
  const err = checkSpot(spot);
  if (err) return res.status(400).json({ error: err });
  yard.departTrailer({ spot, by: who(req) });
  changed(res);
});

// The trailer was entered by mistake.
app.post("/api/remove", operator, (req, res) => {
  const spot = clean(req.body.spot, 20);
  const err = checkSpot(spot);
  if (err) return res.status(400).json({ error: err });
  yard.removeTrailer({ spot, by: who(req) });
  changed(res);
});

app.post("/api/visit-times", operator, (req, res) => {
  const id = Number(req.body.id);
  const arrivedAt = time(req.body.arrivedAt);
  const departedAt = time(req.body.departedAt);
  const err = (!Number.isInteger(id) && "Unknown visit.") || checkTime(arrivedAt) || checkTime(departedAt);
  if (err) return res.status(400).json({ error: err });
  yard.correctTimes({ id, arrivedAt, departedAt, by: who(req) });
  changed(res);
});

// ---- Trailer register (reg. number -> trailer ID + carrier) ----

// Look up one reg. number, e.g. to fill in the trailer ID while typing.
app.get("/api/trailers/:plate", viewer, (req, res) => {
  res.json({ trailer: yard.getTrailer(normalizePlate(req.params.plate)) });
});

// Manage page: search the register.
app.get("/api/trailers", operator, (req, res) => {
  res.json(yard.listTrailers(clean(req.query.q, 60)));
});

// Manage page: add a link or change one.
app.post("/api/trailers", operator, (req, res) => {
  const plate = normalizePlate(req.body.plate);
  const trailerId = clean(req.body.trailerId, 60);
  const carrier = clean(req.body.carrier, 10) || null;
  if (!plate || !trailerId) return res.status(400).json({ error: "Reg. number and trailer ID are required." });
  yard.linkTrailer({ plate, trailerId, carrier, by: who(req) });
  changed(res); // the trailer ID or carrier of a trailer in the yard may have changed
});

app.post("/api/trailers/delete", operator, (req, res) => {
  yard.unlinkTrailer({ plate: normalizePlate(req.body.plate), by: who(req) });
  changed(res);
});

// CSV import. First called with apply: false to preview what would change,
// then with apply: true to save. Lines with errors are skipped.
// Conflicts (a reg. number listed with different details) are decided by the
// user in the preview: resolutions = { PLATE: { trailerId, carrier } } for the
// ones to import; conflicts not in it are skipped.
app.post("/api/trailers/import", express.json({ limit: "10mb" }), operator, (req, res) => {
  const { rows, conflicts, errors, warnings, skipped } = readTrailerCsv(String(req.body.csv ?? ""), yard.getCarriers());
  const chosen = req.body.apply ? req.body.resolutions || {} : {};
  const resolved = [];
  for (const c of conflicts) {
    const pick = chosen[c.plate];
    if (!pick) continue;
    const trailerId = cleanTrailerId(pick.trailerId);
    const carrier = clean(pick.carrier, 10) || null;
    if (!trailerId) return res.status(400).json({ error: `${c.plate}: trailer ID is required.` });
    if (carrier && !yard.carrierExists(carrier)) return res.status(400).json({ error: `${c.plate}: unknown carrier ${carrier}.` });
    resolved.push({ plate: c.plate, trailerId, carrier });
  }

  const added = [], changes = [];
  let unchanged = 0;
  for (const r of [...rows, ...resolved]) {
    const old = yard.getTrailer(r.plate);
    if (!old) added.push(r);
    else if (old.trailerId !== r.trailerId || old.carrier !== r.carrier) {
      changes.push({ ...r, oldTrailerId: old.trailerId, oldCarrier: old.carrier });
    } else unchanged++;
  }
  const summary = {
    added: added.length, changed: changes.length, unchanged, skipped,
    conflicts: conflicts.length, conflictsResolved: resolved.length,
  };
  if (!req.body.apply) {
    // With the trailer currently in the register, so the user sees what a choice replaces.
    const withRegister = conflicts.slice(0, 500).map((c) => ({ ...c, register: yard.getTrailer(c.plate) }));
    return res.json({ summary, examples: { added: added.slice(0, 20), changes: changes.slice(0, 50) }, conflicts: withRegister, errors, warnings });
  }
  yard.importTrailers([...added, ...changes].map(({ plate, trailerId, carrier }) => ({ plate, trailerId, carrier })), who(req));
  const s = state();
  for (const l of listeners.keys()) l.write(event(s));
  res.json({ summary, errors, warnings });
});

// ---- Incoming: trailers expected to arrive (operators change, everyone sees) ----

app.post("/api/incoming", operator, (req, res) => {
  const plate = normalizePlate(req.body.plate);
  const expectedAt = time(req.body.expectedAt);
  const err = (!plate && "Reg. number is required.")
    || (expectedAt === undefined && "Expected time is required.")
    || checkPlannedTime(expectedAt);
  if (err) return res.status(400).json({ error: err });
  yard.saveIncoming({
    plate, expectedAt,
    trailerId: clean(req.body.trailerId, 60),
    carrier: clean(req.body.carrier, 10) || null,
    note: clean(req.body.note, 200),
    by: who(req),
  });
  changed(res);
});

app.post("/api/incoming/delete", operator, (req, res) => {
  yard.deleteIncoming(Number(req.body.id));
  changed(res);
});

// Import expected arrivals from an Excel (.xlsx) or CSV file (sent as base64).
// First with apply: false to preview, then apply: true to save. columns: the
// user's choice of which column holds what ({ field: column name or null });
// left out, the choice saved last time (or a guess) is used. Only adds and
// updates; trailers already in the yard are skipped.
app.post("/api/incoming/import", express.json({ limit: "15mb" }), operator, (req, res) => {
  let result;
  try {
    result = readArrivals(Buffer.from(String(req.body.file ?? ""), "base64"), {
      saved: req.body.columns || yard.getSetting("incomingColumns") || {},
      carriers: yard.getCarriers(),
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Couldn't read the file." });
  }
  const { header, columns, rows, errors, warnings } = result;
  const existing = new Map(yard.getIncoming().map((e) => [e.plate, e]));
  const changes = [], preview = [];
  let skipped = errors.length, unchanged = 0;
  for (const r of rows) {
    // The register knows the trailer ID and carrier of a known reg. number best.
    const link = yard.getTrailer(r.plate);
    if (link) Object.assign(r, { trailerId: link.trailerId, carrier: link.carrier });
    const old = existing.get(r.plate);
    let action;
    if (yard.inYard(r.plate)) { action = "in yard"; skipped++; }
    else if (!old) action = "new";
    else if (old.expectedAt !== r.expectedAt || (r.trailerId && old.trailerId !== r.trailerId)
      || (r.carrier && old.carrier !== r.carrier) || (r.note && old.note !== r.note)) action = "update";
    else { action = "same"; unchanged++; }
    if (action === "new" || action === "update") changes.push(r);
    preview.push({ ...r, action, oldExpectedAt: old?.expectedAt ?? null });
  }
  const summary = {
    added: preview.filter((p) => p.action === "new").length,
    updated: preview.filter((p) => p.action === "update").length,
    unchanged, skipped,
  };
  // Columns by name, as saved: { field: "ETA" } or null for "not used".
  const columnNames = Object.fromEntries(Object.entries(columns).map(([f, i]) => [f, i >= 0 ? header[i] : null]));
  if (!req.body.apply) {
    return res.json({ header, columns: columnNames, summary, rows: preview.slice(0, 200), errors, warnings });
  }
  if (!rows.length) return res.status(400).json({ error: errors[0] || "Nothing to import." });
  yard.setSetting("incomingColumns", columnNames);
  yard.importIncoming(changes, who(req));
  const s = state();
  for (const l of listeners.keys()) l.write(event(s));
  res.json({ summary, errors, warnings });
});

// ---- Map editor (admins) ----

const admin = auth.requireRole("admin");

// The layout to edit, plus what the editor needs to show: statuses, and which
// spots have trailers (those can't be removed).
app.get("/api/layout", admin, (_req, res) => {
  const occupied = Object.fromEntries(Object.entries(yard.getPlacements()).map(([spot, t]) => [spot, t.plate]));
  res.json({ ...yard.getLayout(), statuses: yard.getStatuses().map((s) => s.name), occupied });
});

app.post("/api/layout", express.json({ limit: "1mb" }), admin, (req, res) => {
  const { layout, error } = checkLayout(req.body, {
    statuses: yard.getStatuses().map((s) => s.name),
    placements: yard.getPlacements(),
  });
  if (error) return res.status(400).json({ error });
  yard.saveLayout(layout, who(req));
  changed(res);
});

app.get("/api/layout/versions", admin, (_req, res) => res.json({ versions: yard.listLayoutVersions() }));

// Restore an earlier layout (the current one is kept as a version too).
app.post("/api/layout/restore", admin, (req, res) => {
  const old = yard.getLayoutVersion(Number(req.body.id));
  if (!old) return res.status(404).json({ error: "That version doesn't exist." });
  const { layout, error } = checkLayout(old, {
    statuses: yard.getStatuses().map((s) => s.name),
    placements: yard.getPlacements(),
  });
  if (error) return res.status(400).json({ error });
  yard.saveLayout(layout, who(req));
  changed(res);
});

// ---- Carriers (admins) ----

app.post("/api/carriers", admin, (req, res) => {
  const code = clean(req.body.code, 10).toUpperCase();
  const name = clean(req.body.name, 40);
  const color = clean(req.body.color, 7);
  const err = (!/^[A-Z0-9]{1,10}$/.test(code) && "Code: 1–10 letters or digits.")
    || (!name && "Name is required.")
    || (!/^#[0-9a-f]{6}$/i.test(color) && "Color must look like #1a2b3c.");
  if (err) return res.status(400).json({ error: err });
  yard.saveCarrier({ code, name, color });
  changed(res);
});

app.post("/api/carriers/delete", admin, (req, res) => {
  yard.deleteCarrier(clean(req.body.code, 10).toUpperCase());
  changed(res);
});

// ?trailer=<plate or trailer ID>, ?spot=201, or nothing for the latest changes in the whole yard.
app.get("/api/history", viewer, (req, res) => {
  res.json(yard.getHistory({
    trailer: clean(req.query.trailer, 60).toUpperCase() || undefined,
    spot: clean(req.query.spot, 20) || undefined,
  }));
});

// YardError = a normal "can't do that right now" (409); anything else is a bug.
app.use((err, req, res, next) => {
  if (err instanceof yard.YardError) return res.status(409).json({ error: err.message, ...state() });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`Yard Manager running on http://localhost:${PORT}`);
  if (!auth.countActiveAdmins()) {
    console.log("No admin user yet. Create one with:  npm run create-admin -- <username> \"<Full name>\"");
  }
});
