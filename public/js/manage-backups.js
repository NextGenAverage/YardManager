// Manage page, Backups tab (admins): the database copies, "Back up now" and downloads.
import { $, esc, formatTime } from "./util.js";

async function request(path, body) {
  $("b-error").textContent = "";
  const res = await fetch(path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {});
  if (res.status === 401) location.href = "/login.html";
  const json = await res.json();
  if (!res.ok) {
    $("b-error").textContent = json.error || "Something went wrong.";
    throw new Error(json.error);
  }
  return json;
}

const size = (bytes) => (bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} kB` : `${(bytes / 1e6).toFixed(1)} MB`);

// "manual" / "before-restore" from the file name, or automatic (nightly or at startup).
function kind(name) {
  const note = name.match(/_\d{6}-([a-z-]+)\.db$/)?.[1];
  return { manual: "Made by hand", "before-restore": "Saved before a restore" }[note] || (note ? note : "Automatic");
}

function render({ backups, dir, time, keep }) {
  $("b-info").innerHTML = `A copy of the database is made every night at <b>${esc(time)}</b> and kept in
    <code>${esc(dir)}</code>. The newest ${keep} are kept. Download a copy now and then to keep one somewhere else too.`;
  $("b-rows").innerHTML = backups.length
    ? backups.map((b) => `<tr><td>${esc(kind(b.name))}<small class="file">${esc(b.name)}</small></td>
        <td>${formatTime(b.at)}</td><td>${size(b.size)}</td>
        <td><a class="link" href="/api/backups/${encodeURIComponent(b.name)}" download>Download</a></td></tr>`).join("")
    : `<tr><td colspan="4">No backups yet.</td></tr>`;
}

async function backUpNow() {
  $("b-now").disabled = true;
  try {
    const r = await request("/api/backups", {});
    $("b-notice").hidden = false;
    $("b-notice").textContent = `Backup saved: ${r.backup.name}`;
    render({ ...(await request("/api/backups")) });
  } finally {
    $("b-now").disabled = false;
  }
}

export async function initBackups() {
  // Errors are already shown on the page; .catch keeps them out of the console.
  $("b-now").onclick = () => backUpNow().catch(() => {});
  render(await request("/api/backups"));
}
