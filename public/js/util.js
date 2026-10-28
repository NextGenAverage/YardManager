// Small helpers used across the page.

export const $ = (id) => document.getElementById(id);

// Make text safe to put inside HTML.
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Show a short message under the search box.
export function showMsg(text) {
  $("msg").textContent = text;
}

// Dark text on light colors (e.g. Undefined), white text on dark ones.
export function textColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#1b2130" : "#fff";
}

// Time a trailer has been in the yard, short form: "45m", "5h", "3d".
export function dwell(since) {
  const m = Math.floor((Date.now() - since) / 60000);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  return h < 48 ? h + "h" : Math.floor(h / 24) + "d";
}

// Length of a stay, longer form: "45m", "5h 20m", "3d 4h".
export function duration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

// Date and time in the viewer's language, e.g. "Tue 28 Oct, 14:05".
export const formatTime = (ms) =>
  new Date(ms).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// <input type="datetime-local"> uses local time without seconds: "2026-10-28T14:05".
export function toLocalInput(ms) {
  const local = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export const fromLocalInput = (value) => (value ? new Date(value).getTime() : undefined);

// Date/time fields: a click anywhere in the field opens the browser's calendar
// and clock picker (instead of putting the cursor in the day/month/hour parts).
// Quick-pick buttons (<div class="quick" data-for="field-id">) set the field
// to "+N hours from now" (data-hours), "tomorrow at HH:00" (data-tomorrow) or
// empty (data-clear). Times are rounded to 5 minutes.
export function initDatePickers() {
  document.addEventListener("click", (e) => {
    const input = e.target.closest('input[type="datetime-local"]');
    if (input && !input.disabled && !input.readOnly) {
      try { input.showPicker(); } catch {} // older browsers: the field still works as before
      return;
    }
    const button = e.target.closest(".quick button");
    if (!button) return;
    const field = $(button.closest(".quick").dataset.for);
    if (field.disabled) return;
    const fiveMinutes = 5 * 60e3;
    if ("clear" in button.dataset) field.value = "";
    else if (button.dataset.tomorrow) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(Number(button.dataset.tomorrow), 0, 0, 0);
      field.value = toLocalInput(d.getTime());
    } else {
      const at = Date.now() + Number(button.dataset.hours) * 3600e3;
      field.value = toLocalInput(Math.round(at / fiveMinutes) * fiveMinutes);
    }
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
