// Manage page, Map tab (admins): the map editor.
//
// The layout ({ sections, buildings }, same shape as default-layout.js) is
// edited as a draft in the browser and saved in one go; the server checks it
// (layout.js) and keeps the old one as a version that can be restored.
import { $, esc, formatTime } from "./util.js";
import { layoutSize } from "./geometry.js";

let draft = null;    // { sections, buildings } being edited
let statuses = [];   // status names, for "default status"
let occupied = {};   // { spotId: plate } trailers in the yard now
let selected = null; // { type: "section" | "building", i }
let dirty = false;
let zoom = 1;

const KIND_LABELS = { door: "Doors", park: "Parking", pool: "Unassigned (side panel)", street: "Street parking (outside the fence)" };
const DIRECTION_LABELS = {
  n: "Up (door sign below)", s: "Down (door sign above)",
  e: "Right, lying sideways", w: "Left, lying sideways",
};

async function request(path, body) {
  $("m-error").textContent = "";
  const res = await fetch(path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {});
  if (res.status === 401) location.href = "/login.html";
  const json = await res.json();
  if (!res.ok) {
    $("m-error").textContent = json.error || "Something went wrong.";
    throw new Error(json.error);
  }
  return json;
}

function notice(text) {
  $("m-notice").hidden = !text;
  $("m-notice").textContent = text;
}

function setDirty(value) {
  dirty = value;
  $("m-dirty").textContent = dirty ? "Unsaved changes" : "";
  $("m-save").disabled = !dirty;
  $("m-discard").disabled = !dirty;
}

// ---- Drawing the canvas (same classes as the real map, so it looks the same) ----

function sectionHtml(s, i) {
  const vars = `--th:${s.th || 40}px;left:${s.x}px;top:${s.y}px;--cols:${s.cols};--cw:${s.cw}px;--sh:${s.sh}px`;
  const isSel = selected?.type === "section" && selected.i === i;
  const spots = s.spots.map((spot) => {
    const plate = occupied[spot];
    return `<span class="bay${plate ? " taken ed-occ" : ""}">`
      + (s.kind === "door" ? `<span class="door"><span class="dr">${esc(spot)}</span></span>` : "")
      + `<span class="stall">${s.kind !== "door" || plate ? `<span class="lbl">${esc(plate || spot)}</span>` : ""}</span></span>`;
  }).join("");
  return `<div class="sec o-${s.o} ed-item${isSel ? " ed-sel" : ""}" data-type="section" data-i="${i}" style="${vars}">`
    + (s.title ? `<h2>${esc(s.title)}</h2>` : "")
    + `<div class="grid${s.kind !== "door" ? " pkg" : ""}">${spots}</div></div>`;
}

function buildingHtml(b, i) {
  const isSel = selected?.type === "building" && selected.i === i;
  return `<div class="bld${b.label ? " hall" : ""} ed-item${isSel ? " ed-sel" : ""}" data-type="building" data-i="${i}" `
    + `style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">${esc(b.label || "")}</div>`;
}

function renderCanvas() {
  const { width, height, streetHeight } = layoutSize(draft.sections, draft.buildings);
  let map = draft.buildings.map(buildingHtml).join(""), street = "", pool = "";
  draft.sections.forEach((s, i) => {
    if (s.kind === "pool") {
      const isSel = selected?.type === "section" && selected.i === i;
      pool += `<button class="btn${isSel ? " pri" : ""}" data-pool="${i}">${esc(s.title || "Untitled")} (${esc(s.spots[0])}–${esc(s.spots.at(-1))})</button>`;
    } else if (s.kind === "street") street += sectionHtml(s, i);
    else map += sectionHtml(s, i);
  });
  $("m-scene").innerHTML = map;
  $("m-street").innerHTML = street;
  $("m-pool").innerHTML = pool || "<p>None.</p>";
  zoom = Math.min(1, ($("m-wrap").clientWidth - 8) / width);
  for (const [id, h] of [["m-scene", height], ["m-street", streetHeight || 40]]) {
    $(id).style.width = width + "px";
    $(id).style.height = h + "px";
    $(id).style.zoom = zoom;
  }
}

// ---- Properties panel ----

