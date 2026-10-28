// Drawing the yard: buildings and spots on the map, the side panel (Unassigned),
// street parking outside the fence, the legend and the search highlight.
// Clicks on spots are handled in main.js.
import { $, esc, dwell, showMsg, formatTime } from "./util.js";
import { yard, ui, statusStyle, carrierBadge } from "./store.js";
import { refit, setMapWidth } from "./zoom.js";
import { layoutSize } from "./geometry.js";

export function renderLegend() {
  $("legend-items").innerHTML = Object.entries(yard.statuses)
    .map(([name, color]) => `<span><i style="background:${color}"></i>${esc(name)}</span>`)
    .join("")
    + Object.entries(yard.carriers).map(([code, c]) => `<span>${carrierBadge(code)} ${esc(c.name)}</span>`).join("");
}

// ---- Layout: sections, spots and buildings ----
// Drawn again only when the layout itself changes (map editor). Trailers are
// added to the spots afterwards by updateTrailers().

// One spot: a door (with its door sign) or a parking/unassigned slot. The slot
// name (lbl) is hidden by CSS while a trailer stands there.
function spotHtml(section, index, spot) {
  let h = `<button class="bay" data-id="${esc(spot)}" data-s="${index}">`;
  if (section.kind === "door") h += `<span class="door"><span class="dr">${esc(spot)}</span></span>`;
  h += `<span class="stall">`;
  if (section.kind !== "door") h += `<span class="lbl">${esc(spot)}</span>`;
  return h + `</span></button>`;
}

function sectionHtml(s, index) {
  const vars = `--th:${s.th || 40}px;left:${s.x}px;top:${s.y}px;--cols:${s.cols};--cw:${s.cw}px;--sh:${s.sh}px`;
  return `<div class="sec o-${s.o}" style="${vars}">`
    + (s.title ? `<h2>${esc(s.title)}</h2>` : "")
    + `<div class="grid${s.kind !== "door" ? " pkg" : ""}">`
    + s.spots.map((spot) => spotHtml(s, index, spot)).join("")
    + `</div></div>`;
}

function renderLayout() {
  // Unassigned ("pool") sections go in the side panel, street parking below the
  // fence, everything else on the map.
  let map = "", side = "", street = "";
  yard.sections.forEach((s, i) => {
    if (s.kind === "pool") side += sectionHtml(s, i);
    else if (s.kind === "street") street += sectionHtml(s, i);
    else map += sectionHtml(s, i);
  });
  $("buildings").innerHTML = yard.buildings.map((b) =>
    `<div class="bld${b.label ? " hall" : ""}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">${esc(b.label || "")}</div>`
  ).join("");
  $("map").innerHTML = map;
  $("street-map").innerHTML = street;
  $("street").hidden = !street;
  $("side").innerHTML = side;
  $("side").hidden = !side;
  sizeScenes();
  refit(); // the side panel's width changes the room left for the map
}

// ---- Trailers ----
// Each trailer element is kept and updated in place while it stays on its
// spot, so color changes can fade. When something changes, the difference is
// animated: a moved trailer glides from its old spot, a new one pops in, a
// departed one fades out. Devices set to "reduce motion" get no animation.

const calm = matchMedia("(prefers-reduced-motion: reduce)");
const EASE = "cubic-bezier(.2, .8, .2, 1)";

// The trailer's inside: plate (filled in with textContent), carrier badge,
// damaged sign, and the dwell time or a red "late" marker.
function trailerInside(t) {
  const late = t.expectedDeparture && t.expectedDeparture < Date.now();
  const time = late
    ? `<span class="late" title="Planned to leave ${formatTime(t.expectedDeparture)}">late ${dwell(t.expectedDeparture)}</span>`
    : `<span>${dwell(t.since)}</span>`;
  return `<b class="tr"></b><i class="dw">${carrierBadge(t.carrier)}${t.damaged ? "<span>⚠</span>" : ""}${time}</i>`;
}

// Everything that changes how a trailer looks; if it is the same, nothing is touched.
const trailerKey = (t) => [t.plate, t.status, t.damaged, t.carrier, trailerInside(t), yard.statuses[t.status]].join("|");

// Where each trailer is on screen now: plate -> { rect, area }.
// area: the map, the side panel or the street; gliding only works within one.
function trailerPositions() {
  const out = new Map();
  for (const el of document.querySelectorAll(".trl:not(.leaving)")) {
    out.set(el.dataset.plate, { rect: el.getBoundingClientRect(), area: el.closest(".scene, .side") });
  }
  return out;
}

const zoomOf = (el) => parseFloat(el.closest(".scene")?.style.zoom) || 1;

function glide(el, from) {
  const to = el.getBoundingClientRect();
  // Screen pixels / zoom = pixels inside the (zoomed) map.
  const dx = (from.left - to.left) / zoomOf(el), dy = (from.top - to.top) / zoomOf(el);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
    { duration: 550, easing: EASE });
}

