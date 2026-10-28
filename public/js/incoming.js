// The Incoming panel: trailers expected to arrive, soonest first. Everyone can
// see it; operators add and remove entries and use "Arrived" to place one on
// the map (main.js handles the tap on a spot). The header button shows how many
// are expected and turns red when one is late.
import { $, esc, formatTime, duration, toLocalInput, fromLocalInput } from "./util.js";
import { yard, ui, can, carrierBadge } from "./store.js";
import { send } from "./api.js";
import { render } from "./map.js";

let open = false;
export const isIncomingOpen = () => open;

// "in 2h 10m" or "45m late"
function whenText(at) {
  const diff = at - Date.now();
  return diff >= 0 ? `in ${duration(diff)}` : `${duration(-diff)} late`;
}

export function renderIncomingButton() {
  const n = yard.incoming.length;
  const late = yard.incoming.some((e) => e.expectedAt < Date.now());
  $("b-incoming").textContent = n ? `Incoming (${n})` : "Incoming";
  $("b-incoming").classList.toggle("late-btn", late);
}

export function renderIncoming() {
  renderIncomingButton();
  if (!open) return;
  const operator = can("operator");
  $("in-add").hidden = !operator;
  $("in-list").innerHTML = yard.incoming.length
    ? yard.incoming.map((e) => {
      const late = e.expectedAt < Date.now();
      return `<li class="${late ? "late" : ""}" data-id="${e.id}">
        <div class="in-head"><b>${esc(e.plate)}</b> ${carrierBadge(e.carrier)}
          <span class="in-when">${formatTime(e.expectedAt)} · ${whenText(e.expectedAt)}</span></div>
        ${e.trailerId ? `<small>Trailer ID ${esc(e.trailerId)}</small>` : ""}
        ${e.note ? `<small>${esc(e.note)}</small>` : ""}
        ${operator ? `<div class="in-actions">
          <button class="btn pri" data-arrived>Arrived: place on map</button>
          <button class="link danger" data-delete>Remove</button></div>` : ""}
      </li>`;
    }).join("")
    : "<li class='empty'>No trailers expected.</li>";
}

export function openIncoming() {
  open = true;
  $("incoming").classList.add("open");
  const f = $("in-add");
  if (!f.when.value) f.when.value = toLocalInput(Date.now() + 3600e3); // default: in an hour
  f.carrier.innerHTML = `<option value="">Carrier…</option>`
    + Object.entries(yard.carriers).map(([code, c]) => `<option value="${esc(code)}">${esc(code)} (${esc(c.name)})</option>`).join("");
  renderIncoming();
}

export function closeIncoming() {
  open = false;
  $("incoming").classList.remove("open");
}

// Typing a reg. number fills in its trailer ID and carrier from the register.
let lookupTimer;
async function lookUp() {
  const f = $("in-add");
  const plate = f.plate.value.trim();
  if (!plate) return;
  const res = await fetch(`/api/trailers/${encodeURIComponent(plate)}`).then((r) => r.json()).catch(() => null);
  if (res?.trailer) {
    f.trailerId.value = res.trailer.trailerId;
    f.carrier.value = res.trailer.carrier || "";
  }
}

async function add(f) {
  $("in-error").textContent = "";
  const ok = await send("/api/incoming", {
    plate: f.plate.value, trailerId: f.trailerId.value, carrier: f.carrier.value || null,
    expectedAt: fromLocalInput(f.when.value), note: f.note.value,
  });
  if (ok) {
    f.plate.value = f.trailerId.value = f.note.value = "";
    f.carrier.value = "";
  } else {
    $("in-error").textContent = $("msg").textContent; // api.js put the reason there
  }
}

// "Arrived": close the panel and let the user tap an open spot for this trailer.
function startArrival(entry) {
  ui.arriving = entry;
  closeIncoming();
  render();
}

export function initIncoming() {
  $("b-incoming").onclick = openIncoming;
  $("in-close").onclick = closeIncoming;
  $("incoming").onclick = (e) => { if (e.target === $("incoming")) closeIncoming(); }; // click outside the panel
  $("in-add").onsubmit = (e) => { e.preventDefault(); add(e.target); };
  $("in-add").plate.oninput = () => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(lookUp, 250);
  };
  $("in-list").onclick = (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    const entry = yard.incoming.find((x) => x.id === Number(li.dataset.id));
    if (e.target.matches("[data-arrived]")) startArrival(entry);
    if (e.target.matches("[data-delete]") && confirm(`Remove ${entry.plate} from Incoming?`)) {
      send("/api/incoming/delete", { id: entry.id });
    }
  };
}
