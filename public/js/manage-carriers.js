// Manage page, Carriers tab (admins): code, name and badge color of each carrier.
import { $, esc, textColor } from "./util.js";

async function request(path, body) {
  $("c-error").textContent = "";
  const res = await fetch(path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {});
  if (res.status === 401) location.href = "/login.html";
  const json = await res.json();
  if (!res.ok) {
    $("c-error").textContent = json.error || "Something went wrong.";
    throw new Error(json.error);
  }
  return json;
}

const badge = (code, color) =>
  `<b class="cr" style="--cc:${color};--cf:${textColor(color)};font-size:12px;line-height:18px;padding:0 6px">${esc(code)}</b>`;

function rowHtml(c) {
  return `<tr data-code="${esc(c.code)}">
    <td><b>${esc(c.code)}</b></td>
    <td><input class="cell-input" value="${esc(c.name)}" maxlength="40" aria-label="Name"></td>
    <td><input type="color" value="${esc(c.color)}" aria-label="Badge color"></td>
    <td class="badge-cell">${badge(c.code, c.color)}</td>
    <td>
      <button class="link" data-save hidden>Save</button>
      <button class="link danger" data-delete>Delete</button>
    </td>
  </tr>`;
}

function render(state) {
  $("c-rows").innerHTML = state.carriers.map(rowHtml).join("");
}

async function save(row) {
  const [name, color] = [...row.querySelectorAll("input")].map((i) => i.value.trim());
  render(await request("/api/carriers", { code: row.dataset.code, name, color }));
}

async function remove(row) {
  if (!confirm(`Delete carrier ${row.dataset.code}?`)) return;
  render(await request("/api/carriers/delete", { code: row.dataset.code }));
}

export async function initCarriers() {
  $("c-rows").oninput = (e) => {
    const row = e.target.closest("tr");
    row.querySelector("[data-save]").hidden = false;
    const color = row.querySelector("input[type=color]").value;
    row.querySelector(".badge-cell").innerHTML = badge(row.dataset.code, color); // live preview
  };
  // Errors are already shown on the page; .catch keeps them out of the console.
  $("c-rows").onclick = (e) => {
    const row = e.target.closest("tr");
    if (e.target.matches("[data-save]")) save(row).catch(() => {});
    if (e.target.matches("[data-delete]")) remove(row).catch(() => {});
  };
  $("c-add").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    request("/api/carriers", { code: f.code.value, name: f.cname.value, color: f.color.value })
      .then((state) => { render(state); f.reset(); })
      .catch(() => {});
  };
  render(await request("/api/yard"));
}
