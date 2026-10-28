// Yard Manager web server: serves the map page and the shared yard API.
const path = require("path");
const express = require("express");
const yard = require("./db");

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function state() {
  return {
    statuses: yard.getStatuses(),
    sections: yard.getSections(),
    placements: yard.getPlacements(),
  };
}

// Input checks shared by the endpoints. Each returns an error message or null.
const clean = (v, max) => String(v ?? "").trim().slice(0, max);
function checkSpot(spot) {
  return yard.spotExists(spot) ? null : "Unknown spot.";
}
// Times arrive as milliseconds; missing means "don't change".
const time = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));
function checkTime(t) {
  if (t === undefined) return null;
  const now = Date.now();
  return Number.isFinite(t) && t > now - 400 * 864e5 && t < now + 10 * 60e3 ? null : "That time isn't valid (it can't be in the future).";
}

// Live updates (Server-Sent Events): every open map keeps /api/events open
// and gets the whole yard state again each time something changes.
const listeners = new Set();
const event = (s = state()) => `data: ${JSON.stringify(s)}\n\n`;

app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 3000\n" + event()); // browsers reconnect after 3 s if the line drops
  listeners.add(res);
  req.on("close", () => listeners.delete(res));
});

// A comment line every 25 s stops proxies and firewalls closing idle connections.
setInterval(() => listeners.forEach((res) => res.write(": ping\n\n")), 25000);

// Reply to the request that changed the yard, and tell everyone else.
function changed(res) {
  const s = state();
  const msg = event(s);
  listeners.forEach((l) => l.write(msg));
  res.json(s);
}

app.get("/api/yard", (req, res) => res.json(state()));

// The logged-in user's name, recorded in the history. Logins come in a later step.
const who = (req) => null;

app.post("/api/place", (req, res) => {
  const spot = clean(req.body.spot, 20);
  const trailer = clean(req.body.trailer, 20).toUpperCase();
  const status = clean(req.body.status, 40);
  const note = clean(req.body.note, 200);
  const arrivedAt = time(req.body.arrivedAt);
  const err = checkSpot(spot)
    || (!trailer && "Trailer number is required.")
    || (!yard.statusExists(status) && "Unknown status.")
    || checkTime(arrivedAt);
  if (err) return res.status(400).json({ error: err });
  yard.placeTrailer({ spot, trailer, status, note, damaged: !!req.body.damaged, arrivedAt, by: who(req) });
  changed(res);
});

app.post("/api/move", (req, res) => {
  const from = clean(req.body.from, 20);
  const to = clean(req.body.to, 20);
  const err = checkSpot(from) || checkSpot(to);
  if (err) return res.status(400).json({ error: err });
  yard.moveTrailer({ from, to, by: who(req) });
  changed(res);
});

// The trailer has left the yard.
app.post("/api/depart", (req, res) => {
  const spot = clean(req.body.spot, 20);
  const err = checkSpot(spot);
  if (err) return res.status(400).json({ error: err });
  yard.departTrailer({ spot, by: who(req) });
  changed(res);
});

// The trailer was entered by mistake.
app.post("/api/remove", (req, res) => {
  const spot = clean(req.body.spot, 20);
  const err = checkSpot(spot);
  if (err) return res.status(400).json({ error: err });
  yard.removeTrailer({ spot, by: who(req) });
  changed(res);
});

app.post("/api/visit-times", (req, res) => {
  const id = Number(req.body.id);
  const arrivedAt = time(req.body.arrivedAt);
  const departedAt = time(req.body.departedAt);
  const err = (!Number.isInteger(id) && "Unknown visit.") || checkTime(arrivedAt) || checkTime(departedAt);
  if (err) return res.status(400).json({ error: err });
  yard.correctTimes({ id, arrivedAt, departedAt, by: who(req) });
  changed(res);
});

// ?trailer=ABC123, ?spot=201, or nothing for the latest changes in the whole yard.
app.get("/api/history", (req, res) => {
  res.json(yard.getHistory({
    trailer: clean(req.query.trailer, 20).toUpperCase() || undefined,
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
});
