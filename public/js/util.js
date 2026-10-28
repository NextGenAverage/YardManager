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