const field = (label, html) => `<label class="ed-field"><span>${label}</span>${html}</label>`;
const num = (key, value, extra = "") => `<input type="number" data-key="${key}" value="${value ?? ""}" ${extra}>`;
const options = (list, current) => Object.entries(list)
  .map(([value, label]) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`).join("");

function renderPanel() {
  const panel = $("m-panel");
  if (!selected) {
    panel.innerHTML = `<p class="intro">Select a section or building on the map, or add one with
      <b>+ Section</b> / <b>+ Building</b>.</p>`;
    return;
  }
  if (selected.type === "building") {
    const b = draft.buildings[selected.i];
    panel.innerHTML = `<h3>Building</h3>`
      + field("Label", `<input data-key="label" value="${esc(b.label || "")}" maxlength="40" placeholder="e.g. WAREHOUSE">`)
      + `<div class="ed-row">${field("X", num("x", b.x))}${field("Y", num("y", b.y))}</div>`
      + `<div class="ed-row">${field("Width", num("w", b.w, "min=10"))}${field("Height", num("h", b.h, "min=10"))}</div>`
      + `<div class="row ed-actions"><button class="btn" data-act="duplicate">Duplicate</button>`
      + `<button class="btn warn" data-act="delete">Delete building</button></div>`;
    return;
  }
  const s = draft.sections[selected.i];
  const sideways = s.o === "e" || s.o === "w";
  const taken = s.spots.filter((spot) => occupied[spot]);
  panel.innerHTML = `<h3>Section</h3>`
    + field("Title (optional)", `<input data-key="title" value="${esc(s.title || "")}" maxlength="40" placeholder="e.g. Trailer parking">`)
    + field("Type", `<select data-key="kind">${options(KIND_LABELS, s.kind)}</select>`)
    + field("Trailers point", `<select data-key="o">${options(DIRECTION_LABELS, s.o)}</select>`)
    + field("Spots, in order (comma or space separated)", `<textarea data-key="spots" rows="3">${esc(s.spots.join(", "))}</textarea>`)
    + `<div class="ed-fill">Fill: <input id="m-fill-prefix" value="${esc((s.spots[0] || "P").replace(/\d+$/, ""))}" size="3" aria-label="Prefix">
        <input id="m-fill-from" type="number" value="1" aria-label="From"> to
        <input id="m-fill-to" type="number" value="${s.spots.length}" aria-label="To">
        <label><input type="checkbox" id="m-fill-rev"> reverse</label>
        <button class="link" data-act="fill">Fill</button></div>`
    + (taken.length ? `<p class="hint">With trailers (must stay): ${taken.map(esc).join(", ")}</p>` : "")
    + `<div class="ed-row">${field("Spots per row", num("cols", s.cols, "min=1"))}${field("Spot width", num("cw", s.cw, "min=20"))}</div>`
    + `<div class="ed-row">${field("Spot length", num("sh", s.sh, "min=20"))}`
    + (sideways ? field("Spot height (sideways)", num("th", s.th ?? 40, "min=20")) : "") + `</div>`
    + `<div class="ed-row">${field("X", num("x", s.x))}${field("Y", num("y", s.y))}</div>`
    + field("Default status for new trailers", `<select data-key="defaultStatus">${options(Object.fromEntries(statuses.map((n) => [n, n])), s.defaultStatus)}</select>`)
    + field("Spot name in the sheet", `<input data-key="noun" value="${esc(s.noun)}" maxlength="30" placeholder="e.g. Parking spot">`)
    + `<div class="row ed-actions"><button class="btn" data-act="duplicate">Duplicate</button>`
    + `<button class="btn warn" data-act="delete">Delete section</button></div>`;
}

function select(type, i) {
  selected = type ? { type, i } : null;
  renderCanvas();
  renderPanel();
}

function current() {
  return selected.type === "section" ? draft.sections[selected.i] : draft.buildings[selected.i];
}

// A field in the panel changed: update the draft and redraw the canvas.
function onPanelInput(e) {
  const key = e.target.dataset.key;
  if (!key || !selected) return;
  const item = current();
  if (key === "spots") item.spots = e.target.value.toUpperCase().split(/[\s,;]+/).filter(Boolean);
  else if (e.target.type === "number") item[key] = Number(e.target.value);
  else item[key] = e.target.value;
  setDirty(true);
  renderCanvas();
  // Changing type or direction changes which fields apply.
  if (key === "o" || key === "kind") renderPanel();
}

function fillSpots() {
  const prefix = $("m-fill-prefix").value.trim().toUpperCase();
  const from = Number($("m-fill-from").value), to = Number($("m-fill-to").value);
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from || to - from > 500) return;
  const spots = Array.from({ length: to - from + 1 }, (_, k) => prefix + (from + k));
  if ($("m-fill-rev").checked) spots.reverse();
  current().spots = spots;
  setDirty(true);
  renderCanvas();
  renderPanel();
}

function onPanelClick(e) {
  const act = e.target.dataset.act;
  if (!act || !selected) return;
  if (act === "fill") return fillSpots();
  const list = selected.type === "section" ? draft.sections : draft.buildings;
  if (act === "delete") {
    if (!confirm(`Delete this ${selected.type}? (Nothing is saved until you press Save layout.)`)) return;
    list.splice(selected.i, 1);
    selected = null;
  } else if (act === "duplicate") {
    const copy = structuredClone(current());
    copy.x += 30;
    copy.y += 30;
    if (selected.type === "section") copy.spots = freeSpotNames(copy.spots.length, copy.spots[0]);
    list.push(copy);
    selected = { type: selected.type, i: list.length - 1 };
  }
  setDirty(true);
  renderCanvas();
  renderPanel();
}

// Spot names not used anywhere yet: the next numbers with the same prefix.
function freeSpotNames(count, example = "P1") {
  const prefix = example.replace(/\d+$/, "") || "P";
  const used = new Set(draft.sections.flatMap((s) => s.spots));
  const out = [];
  for (let n = 1; out.length < count; n++) if (!used.has(prefix + n)) out.push(prefix + n);
  return out;
}

// ---- Moving: drag with the mouse/finger, or arrow keys ----

let drag = null; // { item, startX, startY, x, y, el }

function onPointerDown(e) {
  const el = e.target.closest(".ed-item");
  if (!el) return;
  const { type, i } = el.dataset;
  if (selected?.type !== type || selected.i !== Number(i)) select(type, Number(i));
  const fresh = document.querySelector(`.ed-item[data-type="${type}"][data-i="${i}"]`);
  const item = current();
  drag = { item, startX: e.clientX, startY: e.clientY, x: item.x, y: item.y, el: fresh, moved: false };
  fresh.setPointerCapture?.(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e) {
  if (!drag) return;
  // The canvas is zoomed: screen pixels / zoom = map pixels. Snap to 2 px.
  const dx = Math.round((e.clientX - drag.startX) / zoom / 2) * 2;
  const dy = Math.round((e.clientY - drag.startY) / zoom / 2) * 2;
  if (!dx && !dy && !drag.moved) return;
  drag.moved = true;
  drag.item.x = drag.x + dx;
  drag.item.y = drag.y + dy;
  drag.el.style.left = drag.item.x + "px";
  drag.el.style.top = drag.item.y + "px";
}

function onPointerUp() {
  if (!drag) return;
  if (drag.moved) {
    setDirty(true);
    renderCanvas(); // the map may need to grow
    renderPanel();
  }
  drag = null;
}

function onKey(e) {
  if (!selected || $("tab-map").hidden) return;
  if (e.target.closest("input, textarea, select")) return;
  const step = e.shiftKey ? 10 : 1;
  const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (!move) return;
  e.preventDefault();
  const item = current();
  item.x += move[0];
  item.y += move[1];
  setDirty(true);
  renderCanvas();
  renderPanel();
}

// ---- Adding, saving, discarding, versions ----

// New items go below everything on the map, so they never land on top of something.
const freeY = () => layoutSize(draft.sections, draft.buildings).height - 10;

function addSection() {
  const spots = freeSpotNames(5, "P1");
  draft.sections.push({ title: null, kind: "park", defaultStatus: statuses.includes("Loaded") ? "Loaded" : statuses[0],
    noun: "Parking spot ", spots, o: "s", x: 20, y: freeY(), cols: 5, cw: 48, sh: 110, th: 50 });
  setDirty(true);
  select("section", draft.sections.length - 1);
}

function addBuilding() {
  draft.buildings.push({ label: null, x: 20, y: freeY(), w: 200, h: 120 });
  setDirty(true);
  select("building", draft.buildings.length - 1);
}

async function load() {
  const data = await request("/api/layout");
  draft = { sections: data.sections, buildings: data.buildings };
  statuses = data.statuses;
  occupied = data.occupied;
  selected = null;
  setDirty(false);
  renderCanvas();
  renderPanel();
  loadVersions();
}

async function save() {
  await request("/api/layout", draft);
  notice("Layout saved. Everyone's map shows it now.");
  await load();
}

async function loadVersions() {
  const { versions } = await request("/api/layout/versions");
  $("m-versions").innerHTML = versions.length
    ? versions.map((v) => `<li>Replaced ${formatTime(v.savedAt)}${v.savedBy ? ` by ${esc(v.savedBy)}` : ""}
        · <button class="link" data-restore="${v.id}">Restore this layout</button></li>`).join("")
    : "<li>None yet.</li>";
}

async function restore(id) {
  if (dirty && !confirm("You have unsaved changes. Throw them away and restore the earlier layout?")) return;
  if (!dirty && !confirm("Restore this earlier layout? The current one is kept as a version.")) return;
  await request("/api/layout/restore", { id });
  notice("Earlier layout restored.");
  await load();
}

export async function initMap() {
  $("m-scene").addEventListener("pointerdown", onPointerDown);
  $("m-street").addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  document.addEventListener("keydown", onKey);
  // Click on empty map: clear the selection.
  $("m-wrap").addEventListener("click", (e) => { if (!e.target.closest(".ed-item") && !drag) select(null); });
  $("m-pool").onclick = (e) => { if (e.target.dataset.pool) select("section", Number(e.target.dataset.pool)); };
  $("m-panel").addEventListener("input", onPanelInput);
  $("m-panel").addEventListener("click", onPanelClick);
  $("m-add-section").onclick = addSection;
  $("m-add-building").onclick = addBuilding;
  // Errors are already shown on the page; .catch keeps them out of the console.
  $("m-save").onclick = () => save().catch(() => {});
  $("m-discard").onclick = () => { if (confirm("Throw away your unsaved changes?")) load().catch(() => {}); };
  $("m-versions").onclick = (e) => { if (e.target.dataset.restore) restore(Number(e.target.dataset.restore)).catch(() => {}); };
  window.addEventListener("resize", () => draft && renderCanvas());
  window.addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });
  await load();
}
