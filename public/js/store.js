// The yard as last received from the server, plus page state shared between modules.
import { esc, textColor } from "./util.js";

export const yard = {
  sections: [],   // layout: [{ title, kind, spots: [...], x, y, ... }]
  statuses: {},   // { "Loading": "#f2a516", ... }
  placements: {}, // { spotId: { plate, trailerId, carrier, status, note, damaged, since } }
  carriers: {},   // { "DSV": { name: "DSV", color: "#0b3d91" }, ... }
  buildings: [],  // grey warehouse blocks: [{ label, x, y, w, h }]
  incoming: [],   // expected arrivals: [{ id, plate, trailerId, carrier, expectedAt, note }]
};

export const ui = {
  user: null,   // logged-in user: { name, username, role }
  moving: null, // spot ID of the trailer lifted with "Move", waiting for a target
  arriving: null, // Incoming entry being placed: tap an open spot for it
  busy: false,  // a request to the server is in progress
};

// Roles, lowest first; each can do everything the ones before it can.
// The server checks the same rules; this only decides which buttons to show.
const ROLES = ["viewer", "worker", "operator", "admin"];
export const can = (role) => ROLES.indexOf(ui.user?.role) >= ROLES.indexOf(role);

const listeners = [];
export const onYardChange = (fn) => listeners.push(fn);

// Called with every state the server sends (live updates and replies).
export function setYard(state) {
  yard.sections = state.sections;
  yard.buildings = state.buildings;
  yard.incoming = state.incoming;
  yard.placements = state.placements;
  yard.statuses = Object.fromEntries(state.statuses.map((s) => [s.name, s.color]));
  yard.carriers = Object.fromEntries(state.carriers.map((c) => [c.code, { name: c.name, color: c.color }]));
  if (ui.moving && !yard.placements[ui.moving]) ui.moving = null; // someone else moved it
  if (ui.arriving && !yard.incoming.some((e) => e.id === ui.arriving.id)) ui.arriving = null; // placed by someone else
  listeners.forEach((fn) => fn());
}

// CSS variables for a status color and readable text on top of it.
export function statusStyle(name) {
  const color = yard.statuses[name] || "#8b93a5";
  return `--c:${color};--fg:${textColor(color)}`;
}

export const sectionOf = (spot) => yard.sections.find((s) => s.spots.includes(spot));

// Carrier badge, e.g. a small purple "INT"; empty if the carrier is unknown.
export function carrierBadge(code) {
  const c = yard.carriers[code];
  if (!c) return "";
  return `<b class="cr" style="--cc:${c.color};--cf:${textColor(c.color)}" title="${esc(c.name)}">${esc(code)}</b>`;
}

// "Door 201", "Parking spot 5", "Unassigned slot 3", "Street spot 2".
export function spotName(spot) {
  const s = sectionOf(spot);
  if (!s) return "spot " + spot;
  return `${s.noun.trim()} ${/^[PUS]\d+$/.test(spot) ? spot.slice(1) : spot}`;
}
