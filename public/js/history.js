// The history panel: recent changes in the whole yard, or the visits and
// changes for one trailer or one spot.
import { $, esc, formatTime, duration, toLocalInput, fromLocalInput } from "./util.js";
import { spotName } from "./store.js";
import { send } from "./api.js";

let current = null; // what the open panel shows: {}, { trailer, spot? } or { spot }

export const isHistoryOpen = () => current !== null;

const trailerLink = (t) => `<button class="link" data-tr="${esc(t)}">${esc(t)}</button>`;
const place = (spot) => esc(spotName(spot));

const FIELD_NAMES = {
  trailer: "trailer number", status: "status", note: "note",
  arrived_at: "arrival", departed_at: "departure",
};

// One history entry as a sentence, e.g. "ABC123 moved Door 201 → Parking spot 5".
function describe(e) {
  const t = trailerLink(e.trailer);
  const d = e.details || {};
  switch (e.action) {
    case "arrive": return `${t} arrived at ${place(e.to_spot)}${d.status ? ` (${esc(d.status)})` : ""}`;
    case "move": return `${t} moved ${place(e.from_spot)} → ${place(e.to_spot)}`;
    case "depart": return `${t} departed from ${place(e.from_spot)}`;
    case "remove": return `${t} removed from ${place(e.from_spot)} (entered by mistake)`;
  }
  // "edit": details is { field: [old, new] }
  const changes = Object.entries(d).map(([field, [before, after]]) => {
    if (field === "damaged") return after ? "marked damaged" : "damage cleared";
    if (field === "arrived_at" || field === "departed_at") {
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

// A trailer's stays in the yard. Departed visits get a hidden "Fix times" form.
function visitsHtml(visits) {
  return "<ul>" + visits.map((v) => {
    const end = v.departed_at;
    let h = `<li class="visit"><span>Arrived</span><span>${formatTime(v.arrived_at)}</span>`;
    if (!end) {
      return h + `<span>Now</span><span>In the yard at ${place(v.spot_id)} · ${duration(Date.now() - v.arrived_at)}</span></li>`;
    }
    h += `<span>Departed</span><span>${formatTime(end)} from ${place(v.spot_id)} · stayed ${duration(end - v.arrived_at)} `
      + `<button class="link" data-fix="${v.id}">Fix times</button></span>`;
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
    html += "<h4>Visits</h4>" + (h.visits.length ? visitsHtml(h.visits) : "<p>No visits found for this trailer number.</p>");
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
