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

// One spot: a door (with its door sign) or a parking/unassigned slot, with the
// trailer on it if there is one. The plate (reg. number) is filled in afterwards
// with textContent.
function spotHtml(section, index, spot) {
  const t = yard.placements[spot];
  let h = `<button class="bay${t ? " taken" : ""}" data-id="${esc(spot)}" data-s="${index}">`;
  if (section.kind === "door") h += `<span class="door"><span class="dr">${esc(spot)}</span></span>`;
  h += `<span class="stall">`;
  if (section.kind !== "door" && !t) h += `<span class="lbl">${esc(spot)}</span>`;
  if (t) {
    // Past its planned departure: the dwell time turns into a red "late" marker.
    const late = t.expectedDeparture && t.expectedDeparture < Date.now();
    const time = late
      ? `<span class="late" title="Planned to leave ${formatTime(t.expectedDeparture)}">late ${dwell(t.expectedDeparture)}</span>`
      : `<span>${dwell(t.since)}</span>`;
    h += `<span class="trl${t.damaged ? " dmg" : ""}" style="${statusStyle(t.status)}">`
      + `<b class="tr"></b><i class="dw">${carrierBadge(t.carrier)}${t.damaged ? "<span>⚠</span>" : ""}${time}</i></span>`;
  }
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

export function render() {
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

  for (const b of document.querySelectorAll(".bay")) {
    const t = yard.placements[b.dataset.id];
    if (t) b.querySelector(".tr").textContent = t.plate;
    if (b.dataset.id === ui.moving) b.classList.add("lift");
  }
  fitNumbers();

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
function fitNumbers() {
  for (const el of document.querySelectorAll(".trl .tr")) {
    let size = 18;
    el.style.fontSize = size + "px";
    while (size > 9 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
      el.style.fontSize = --size + "px";
    }
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
