// Login page. Also where users choose a new password: right after logging in
// with a temporary one, or via "Password" in the map header (login.html#change).
import { $ } from "./util.js";

async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Something went wrong.");
  return json;
}

function show(form) {
  $("login").hidden = form !== "login";
  $("change").hidden = form !== "change";
  $(form).querySelector("input:not([type=hidden])").focus();
}

// first: the user just logged in with a temporary password (already known).
let temporary = null;
function showChange(first) {
  $("change-intro").textContent = first
    ? "Welcome! Please choose your own password (at least 8 characters)."
    : "At least 8 characters.";
  $("current-wrap").hidden = first;
  $("change-cancel").hidden = first;
  show("change");
}

$("login").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  $("login-error").textContent = "";
  try {
    const { user } = await post("/api/login", { username: f.username.value, password: f.password.value });
    if (user.mustChangePassword) {
      temporary = f.password.value;
      showChange(true);
    } else {
      location.href = "/";
    }
  } catch (err) {
    $("login-error").textContent = err.message;
  }
};

$("change").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  $("change-error").textContent = "";
  if (f.password.value !== f.again.value) {
    $("change-error").textContent = "The two new passwords are different.";
    return;
  }
  try {
    await post("/api/password", { current: temporary ?? f.current.value, password: f.password.value });
    location.href = "/";
  } catch (err) {
    $("change-error").textContent = err.message;
  }
};

// Already logged in? Go to the map, unless they came here to change their password.
const me = await fetch("/api/me").then((r) => (r.ok ? r.json() : null));
if (me && location.hash === "#change") showChange(false);
else if (me && !me.user.mustChangePassword) location.href = "/";
else show("login"); // a user with a temporary password logs in again to set their own
