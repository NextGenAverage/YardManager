// Importing the day's arrivals from an Excel or CSV file into the Incoming list
// (in the Incoming panel, operators). The server reads the file and guesses
// which column is which; the preview lets the user change that ("Reg. number:
// [column]") and shows what will happen to each truck before anything is saved.
import { $, esc, formatTime } from "./util.js";
import { carrierBadge } from "./store.js";

const FIELD_LABELS = {
  plate: "Reg. number", time: "Expected time", date: "Date (if separate)",
  trailerId: "Trailer ID", carrier: "Carrier", note: "Note",
};
const ACTION_LABELS = { new: "New", update: "Update", same: "No change", "in yard": "In yard" };

let file = "";     // the chosen file as base64
let columns = null; // the user's column choice in this preview: { field: name or null }

async function request(body) {
  $("in-error").textContent = "";
  const res = await fetch("/api/incoming/import", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (res.status === 401) location.href = "/login.html";
  const json = await res.json();
  if (!res.ok) {
    $("in-error").textContent = json.error || "Something went wrong.";
    throw new Error(json.error);
  }
  return json;
}

const readBase64 = (f) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(f);
});

function columnPicker(p) {
  const options = (field) => `<option value="">– not used –</option>`
    + p.header.map((h) => `<option${p.columns[field] === h ? " selected" : ""}>${esc(h)}</option>`).join("");
  return `<div class="col-pick">${Object.entries(FIELD_LABELS).map(([field, label]) =>
    `<label>${label}<select data-field="${field}">${options(field)}</select></label>`).join("")}</div>`;
}

function previewHtml(p) {
  const s = p.summary;
  let h = `<h4>Columns in the file</h4>${columnPicker(p)}`;
  h += `<p><b>${s.added}</b> new, <b>${s.updated}</b> updated, ${s.unchanged} unchanged`
    + (s.skipped ? `, <b class="danger-text">${s.skipped} skipped</b>` : "") + ".</p>";
  if (p.rows.length) {
    h += `<div class="table-wrap"><table class="in-table"><thead><tr><th>Reg. number</th><th>Expected</th><th></th><th></th></tr></thead><tbody>`
      + p.rows.map((r) => `<tr class="act-${r.action.replace(" ", "-")}">
          <td><b>${esc(r.plate)}</b> ${carrierBadge(r.carrier)}${r.trailerId ? `<small>${esc(r.trailerId)}</small>` : ""}</td>
          <td>${formatTime(r.expectedAt)}${r.action === "update" && r.oldExpectedAt !== r.expectedAt ? `<small>was ${formatTime(r.oldExpectedAt)}</small>` : ""}</td>
          <td>${r.note ? esc(r.note) : ""}</td>
          <td><span class="act">${ACTION_LABELS[r.action]}</span></td></tr>`).join("")
      + `</tbody></table></div>`;
  }
  if (p.errors.length) h += "<h4>Skipped</h4><ul class='plain danger-text'>" + p.errors.map((e) => `<li>${esc(e)}</li>`).join("") + "</ul>";
  if (p.warnings.length) h += "<h4>Check</h4><ul class='plain'>" + p.warnings.map((w) => `<li>${esc(w)}</li>`).join("") + "</ul>";
  const work = s.added + s.updated;
  h += `<div class="row import-actions">
    <button class="btn" type="button" data-cancel>Cancel</button>
    ${work ? `<button class="btn pri" type="button" data-apply>Import ${work} truck${work === 1 ? "" : "s"}</button>` : ""}
  </div>`;
  return h;
}

async function preview() {
  $("in-preview").innerHTML = "<p>Reading…</p>";
  try {
    const p = await request({ file, columns, apply: false });
    columns = p.columns;
    $("in-preview").innerHTML = previewHtml(p);
  } catch {
    $("in-preview").innerHTML = "";
  }
}

async function apply() {
  const r = await request({ file, columns, apply: true });
  const s = r.summary;
  $("in-notice").hidden = false;
  $("in-notice").textContent = `Imported: ${s.added} new, ${s.updated} updated`
    + (s.skipped ? `, ${s.skipped} skipped` : "") + ". The column choice is saved for next time.";
  cancel();
}

function cancel() {
  file = "";
  columns = null;
  $("in-file").value = "";
  $("in-preview").innerHTML = "";
}

export function initArrivalsImport() {
  $("in-file").onchange = async () => {
    const f = $("in-file").files[0];
    if (!f) return;
    $("in-notice").hidden = true;
    file = await readBase64(f);
    columns = null; // use the saved choice (or a guess) for a new file
    preview();
  };
  // Choosing another column: preview again with that choice.
  $("in-preview").onchange = (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    columns = { ...columns, [field]: e.target.value || null };
    preview();
  };
  $("in-preview").onclick = (e) => {
    if (e.target.matches("[data-apply]")) apply().catch(() => {});
    if (e.target.matches("[data-cancel]")) cancel();
  };
}
