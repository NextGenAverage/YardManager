// Map zoom. Automatic ("Fit"): PCs and tablets fill the screen width (scroll
// down for the rest); phones show the map at full size and pan. A zoom picked
// with + / − is remembered on this device.
import { $ } from "./util.js";

const STORAGE_KEY = "yard-zoom";
let mapWidth = 1560; // width of the map drawing in px at zoom 1; set by map.js from the layout

let zoom = 1;
let auto = true;

// The map and the street strip below it always share one zoom.
function setZoom(value) {
  zoom = Math.max(0.3, Math.min(2.2, value));
  for (const scene of document.querySelectorAll(".scene")) scene.style.zoom = zoom;
}

export function setMapWidth(width) {
  mapWidth = width;
}

function remember(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// shrinkPhone: on phones, also shrink to the screen width (the Fit button).
function fit(shrinkPhone) {
  const w = $("pan").clientWidth;
  if (w >= 700 || shrinkPhone) setZoom(w / mapWidth);
  else setZoom(1);
}

// Re-fit after the room for the map changed, unless the user picked a zoom.
export function refit() {
  if (auto) fit();
}

// The side panel sticks below the header, so it needs the header's height.
function measureHeader() {
  document.documentElement.style.setProperty("--hh", document.querySelector("header").offsetHeight + "px");
}

export function initZoom() {
  $("zoom-in").onclick = () => { auto = false; setZoom(zoom + 0.15); remember(zoom); };
  $("zoom-out").onclick = () => { auto = false; setZoom(zoom - 0.15); remember(zoom); };
  $("zoom-fit").onclick = () => { auto = true; remember(null); fit(true); };
  window.addEventListener("resize", () => { measureHeader(); refit(); });
  measureHeader();

  // The street strip below the map scrolls sideways together with the map.
  const pans = [$("pan"), $("street-pan")];
  for (const pan of pans) {
    pan.addEventListener("scroll", () => {
      for (const other of pans) if (other !== pan && other.scrollLeft !== pan.scrollLeft) other.scrollLeft = pan.scrollLeft;
    });
  }

  let saved = 0;
  try { saved = Number(localStorage.getItem(STORAGE_KEY)); } catch {}
  if (saved) { auto = false; setZoom(saved); }
  refit();
}
