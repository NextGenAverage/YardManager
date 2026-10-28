// Manage page, Trailers tab: the register linking each reg. number to its
// trailer ID. Search, add, change and delete links.
import { $, esc, formatTime } from "./util.js";

async function request(path, body) {
  $("t-error").textContent = "";
  const res = await fetch(path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {});
  if (res.status === 401) location.href = "/login.html";
  const json = await res.json();
  if (!res.ok) {
    $("t-error").textContent = json.error || "Something went wrong.";
    throw new Error(json.error);
  }
  return json;
}

function notice(text) {
  $("t-notice").hidden = false;
  $("t-notice").textContent = text;
}

function rowHtml(t) {
  const changed = formatTime(t.updatedAt) + (t.updatedBy ? ` by ${esc(t.updatedBy)}` : "");
  return `<tr data-plate="${esc(t.plate)}" data-id="${esc(t.trailerId)}">
    <td><b>${esc(t.plate)}</b></td>
    <td><input class="cell-input" value="${esc(t.trailerId)}" maxlength="60" aria-label="Trailer ID"></td>
    <td>${t.spot ? esc(t.spot) : "–"}</td>
    <td>${changed}</td>
    <td>
      <button class="link" data-save hidden>Save</button>
      <button class="link danger" data-delete>Delete</button>
    </td>
  </tr>`;
}

let searchTimer;
async function load() {
  const q = $("t-q").value.trim();
  const { trailers, total } = await request("/api/trailers?" + new URLSearchParams({ q }));
  $("t-rows").innerHTML = trailers.map(rowHtml).join("");
  $("t-count").textContent = total > trailers.length
    ? `Showing ${trailers.length} of ${total}. Search to narrow it down.`
    : `${total} reg. number${total === 1 ? "" : "s"}`;
}

async function save(row) {
  const plate = row.dataset.plate;
  const trailerId = row.querySelector("input").value.trim();
  const msg = `Link ${plate} to trailer ID ${trailerId} instead of ${row.dataset.id}?`;
  if (!trailerId || !confirm(msg)) return;
  await request("/api/trailers", { plate, trailerId });
  notice(`${plate} is now linked to ${trailerId}.`);
  load();
}

async function remove(row) {
  const plate = row.dataset.plate;
  if (!confirm(`Delete the link for ${plate}? The next time it arrives, its trailer ID must be entered again.`)) return;
  await request("/api/trailers/delete", { plate });
  notice(`${plate} removed from the register.`);
  load();
}

async function add(form) {
  const plate = form.plate.value.trim().toUpperCase();
  const trailerId = form.trailerId.value.trim();
  const existing = (await request(`/api/trailers/${encodeURIComponent(plate)}`)).trailer;
  if (existing && !confirm(`${plate} is already linked to ${existing.trailerId}. Change it to ${trailerId}?`)) return;
  await request("/api/trailers", { plate, trailerId });
  notice(`${plate} linked to ${trailerId}.`);
  form.reset();
  load();
}

export function initTrailers() {
  $("t-q").oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  };
  // Show "Save" only on rows whose trailer ID was edited.
  $("t-rows").oninput = (e) => {
    const row = e.target.closest("tr");
    row.querySelector("[data-save]").hidden = e.target.value.trim() === row.dataset.id;
  };
  $("t-rows").onclick = (e) => {
    const row = e.target.closest("tr");
    if (e.target.matches("[data-save]")) save(row).catch(() => {});
    if (e.target.matches("[data-delete]")) remove(row).catch(() => {});
  };
  $("t-add").onsubmit = (e) => {
    e.preventDefault();
    add(e.target).catch(() => {}); // errors are already shown on the page
  };
  load();
}
