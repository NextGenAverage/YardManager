// User admin page: add users, change role, deactivate, reset passwords.
import { $, esc, formatTime } from "./util.js";

const label = (role) => role[0].toUpperCase() + role.slice(1);
let roles = [];

async function request(path, body) {
  $("error").textContent = "";
  const res = await fetch(path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {});
  if (res.status === 401) location.href = "/login.html";
  const json = await res.json();
  if (!res.ok) {
    $("error").textContent = json.error || "Something went wrong.";
    throw new Error(json.error);
  }
  return json;
}

function showPassword(username, password) {
  $("notice").hidden = false;
  $("notice").innerHTML = `Temporary password for <b>${esc(username)}</b>: <code>${esc(password)}</code><br>`
    + "Give it to them. They choose their own password when they first log in.";
}

const roleOptions = (selected) =>
  roles.map((r) => `<option value="${r}"${r === selected ? " selected" : ""}>${label(r)}</option>`).join("");

function rowHtml(u) {
  return `<tr data-id="${u.id}" class="${u.active ? "" : "inactive"}">
    <td>${esc(u.name)}</td>
    <td>${esc(u.username)}</td>
    <td><select data-field="role">${roleOptions(u.role)}</select></td>
    <td><input type="checkbox" data-field="active"${u.active ? " checked" : ""} aria-label="Active"></td>
    <td>${u.lastLoginAt ? formatTime(u.lastLoginAt) : "never"}</td>
    <td><button class="link" data-reset="${esc(u.username)}">Reset password</button></td>
  </tr>`;
}

async function load() {
  const data = await request("/api/users");
  roles = data.roles;
  $("rows").innerHTML = data.users.map(rowHtml).join("");
  $("add-role").innerHTML = roleOptions("worker");
}

// Role and active changes save immediately.
$("rows").onchange = async (e) => {
  const field = e.target.dataset.field;
  const id = e.target.closest("tr").dataset.id;
  const value = field === "active" ? e.target.checked : e.target.value;
  try {
    await request(`/api/users/${id}`, { [field]: value });
  } finally {
    load(); // also puts the control back if the change was refused
  }
};

$("rows").onclick = async (e) => {
  const username = e.target.dataset.reset;
  if (!username) return;
  if (!confirm(`Give ${username} a new temporary password? They will be logged out everywhere.`)) return;
  const id = e.target.closest("tr").dataset.id;
  const { password } = await request(`/api/users/${id}/reset-password`, {});
  showPassword(username, password);
};

$("add").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const { user, password } = await request("/api/users", { name: f.fullname.value, username: f.username.value, role: f.role.value });
  showPassword(user.username, password);
  f.reset();
  load();
};

load();
