// Starts the page and connects the pieces: taps on spots, moving trailers,
// search, keyboard, and the live connection to the server.
import { $, showMsg, initDatePickers } from "./util.js";
import { yard, ui, can, setYard, onYardChange } from "./store.js";
import { send } from "./api.js";
import { render, renderLegend, highlightSearch } from "./map.js";
import { initZoom } from "./zoom.js";
import { initSheet, openSheet, closeSheet, isSheetOpen } from "./sheet.js";
import { initHistory, openHistory, closeHistory, isHistoryOpen } from "./history.js";
import { initIncoming, renderIncoming, closeIncoming, isIncomingOpen } from "./incoming.js";

function cancelMove() {
  ui.moving = null;
  render();
}

// Tapping a spot opens its edit sheet. After "Move" in the sheet the trailer is
// lifted (ui.moving) and the next tap on an open spot moves it there.
function tap(spot, sectionIndex) {
  if (ui.busy) return;
  if (ui.arriving) return placeArrival(spot, sectionIndex);
  if (!ui.moving) return openSheet(spot, sectionIndex);
  if (spot === ui.moving) return cancelMove();
  if (yard.placements[spot]) {
    showMsg(`That spot is taken. Tap an open spot, or tap ${yard.placements[ui.moving].plate} again to cancel.`);
    return;
  }
  const from = ui.moving;
  ui.moving = null;
  send("/api/move", { from, to: spot });
}

// "Arrived" in the Incoming panel: the next tap on an open spot opens the
// sheet for that trailer there, filled in from the Incoming entry.
function placeArrival(spot, sectionIndex) {
  if (yard.placements[spot]) {
    showMsg(`That spot is taken. Tap an open spot for ${ui.arriving.plate}, or press Esc to cancel.`);
    return;
  }
  const entry = ui.arriving;
  ui.arriving = null;
  render();
  openSheet(spot, sectionIndex, entry);
}

$("main").onclick = (e) => {
  const bay = e.target.closest(".bay");
  if (bay) tap(bay.dataset.id, Number(bay.dataset.s));
};

$("q").oninput = () => highlightSearch(true);

// "Past visits" link shown when a search finds nothing on the map.
$("msg").onclick = (e) => {
  const b = e.target.closest("button");
  if (b?.dataset.tr) openHistory({ trailer: b.dataset.tr });
};

// Esc closes the history panel or the sheet, or cancels a move (PC keyboards).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (isHistoryOpen()) closeHistory();
  else if (isIncomingOpen()) closeIncoming();
  else if (isSheetOpen()) closeSheet();
  else if (ui.moving) cancelMove();
  else if (ui.arriving) { ui.arriving = null; render(); }
});

onYardChange(() => {
  renderLegend();
  render();
  renderIncoming();
});

// Who is logged in. Not logged in (or session ended): go to the login page.
const me = await fetch("/api/me").then((r) => (r.ok ? r.json() : null)).catch(() => null);
if (!me) {
  location.href = "/login.html";
  throw new Error("Not logged in"); // stop here while the browser navigates
}
ui.user = me.user;
$("me").textContent = `${me.user.name} (${me.user.role[0].toUpperCase() + me.user.role.slice(1)})`;
$("manage-link").hidden = !can("operator");
$("b-logout").onclick = async () => {
  await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  location.href = "/login.html";
};

initZoom();
initDatePickers();
initSheet();
initHistory();
initIncoming();
showMsg("Loading…");

// Live updates: the server sends the whole yard every time anything changes.
// EventSource reconnects by itself if the network drops. If the server refuses
// (logged out, or the account was changed by an admin) it stops; then check
// the login and either go to the login page or start again.
function connectLive() {
  const live = new EventSource("/api/events");
  live.onmessage = (e) => setYard(JSON.parse(e.data));
  live.onopen = () => { $("live").className = "live"; $("live").textContent = "Live"; };
  live.onerror = async () => {
    $("live").className = "live off";
    $("live").textContent = "Offline, reconnecting…";
    if (live.readyState !== EventSource.CLOSED) return;
    const res = await fetch("/api/me").catch(() => null);
    if (res?.status === 401) location.href = "/login.html";
    else setTimeout(connectLive, 3000);
  };
}
connectLive();

// Redraw once a minute so dwell times count up and late markers appear.
setInterval(() => {
  if (!ui.moving) render();
  renderIncoming();
}, 60000);
