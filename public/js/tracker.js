// "Next arrivals" under the side panel: the next few trailers on the Incoming
// list, each with a small truck driving along a road to the warehouse.
//
// There is no GPS: the truck's place on the road comes from the clock. It sets
// off APPROACH before the expected time and reaches the warehouse at the
// expected time. Late trucks wait at the warehouse and the road turns red.
// Clicking a card opens the Incoming panel.
import { $, esc, duration, formatTime } from "./util.js";
import { yard, carrierBadge } from "./store.js";
import { openIncoming } from "./incoming.js";

const SHOW = 3;                  // how many arrivals
const APPROACH = 2 * 3600e3;     // the truck drives for the last 2 hours before its time

const TRUCK = `<svg class="trk-truck-svg" viewBox="0 0 40 18" aria-hidden="true">
  <rect x="0" y="2" width="26" height="11" rx="1.5" class="trk-box"/>
  <path d="M27 5h6l4 4v4H27z" class="trk-cab"/>
  <circle cx="6" cy="15" r="2.4"/><circle cx="20" cy="15" r="2.4"/><circle cx="33" cy="15" r="2.4"/></svg>`;
const WAREHOUSE = `<svg class="trk-goal" viewBox="0 0 20 18" aria-hidden="true">
  <path d="M1 8 10 2l9 6v9H1z"/><rect x="7" y="11" width="6" height="6" class="trk-door"/></svg>`;

// "14:30" today, otherwise with the day: "fre. 30. okt., 06:30"
function when(at) {
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : formatTime(at);
}

function status(at) {
  const left = at - Date.now();
  if (left < 0) return { late: true, text: `${duration(-left)} late`, progress: 1 };
  return {
    late: false,
    text: left < 60e3 ? "arriving now" : `in ${duration(left)}`,
    progress: Math.max(0, Math.min(1, 1 - left / APPROACH)),
  };
}

function newCard(entry) {
  const el = document.createElement("button");
  el.className = "trk";
  el.dataset.id = entry.id;
  el.innerHTML = `<span class="trk-head"><b class="trk-plate"></b><span class="trk-badge"></span><span class="trk-when"></span></span>
    <span class="trk-road"><span class="trk-truck">${TRUCK}</span>${WAREHOUSE}</span>
    <span class="trk-time"></span>`;
  return el;
}

// Cards are kept between updates (by Incoming entry), so the truck moves
// smoothly to its new place instead of the card being drawn again.
export function renderTracker() {
  const list = $("tracker-list");
  const next = [...yard.incoming].sort((a, b) => a.expectedAt - b.expectedAt).slice(0, SHOW);
  const old = new Map([...list.querySelectorAll(".trk")].map((el) => [el.dataset.id, el]));
  const cards = next.map((entry) => {
    const el = old.get(String(entry.id)) || newCard(entry);
    const s = status(entry.expectedAt);
    el.classList.toggle("late", s.late);
    el.title = `${entry.plate}: expected ${formatTime(entry.expectedAt)}${entry.note ? ` · ${entry.note}` : ""}`;
    el.querySelector(".trk-plate").textContent = entry.plate;
    el.querySelector(".trk-badge").innerHTML = carrierBadge(entry.carrier);
    el.querySelector(".trk-when").textContent = s.text;
    el.querySelector(".trk-time").textContent = when(entry.expectedAt);
    el.style.setProperty("--p", s.progress);
    el.style.setProperty("--tc", yard.carriers[entry.carrier]?.color || "#c7ccd4");
    return el;
  });
  // Only put the cards in again when the list changed: re-inserting a card
  // would restart its truck's drive.
  const same = cards.length === list.children.length && cards.every((el, i) => list.children[i] === el);
  if (!same) list.replaceChildren(...cards);
  if (!cards.length) list.innerHTML = `<p class="trk-empty">No trailers expected.</p>`;
}

export function initTracker() {
  $("tracker-list").onclick = (e) => { if (e.target.closest(".trk")) openIncoming(); };
}
