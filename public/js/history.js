// The history panel: recent changes in the whole yard, or the visits and
// changes for one trailer or one spot.
import { $, esc, formatTime, duration, toLocalInput, fromLocalInput } from "./util.js";
import { can, spotName } from "./store.js";
import { send } from "./api.js";

let current = null; // what the open panel shows: {}, { trailer, spot? } or { spot }

export const isHistoryOpen = () => current !== null;

const trailerLink = (t) => `<button class="link" data-tr="${esc(t)}">${esc(t)}</button>`;
const place = (spot) => esc(spotName(spot));

const FIELD_NAMES = {
  plate: "reg. number", trailer: "reg. number", trailer_id: "trailer ID", status: "status", note: "note",
  arrived_at: "arrival", departed_at: "departure", expected_departure: "planned departure",
};

// One history entry as a sentence, e.g. "ABC123 moved Door 201 → Parking spot 5".
function describe(e) {
  const t = trailerLink(e.plate);
  const d = e.details || {};
  switch (e.action) {
    case "arrive": return `${t} arrived at ${place(e.to_spot)}${d.status ? ` (${esc(d.status)})` : ""}`;
    case "move": return `${t} moved ${place(e.from_spot)} → ${place(e.to_spot)}`;
    case "depart": return `${t} departed from ${place(e.from_spot)}`;
    case "remove": return `${t} removed from ${place(e.from_spot)} (entered by mistake)`;
    case "link": {
      // details: { trailer_id: [old, new], carrier?: [old, new] }
      const parts = [];
      const [idBefore, idAfter] = d.trailer_id;
      if (idBefore !== idAfter) parts.push(`trailer ID “${esc(idAfter)}”` + (idBefore ? ` (was “${esc(idBefore)}”)` : ""));
      if (d.carrier) parts.push(`carrier ${esc(d.carrier[1] || "–")}` + (d.carrier[0] ? ` (was ${esc(d.carrier[0])})` : ""));
      return `${t} linked to ${parts.join(" and ")}`;
    }
    case "unlink": return `${t} removed from the trailer register (was “${esc(d.trailer_id[0])}”)`;
  }
  // "edit": details is { field: [old, new] }
  const changes = Object.entries(d).map(([field, [before, after]]) => {
    if (field === "damaged") return after ? "marked damaged" : "damage cleared";
    if (field === "arrived_at" || field === "departed_at" || field === "expected_departure") {
      before = before ? formatTime(before) : "";
      after = after ? formatTime(after) : "";
    }
    return `${FIELD_NAMES[field] || field} “${esc(before || "–")}” → “${esc(after || "–")}”`;
  });
  return `${t} at ${place(e.to_spot || e.from_spot)}: ${changes.join(", ")}`;
}

function eventsHtml(events) {
  if (!events.length) return "<p>No changes recorded yet.</p>";
  return "<ul>" + events.map((e) =>
    `<li><time>${formatTime(e.at)}</time>${describe(e)}${e.user_name ? `<small>by ${esc(e.user_name)}</small>` : ""}</li>`
  ).join("") + "</ul>";
}

// A trailer's stays in the yard. For operators, departed visits get a hidden
// "Fix times" form.
function visitsHtml(visits) {
  return "<ul>" + visits.map((v) => {
    const end = v.departed_at;
    let h = `<li class="visit">`;
    if (v.trailer_id) h += `<span>Trailer ID</span><span>${esc(v.trailer_id)}</span>`;
    h += `<span>Arrived</span><span>${formatTime(v.arrived_at)}</span>`;
    // Planned times, with how far off the actual time was.
    const off = (planned, actual) => {
      const m = Math.round((actual - planned) / 60000);
      return Math.abs(m) < 1 ? "on time" : m > 0 ? `${duration(actual - planned)} late` : `${duration(planned - actual)} early`;
    };
    if (v.expected_arrival) h += `<span>Planned arrival</span><span>${formatTime(v.expected_arrival)} · ${off(v.expected_arrival, v.arrived_at)}</span>`;
    if (v.expected_departure) {
      h += `<span>Planned departure</span><span>${formatTime(v.expected_departure)}`
        + (end ? ` · ${off(v.expected_departure, end)}` : v.expected_departure < Date.now() ? " · late" : "") + "</span>";
    }
    if (!end) {
      return h + `<span>Now</span><span>In the yard at ${place(v.spot_id)} · ${duration(Date.now() - v.arrived_at)}</span></li>`;
    }
    h += `<span>Departed</span><span>${formatTime(end)} from ${place(v.spot_id)} · stayed ${duration(end - v.arrived_at)}`;
    if (!can("operator")) return h + "</span></li>";
    h += ` <button class="link" data-fix="${v.id}">Fix times</button></span>`;
    h += `<form data-visit="${v.id}" hidden>`
      + `<input type="datetime-local" name="a" value="${toLocalInput(v.arrived_at)}" aria-label="Arrived">`
      + `<input type="datetime-local" name="d" value="${toLocalInput(end)}" aria-label="Departed">`
      + `<button class="btn pri">Save times</button></form>`;
    return h + "</li>";
  }).join("") + "</ul>";
}

export async function openHistory(q) {
  current = q;
  $("h-title").textContent = q.trailer ? "Trailer " + q.trailer : q.spot ? spotName(q.spot) : "Recent changes";
  $("h-body").innerHTML = "<p>Loading…</p>";
  $("hist").classList.add("open");

  const params = q.trailer ? { trailer: q.trailer } : q.spot ? { spot: q.spot } : {};
  let h;
  try {
    h = await (await fetch("/api/history?" + new URLSearchParams(params))).json();
  } catch {
    $("h-body").innerHTML = "<p>Can't reach the server.</p>";
    return;
  }
  if (current !== q) return; // the user opened something else meanwhile

  let html = "";
  if (q.trailer) {
    html += "<h4>Visits</h4>" + (h.visits.length ? visitsHtml(h.visits) : "<p>No visits found for this reg. number or trailer ID.</p>");
    if (q.spot) html += `<p><button class="link" data-spot="${esc(q.spot)}">Show history for ${place(q.spot)}</button></p>`;
  }
  $("h-body").innerHTML = html + "<h4>Changes</h4>" + eventsHtml(h.events);
}

export function closeHistory() {
  $("hist").classList.remove("open");
  current = null;
}

async function saveTimes(form) {
  const ok = await send("/api/visit-times", {
    id: Number(form.dataset.visit),
    arrivedAt: fromLocalInput(form.a.value),
    departedAt: fromLocalInput(form.d.value),
  });
  if (ok) openHistory(current);
}

export function initHistory() {
  $("b-histall").onclick = () => openHistory({});
  $("h-close").onclick = closeHistory;
  $("hist").onclick = (e) => { if (e.target === $("hist")) closeHistory(); }; // click outside the panel
  $("h-body").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tr) openHistory({ trailer: b.dataset.tr });
    else if (b.dataset.spot) openHistory({ spot: b.dataset.spot });
    else if (b.dataset.fix) {
      const form = $("h-body").querySelector(`form[data-visit="${b.dataset.fix}"]`);
      form.hidden = !form.hidden;
    }
  };
  $("h-body").onsubmit = (e) => { e.preventDefault(); saveTimes(e.target); };
}
