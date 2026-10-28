// Requests to the server. Changes reply with the new yard state, which is applied
// here; errors are shown under the search box and passed on to the caller.
import { showMsg } from "./util.js";
import { setYard, ui } from "./store.js";

export async function api(path, body) {
  ui.busy = true;
  try {
    const res = await fetch(path, body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {});
    const json = await res.json();
    if (json.sections) setYard(json);
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  } catch (e) {
    showMsg(e instanceof TypeError ? "Can't reach the server. Check the connection and try again." : e.message);
    throw e;
  } finally {
    ui.busy = false;
  }
}

// Like api(), for buttons that don't need to handle the error themselves
// (it is already shown to the user).
export const send = (path, body) => api(path, body).catch(() => {});
