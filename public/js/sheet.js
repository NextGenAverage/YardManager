// The edit sheet that slides up when a spot is tapped: plate, trailer ID, status,
// note, damaged, arrival time, and the Move / Departed / Remove buttons.
import { $, esc, toLocalInput, fromLocalInput } from "./util.js";
import { yard, ui, can, statusStyle, spotName } from "./store.js";
import { send } from "./api.js";
import { render } from "./map.js";
import { openHistory } from "./history.js";

let spot = null;       // spot the sheet is open for
let status = "";       // selected status chip
let damaged = false;
let arrivalShown = ""; // arrival time as first shown, to tell if it was edited
let departureShown = ""; // planned departure as first shown
let editable = false;  // may this user change status/note/damaged here?

export const isSheetOpen = () => spot !== null;

function renderChips() {
  $("chips").innerHTML = Object.keys(yard.statuses)
    .map((name) => `<button class="chip${name === status ? " sel" : ""}" style="${statusStyle(name)}" `
      + `data-k="${esc(name)}"${editable ? "" : " disabled"}>${esc(name)}</button>`)
    .join("");
}

function renderDamaged() {
  $("f-dmg").classList.toggle("sel", damaged);
}

// ---- Trailer ID and carrier: filled in from the register ----
// A known reg. number fills in its trailer ID and carrier, locked; links are
// changed on the Manage page. For a new reg. number operators type the trailer
// ID (required) and pick the carrier.

let linkedId = null; // trailer ID from the register for the reg. number typed, or null
let lookups = 0;     // to ignore answers to older lookups while typing
let lookupTimer;

async function lookUpPlate() {
  const plate = $("f-tr").value.trim().toUpperCase();
  const n = ++lookups;
  const res = plate
    ? await fetch(`/api/trailers/${encodeURIComponent(plate)}`).then((r) => r.json()).catch(() => null)
    : null;
  if (n !== lookups) return; // a newer lookup has started
  const link = res?.trailer;
  if (link) {
    $("f-tid").value = link.trailerId;
    $("f-carrier").value = link.carrier || "";
  } else if (linkedId !== null) { // they were filled in for another reg. number
    $("f-tid").value = "";
    $("f-carrier").value = "";
  }
  // Not in the register but on the Incoming list: use what was entered there.
  const expected = !link && yard.incoming.find((e) => e.plate === plate.replace(/[^A-Z0-9]/g, ""));
  if (expected && !$("f-tid").value) {
    $("f-tid").value = expected.trailerId;
    $("f-carrier").value = expected.carrier || "";
  }
  linkedId = link ? link.trailerId : null;
  showTrailerIdState();
}

function showTrailerIdState(error) {
  const hint = $("tid-hint");
  const operator = can("operator");
  $("f-tid").readOnly = linkedId !== null;
  $("f-carrier").disabled = linkedId !== null || !operator;
  hint.classList.toggle("error", !!error);
  if (error) hint.textContent = error;
  else if (!operator || !$("f-tr").value.trim()) hint.textContent = "";
  else if (linkedId !== null) hint.innerHTML = 'Linked to this reg. number. Change it on the <a href="/manage.html#trailers">Manage page</a>.';
  else hint.textContent = "New reg. number: enter its trailer ID and carrier.";
}