function popIn(el) {
  el.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }],
    { duration: 350, easing: EASE });
}

// Fade a departed trailer out, then remove it.
function fadeOut(el) {
  el.classList.add("leaving");
  el.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.8)" }], { duration: 300, easing: "ease-in" })
    .finished.then(() => el.remove(), () => el.remove());
}

let firstRender = true;

function updateTrailers(before) {
  const changed = [];
  const animate = !firstRender && !calm.matches;
  const stillHere = new Set(Object.values(yard.placements).map((t) => t.plate));
  for (const bay of document.querySelectorAll(".bay")) {
    const spot = bay.dataset.id;
    const t = yard.placements[spot];
    let el = bay.querySelector(".trl:not(.leaving)");
    // A different trailer (or none) here now: the old one moved away or left.
    if (el && (!t || el.dataset.plate !== t.plate)) {
      if (stillHere.has(el.dataset.plate) || !animate) el.remove();
      else fadeOut(el);
      el = null;
    }
    bay.classList.toggle("taken", !!t);
    bay.classList.toggle("lift", !!t && spot === ui.moving);
    if (!t) continue;

    const isNew = !el;
    if (isNew) {
      el = document.createElement("span");
      el.dataset.plate = t.plate;
      bay.querySelector(".stall").append(el);
    }
    const key = trailerKey(t);
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.className = "trl" + (t.damaged ? " dmg" : "");
      el.style.cssText = statusStyle(t.status);
      el.innerHTML = trailerInside(t);
      el.querySelector(".tr").textContent = t.plate;
      changed.push(el);
    }
    if (isNew && animate) {
      const old = before.get(t.plate);
      if (old && old.area === el.closest(".scene, .side")) glide(el, old.rect);
      else popIn(el);
    }
  }
  fitNumbers(changed);
  firstRender = false;
}

let layoutKey = "";

export function render() {
  const before = trailerPositions();
  // Only redraw the spots themselves when the layout changed.
  const key = JSON.stringify([yard.sections, yard.buildings]);
  if (key !== layoutKey) {
    layoutKey = key;
    renderLayout();
  }
  updateTrailers(before);

  const total = yard.sections.reduce((n, s) => n + s.spots.length, 0);
  $("count").textContent = `${Object.keys(yard.placements).length} of ${total} spots in use`;
  highlightSearch(false);
  if (ui.moving && !$("q").value) {
    showMsg(`Moving ${yard.placements[ui.moving].plate}: tap an open spot to place it, or tap it again to cancel`);
  }
  if (ui.arriving && !$("q").value) {
    showMsg(`${ui.arriving.plate} arrived: tap an open spot for it (Esc to cancel)`);
  }
}

// The map and the street strip are as big as the layout needs; the zoom fits
// the map's width to the screen.
function sizeScenes() {
  const { width, height, streetHeight } = layoutSize(yard.sections, yard.buildings);
  setMapWidth(width);
  for (const [id, h] of [["scene", height], ["street-scene", streetHeight]]) {
    $(id).style.width = width + "px";
    $(id).style.height = h + "px";
  }
}

// Plates start large and shrink only as much as needed to fit their spot.
// Only the length of the text counts (height for upright trailers, width for
// sideways ones): across the text, bold letters always stick out of their line
// a little, which must not make the plate shrink.
const PLATE_MAX = 21, PLATE_MIN = 9;
function fitNumbers(trailers) {
  for (const trl of trailers) {
    const el = trl.querySelector(".tr");
    const upright = getComputedStyle(el).writingMode.startsWith("vertical");
    const tooLong = () => (upright ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1);
    let size = PLATE_MAX;
    el.style.fontSize = size + "px";
    while (size > PLATE_MIN && tooLong()) el.style.fontSize = --size + "px";
  }
}

// Highlight trailers whose plate, trailer ID, carrier or note contains the search text.
// scroll: bring the first match into view (only while the user is typing).
export function highlightSearch(scroll) {
  const q = $("q").value.trim().toUpperCase();
  let first = null, count = 0;
  for (const b of document.querySelectorAll(".bay")) {
    const t = yard.placements[b.dataset.id];
    const hit = !!(q && t && [t.plate, t.trailerId, t.note, t.carrier, yard.carriers[t.carrier]?.name].some((text) => (text || "").toUpperCase().includes(q)));
    b.classList.toggle("hit", hit);
    if (hit) { count++; first = first || b; }
  }
  if (!q) showMsg("");
  else if (!count) {
    // Not on the map: offer the trailer's past visits (handled in main.js).
    $("msg").innerHTML = `No match for “${esc(q)}” on the map. <button class="link" data-tr="${esc(q)}">Past visits</button>`;
  } else {
    showMsg(count + " found");
    if (scroll) first.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }
}
