// Manage page, Trailers tab: the register linking each reg. number to its
// trailer ID and carrier. Search, add, change, delete, and import from CSV.
import { $, esc, formatTime } from "./util.js";

let carriers = []; // [{ code, name, color }]

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

const carrierOptions = (selected) => `<option value="">–</option>`
  + carriers.map((c) => `<option value="${esc(c.code)}"${c.code === selected ? " selected" : ""}>${esc(c.code)} (${esc(c.name)})</option>`).join("");

function rowHtml(t) {
  const changed = formatTime(t.updatedAt) + (t.updatedBy ? ` by ${esc(t.updatedBy)}` : "");
  return `<tr data-plate="${esc(t.plate)}" data-id="${esc(t.trailerId)}" data-carrier="${esc(t.carrier || "")}">
    <td><b>${esc(t.plate)}</b></td>
    <td><input class="cell-input" value="${esc(t.trailerId)}" maxlength="60" aria-label="Trailer ID"></td>
    <td><select class="cell-select" aria-label="Carrier">${carrierOptions(t.carrier)}</select></td>
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

// Show "Save" only on rows that were edited.
function markEdited(row) {
  const id = row.querySelector("input").value.trim();
  const carrier = row.querySelector("select").value;
  row.querySelector("[data-save]").hidden = id === row.dataset.id && carrier === row.dataset.carrier;
}

async function save(row) {
  const plate = row.dataset.plate;
  const trailerId = row.querySelector("input").value.trim();
  const carrier = row.querySelector("select").value || null;
  if (!trailerId || !confirm(`Change the link for ${plate} to trailer ID ${trailerId}, carrier ${carrier || "–"}?`)) return;
  await request("/api/trailers", { plate, trailerId, carrier });
  notice(`${plate} is now linked to ${trailerId}${carrier ? ` (${carrier})` : ""}.`);
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
  const plate = form.plate.value.trim().toUpperCase().replace(/\s+/g, "");
  const trailerId = form.trailerId.value.trim();
  const carrier = form.carrier.value || null;
  const existing = (await request(`/api/trailers/${encodeURIComponent(plate)}`)).trailer;
  if (existing && !confirm(`${plate} is already linked to ${existing.trailerId}. Change it to ${trailerId}?`)) return;
  await request("/api/trailers", { plate, trailerId, carrier });
  notice(`${plate} linked to ${trailerId}.`);
  form.reset();
  load();
}

// ---- CSV import: read the file, show a preview, import on confirmation ----
// Conflicts (a reg. number listed more than once with different details) are
// shown one by one: skip it, use one of its lines, or edit the details by hand.

let csvText = "";
let conflicts = []; // from the preview: [{ plate, lines: [{ line, trailerId, carrier }], register }]

const describeLink = (trailerId, carrier) => `${esc(trailerId)} · ${esc(carrier || "no carrier")}`;

function conflictHtml(c, i) {
  const first = c.lines[0];
  const now = c.register ? `<small>Now in the register: ${describeLink(c.register.trailerId, c.register.carrier)}</small>` : "";
  return `<fieldset class="conflict" data-i="${i}">
    <legend><b>${esc(c.plate)}</b> ${now}</legend>
    <label><input type="radio" name="c${i}" value="skip" checked> Skip</label>
    ${c.lines.map((l, k) => `<label><input type="radio" name="c${i}" value="line:${k}"> Use line ${l.line}: ${describeLink(l.trailerId, l.carrier)}</label>`).join("")}
    <label><input type="radio" name="c${i}" value="edit"> Edit:</label>
    <span class="conflict-edit" hidden>
      <input class="cell-input" value="${esc(first.trailerId)}" maxlength="60" aria-label="Trailer ID">
      <select class="cell-select" aria-label="Carrier">${carrierOptions(first.carrier)}</select>
    </span>
  </fieldset>`;
}

function previewHtml(p) {
  const s = p.summary;
  let h = `<p><b>${s.added}</b> new, <b>${s.changed}</b> changed, ${s.unchanged} unchanged`
    + (s.conflicts ? `, <b>${s.conflicts} conflict${s.conflicts === 1 ? "" : "s"}</b> to decide` : "")
    + (s.skipped ? `, <b class="danger-text">${s.skipped} skipped</b>` : "") + ".</p>";
  if (p.conflicts.length) {
    h += `<h4>Conflicts: these reg. numbers are listed more than once with different details</h4>
      <p class="bulk">Set all to:
        <button class="link" data-bulk="skip">Skip</button> ·
        <button class="link" data-bulk="first">First line</button> ·
        <button class="link" data-bulk="last">Last line</button>
      </p>
      <div class="conflicts">${p.conflicts.map(conflictHtml).join("")}</div>`;
  }
  if (p.examples.changes.length) {
    h += "<h4>Changes</h4><ul class='plain'>" + p.examples.changes.map((c) =>
      `<li><b>${esc(c.plate)}</b>: ${esc(c.oldTrailerId)} ${esc(c.oldCarrier || "–")} → ${esc(c.trailerId)} ${esc(c.carrier || "–")}</li>`
    ).join("") + (s.changed > p.examples.changes.length ? `<li>… and ${s.changed - p.examples.changes.length} more</li>` : "") + "</ul>";
  }
  if (p.examples.added.length) {
    h += "<h4>New (first 20)</h4><ul class='plain'>" + p.examples.added.map((a) =>
      `<li><b>${esc(a.plate)}</b>: ${esc(a.trailerId)} ${esc(a.carrier || "–")}</li>`).join("") + "</ul>";
  }
  if (p.errors.length) {
    h += "<h4>Skipped</h4><ul class='plain danger-text'>" + p.errors.map((e) => `<li>${esc(e)}</li>`).join("") + "</ul>";
  }
  if (p.warnings.length) {
    h += "<h4>Check</h4><ul class='plain'>" + p.warnings.map((w) => `<li>${esc(w)}</li>`).join("") + "</ul>";
  }
  const canImport = s.added + s.changed + s.conflicts > 0;
  h += `<div class="row import-actions">
    <button class="btn" data-import-cancel>Cancel</button>
    ${canImport ? `<button class="btn pri" data-import-apply>Import</button>` : ""}
  </div>`;
  return h;
}

// The user's choice for each conflict: { PLATE: { trailerId, carrier } }; skipped ones are left out.
function collectResolutions() {
  const out = {};
  for (const box of document.querySelectorAll("#t-preview .conflict")) {
    const c = conflicts[box.dataset.i];
    const choice = box.querySelector("input[type=radio]:checked").value;
    if (choice.startsWith("line:")) {
      const l = c.lines[Number(choice.slice(5))];
      out[c.plate] = { trailerId: l.trailerId, carrier: l.carrier };
    } else if (choice === "edit") {
      out[c.plate] = {
        trailerId: box.querySelector(".conflict-edit input").value.trim(),
        carrier: box.querySelector(".conflict-edit select").value || null,
      };
    }
  }
  return out;
}

function setAllConflicts(which) {
  for (const box of document.querySelectorAll("#t-preview .conflict")) {
    const n = conflicts[box.dataset.i].lines.length;
    const value = which === "skip" ? "skip" : `line:${which === "first" ? 0 : n - 1}`;
    box.querySelector(`input[value="${value}"]`).checked = true;
    box.querySelector(".conflict-edit").hidden = true;
  }
}

// Excel saves CSV either as UTF-8 or in the older Windows encoding (e.g. "ø"
// as one byte). Use UTF-8 if the file is valid UTF-8, otherwise Windows-1252.
async function readFileText(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

async function previewFile(file) {
  csvText = await readFileText(file);
  $("t-preview").innerHTML = "<p>Reading…</p>";
  try {
    const p = await request("/api/trailers/import", { csv: csvText, apply: false });
    conflicts = p.conflicts;
    $("t-preview").innerHTML = previewHtml(p);
  } catch {
    $("t-preview").innerHTML = "";
  }
}

async function applyImport() {
  const resolutions = collectResolutions();
  const empty = Object.entries(resolutions).find(([, r]) => !r.trailerId);
  if (empty) {
    $("t-error").textContent = `${empty[0]}: enter a trailer ID or choose another option.`;
    return;
  }
  const r = await request("/api/trailers/import", { csv: csvText, apply: true, resolutions });
  const s = r.summary;
  const skippedConflicts = s.conflicts - s.conflictsResolved;
  notice(`Imported: ${s.added} new, ${s.changed} changed`
    + (s.conflictsResolved ? ` (incl. ${s.conflictsResolved} conflict${s.conflictsResolved === 1 ? "" : "s"} you decided)` : "")
    + (skippedConflicts ? `, ${skippedConflicts} conflict${skippedConflicts === 1 ? "" : "s"} skipped` : "")
    + (s.skipped ? `, ${s.skipped} line${s.skipped === 1 ? "" : "s"} skipped` : "") + ".");
  cancelImport();
  load();
}

function cancelImport() {
  csvText = "";
  conflicts = [];
  $("t-file").value = "";
  $("t-preview").innerHTML = "";
}

export async function initTrailers() {
  carriers = (await request("/api/yard")).carriers;
  $("t-add").carrier.innerHTML = carrierOptions(null).replace("–", "Carrier…");

  $("t-q").oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  };
  $("t-rows").oninput = (e) => markEdited(e.target.closest("tr"));
  $("t-rows").onchange = (e) => markEdited(e.target.closest("tr"));
  // Errors are already shown on the page; .catch keeps them out of the console.
  $("t-rows").onclick = (e) => {
    const row = e.target.closest("tr");
    if (e.target.matches("[data-save]")) save(row).catch(() => {});
    if (e.target.matches("[data-delete]")) remove(row).catch(() => {});
  };
  $("t-add").onsubmit = (e) => {
    e.preventDefault();
    add(e.target).catch(() => {});
  };
  $("t-file").onchange = () => { if ($("t-file").files[0]) previewFile($("t-file").files[0]); };
  $("t-preview").onclick = (e) => {
    if (e.target.matches("[data-import-apply]")) applyImport().catch(() => {});
    if (e.target.matches("[data-import-cancel]")) cancelImport();
    if (e.target.dataset.bulk) setAllConflicts(e.target.dataset.bulk);
  };
  // Show the Trailer ID / carrier fields only when "Edit" is chosen.
  $("t-preview").onchange = (e) => {
    const box = e.target.closest(".conflict");
    if (box && e.target.type === "radio") box.querySelector(".conflict-edit").hidden = e.target.value !== "edit";
  };
  load();
}
