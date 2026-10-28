// The edit sheet that slides up when a spot is tapped: trailer number, status,
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

export function openSheet(id, sectionIndex) {
  spot = id;
  const t = yard.placements[id];
  // What this user may change (the server checks the same rules):
  // operators everything, workers status/note/damaged of a trailer that is here, viewers nothing.
  const full = can("operator");
  editable = full || (can("worker") && !!t);
  $("f-tr").disabled = !full;
  $("f-arr").disabled = !full;
  $("f-note").disabled = !editable;
  $("f-dmg").disabled = !editable;
  $("b-save").hidden = !editable;
  $("b-cancel").textContent = editable ? "Cancel" : "Close";

  $("sh-title").textContent = spotName(id);
  $("f-tr").value = t ? t.trailer : "";
  $("f-note").value = t?.note || "";
  status = t ? t.status : yard.sections[sectionIndex].defaultStatus;
  renderChips();
  damaged = !!t?.damaged;
  renderDamaged();
  arrivalShown = t ? toLocalInput(t.since) : "";
  $("f-arr").value = arrivalShown;
  // Arrival time and Move/Departed/Remove only apply to a spot with a trailer.
  $("f-arr-wrap").hidden = !t;
  $("occ-row").hidden = !t || !full;
  $("sheet").classList.add("open");
  if (!t && full) setTimeout(() => $("f-tr").focus(), 220);
}

export function closeSheet() {
  $("sheet").classList.remove("open");
  spot = null;
  document.activeElement?.blur();
}

async function save() {
  const trailer = $("f-tr").value.trim().toUpperCase();
  if (!trailer) return $("f-tr").focus();
  const arrival = $("f-arr").value;
  const ok = await send("/api/place", {
    spot, trailer, status, damaged,
    note: $("f-note").value.trim(),
    arrivedAt: arrival !== arrivalShown ? fromLocalInput(arrival) : undefined,
  });
  if (ok) closeSheet();
}

async function depart() {
  if (!confirm(`${yard.placements[spot].trailer} has left the yard?`)) return;
  if (await send("/api/depart", { spot })) closeSheet();
}

async function remove() {
  const msg = `Remove ${yard.placements[spot].trailer}?\n\n`
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
  openHistory(t ? { trailer: t.trailer, spot } : { spot });
}

export function initSheet() {
  $("chips").onclick = (e) => {
    const chip = e.target.closest(".chip");
    if (chip) { status = chip.dataset.k; renderChips(); }
  };
  $("f-dmg").onclick = () => { damaged = !damaged; renderDamaged(); };
  $("b-save").onclick = save;
  $("b-cancel").onclick = closeSheet;
  $("b-move").onclick = move;
  $("b-depart").onclick = depart;
  $("b-remove").onclick = remove;
  $("b-hist").onclick = history;
}
