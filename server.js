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

app.get("/api/yard", (req, res) => res.json(state()));

app.post("/api/place", (req, res) => {
  const spot = clean(req.body.spot, 20);
  const trailer = clean(req.body.trailer, 20).toUpperCase();
  const status = clean(req.body.status, 40);
  const note = clean(req.body.note, 200);
  const err = checkSpot(spot)
    || (!trailer && "Trailer number is required.")
    || (!yard.statusExists(status) && "Unknown status.");
  if (err) return res.status(400).json({ error: err });
  yard.placeTrailer({ spot, trailer, status, note });
  res.json(state());
});

app.post("/api/move", (req, res) => {
  const from = clean(req.body.from, 20);
  const to = clean(req.body.to, 20);
  const err = checkSpot(from) || checkSpot(to);
  if (err) return res.status(400).json({ error: err });
  yard.moveTrailer({ from, to });
  res.json(state());
});

app.post("/api/clear", (req, res) => {
  const spot = clean(req.body.spot, 20);
  const err = checkSpot(spot);
  if (err) return res.status(400).json({ error: err });
  yard.clearSpot(spot);
  res.json(state());
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
