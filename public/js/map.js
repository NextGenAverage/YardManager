// Drawing the yard: buildings and spots on the map, the side panel (Unassigned),
// street parking below the gate, the legend and the search highlight. Clicks on spots are handled in main.js.
import { $, esc, dwell, showMsg } from "./util.js";
import { yard, ui, statusStyle, carrierBadge } from "./store.js";
import { refit, setMapWidth } from "./zoom.js";

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
    h += `<span class="trl${t.damaged ? " dmg" : ""}" style="${statusStyle(t.status)}">`
      + `<b class="tr"></b><i class="dw">${carrierBadge(t.carrier)}<span>${t.damaged ? "⚠ " : ""}${dwell(t.since)}</span></i></span>`;
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
  // gate, everything else on the map.
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
}

// The outer edges of a section in px: title, rows of spots, door strip.
function sectionBox(s) {
  const rows = Math.ceil(s.spots.length / s.cols);
  const sideways = s.o === "e" || s.o === "w";
  const rowHeight = sideways ? s.th || 40 : s.sh + (s.kind === "door" ? 28 : 0);
  return { right: s.x + s.cols * s.cw + 6, bottom: s.y + (s.title ? 18 : 0) + rows * rowHeight + 6 };
}

// The map is as wide and tall as its sections and buildings reach; the street
// strip as tall as its sections. The zoom fits the map's width to the screen.
function sizeScenes() {
  let right = 0, bottom = 0, streetRight = 0, streetBottom = 0;
  for (const s of yard.sections) {
    if (s.kind === "pool") continue;
    const box = sectionBox(s);
    if (s.kind === "street") {
      streetRight = Math.max(streetRight, box.right);
      streetBottom = Math.max(streetBottom, box.bottom);
    } else {
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }
  }
  for (const b of yard.buildings) {
    right = Math.max(right, b.x + b.w);
    bottom = Math.max(bottom, b.y + b.h);
  }
  const width = Math.max(800, right + 20, streetRight + 20);
  setMapWidth(width);
  for (const [id, height] of [["scene", Math.max(600, bottom + 20)], ["street-scene", streetBottom + 10]]) {
    $(id).style.width = width + "px";
    $(id).style.height = height + "px";
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