// arrival: an Incoming entry being placed here ("Arrived" in the Incoming panel).
export function openSheet(id, sectionIndex, arrival) {
  spot = id;
  const t = yard.placements[id];
  // What this user may change (the server checks the same rules):
  // operators everything, workers status/note/damaged of a trailer that is here, viewers nothing.
  const full = can("operator");
  editable = full || (can("worker") && !!t);
  $("f-tr").disabled = !full;
  $("f-tid").disabled = !full;
  $("f-arr").disabled = !full;
  $("f-exp").disabled = !full;
  $("f-note").disabled = !editable;
  $("f-dmg").disabled = !editable;
  $("b-save").hidden = !editable;
  $("b-cancel").textContent = editable ? "Cancel" : "Close";

  $("sh-title").textContent = spotName(id);
  $("f-tr").value = t ? t.plate : "";
  $("f-tid").value = t?.trailerId || "";
  $("f-carrier").innerHTML = `<option value="">Carrier…</option>`
    + Object.entries(yard.carriers).map(([code, c]) => `<option value="${esc(code)}">${esc(code)} (${esc(c.name)})</option>`).join("");
  $("f-carrier").value = t?.carrier || "";
  $("f-note").value = t?.note || "";
  status = t ? t.status : yard.sections[sectionIndex].defaultStatus;
  renderChips();
  damaged = !!t?.damaged;
  renderDamaged();
  arrivalShown = t ? toLocalInput(t.since) : "";
  $("f-arr").value = arrivalShown;
  departureShown = t?.expectedDeparture ? toLocalInput(t.expectedDeparture) : "";
  $("f-exp").value = departureShown;
  // Arrival time and Move/Departed/Remove only apply to a spot with a trailer.
  $("f-arr-wrap").hidden = !t;
  $("f-exp-wrap").hidden = !t && !full; // operators can plan the departure of a new trailer too
  $("f-exp-quick").hidden = !full;
  $("occ-row").hidden = !t || !full;
  $("sheet").classList.add("open");
  if (!t && full) setTimeout(() => $("f-tr").focus(), 220);
  linkedId = null;
  showTrailerIdState();
  if (arrival) {
    $("f-tr").value = arrival.plate;
    if (arrival.note) $("f-note").value = arrival.note;
  }
  if (t || arrival) lookUpPlate();
}

export function closeSheet() {
  $("sheet").classList.remove("open");
  spot = null;
  document.activeElement?.blur();
}

async function save() {
  const plate = $("f-tr").value.trim().toUpperCase();
  if (!plate) return $("f-tr").focus();
  if (can("operator")) {
    await lookUpPlate(); // make sure the trailer ID belongs to the reg. number as typed now
    if (!$("f-tid").value.trim()) {
      showTrailerIdState("Trailer ID is required for a new reg. number.");
      return $("f-tid").focus();
    }
  }
  const arrival = $("f-arr").value;
  const ok = await send("/api/place", {
    spot, plate, status, damaged,
    trailerId: $("f-tid").value.trim(),
    carrier: $("f-carrier").value || null,
    note: $("f-note").value.trim(),
    arrivedAt: arrival !== arrivalShown ? fromLocalInput(arrival) : undefined,
    // Planned departure: only sent when changed; an emptied field clears it.
    expectedDeparture: $("f-exp").value !== departureShown ? fromLocalInput($("f-exp").value) ?? null : undefined,
  });
  if (ok) closeSheet();
}

async function depart() {
  if (!confirm(`${yard.placements[spot].plate} has left the yard?`)) return;
  if (await send("/api/depart", { spot })) closeSheet();
}

async function remove() {
  const msg = `Remove ${yard.placements[spot].plate}?\n\n`
    + "Only use this if it was entered by mistake. If the trailer has left, use Departed instead.";
  if (!confirm(msg)) return;
  if (await send("/api/remove", { spot })) closeSheet();
}

// Lift the trailer; the next tap on an open spot moves it (see main.js).
function move() {
  ui.moving = spot;
  closeSheet();
  render();
}

function history() {
  const t = yard.placements[spot];
  openHistory(t ? { trailer: t.plate, spot } : { spot });
}

export function initSheet() {
  $("chips").onclick = (e) => {
    const chip = e.target.closest(".chip");
    if (chip) { status = chip.dataset.k; renderChips(); }
  };
  $("f-dmg").onclick = () => { damaged = !damaged; renderDamaged(); };
  $("f-tr").oninput = () => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(lookUpPlate, 250);
  };
  $("b-save").onclick = save;
  $("b-cancel").onclick = closeSheet;
  $("b-move").onclick = move;
  $("b-depart").onclick = depart;
  $("b-remove").onclick = remove;
  $("b-hist").onclick = history;
}
