// Manage page: picks the tabs this user may see and shows the one in the
// address (#trailers, #map, ...). Each tab has its own module.
import { $ } from "./util.js";
import { initTrailers } from "./manage-trailers.js";
import { initUsers } from "./manage-users.js";
import { initCarriers } from "./manage-carriers.js";
import { initMap } from "./manage-map.js";

// Which role each tab needs (the server checks the same).
const TABS = { trailers: "operator", map: "admin", carriers: "admin", users: "admin" };
const ROLES = ["viewer", "worker", "operator", "admin"];

const me = await fetch("/api/me").then((r) => (r.ok ? r.json() : null)).catch(() => null);
if (!me) {
  location.href = "/login.html";
  throw new Error("Not logged in"); // stop here while the browser navigates
}
const allowed = Object.keys(TABS).filter((tab) => ROLES.indexOf(me.user.role) >= ROLES.indexOf(TABS[tab]));

const started = {};
function show() {
  const wanted = location.hash.slice(1);
  const tab = allowed.includes(wanted) ? wanted : allowed[0];
  $("no-access").hidden = !!tab;
  for (const link of document.querySelectorAll("#tabs a")) {
    link.hidden = !allowed.includes(link.dataset.tab);
    link.classList.toggle("on", link.dataset.tab === tab);
  }
  for (const name of Object.keys(TABS)) $("tab-" + name).hidden = name !== tab;
  if (tab && !started[tab]) {
    started[tab] = true;
    ({ trailers: initTrailers, map: initMap, carriers: initCarriers, users: initUsers })[tab]();
  }
}
window.addEventListener("hashchange", show);
show();
