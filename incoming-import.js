// Reads a list of expected arrivals (Excel .xlsx or CSV) for the Incoming list.
//
// The export's exact columns aren't fixed, so:
//   - the header row is found automatically (exports often start with a title)
//   - each field is guessed from the column names below
//   - the user can choose other columns in the preview; that choice is saved
//     and used for the next import (as column names, so their order may change)
//
// Fields:
//   plate      reg. number (required)
//   time       expected arrival: a date+time, or just a time (then "date" or today is used)
//   date       optional, when the date is in its own column
//   trailerId, carrier, note   optional
const { readXlsx } = require("./xlsx-reader");
const { parseCsv, normalizePlate, cleanTrailerId } = require("./csv-import");

// Column names are compared lowercase with only a-z and 0-9 kept, e.g.
// "Reg.nr" -> "regnr", "Forventet ankomst" -> "forventetankomst".
const GUESSES = {
  plate: ["reg", "regnr", "regno", "registration", "plate", "licenceplate", "licenseplate", "kjennemerke", "skilt",
    "trailerreg", "hengerreg", "trailerplate"],
  time: ["eta", "expected", "expectedarrival", "arrival", "arrivaltime", "ankomst", "forventetankomst", "ankomsttid",
    "tid", "time", "klokkeslett", "kl", "planned", "planlagt"],
  date: ["date", "dato", "day", "dag", "arrivaldate", "ankomstdato"],
  trailerId: ["ilu", "iluno", "trailerid", "trailer", "hengerid", "henger"],
  carrier: ["car", "carrier", "supplier", "leverandr", "transportr", "haulier", "company", "firma"],
  note: ["note", "notes", "comment", "comments", "kommentar", "merknad", "ref", "reference", "booking", "order", "ordre"],
};
const FIELDS = Object.keys(GUESSES);
const simplify = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, "");

// The file as rows of values: .xlsx by its zip signature ("PK"), otherwise CSV text.
function readTable(buffer) {
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return readXlsx(buffer);
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf) {
    throw new Error("This is an old .xls file. Open it in Excel and save it as .xlsx (or CSV), then import that.");
  }
  // CSV: UTF-8 if it is valid UTF-8, otherwise Excel's older Windows encoding.
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { text = new TextDecoder("windows-1252").decode(buffer); }
  return parseCsv(text);
}

// The header is the first of the first 10 rows that has a known column name.
function findHeader(rows) {
  const known = new Set(Object.values(GUESSES).flat());
  const index = rows.slice(0, 10).findIndex((r) => r.some((h) => known.has(simplify(h))));
  if (index >= 0) return index;
  return Math.max(0, rows.findIndex((r) => r.some((x) => String(x).trim()))); // first row with anything in it
}

// Which column (index) holds each field: the saved choice where its column
// still exists, otherwise a guess from the column names.
function chooseColumns(header, saved = {}) {
  const names = header.map((h) => String(h).trim());
  const out = {};
  for (const field of FIELDS) {
    const savedName = saved[field];
    if (savedName !== undefined) {
      out[field] = savedName === null ? -1 : names.indexOf(savedName);
      if (out[field] >= 0 || savedName === null) continue;
    }
    out[field] = names.findIndex((n, i) => GUESSES[field].includes(simplify(n)) && !Object.values(out).includes(i));
  }
  return out;
}

// ---- Times ----

// Excel stores dates/times as days since 1899-12-30 (fraction = time of day),
// in local time.
function fromExcel(serial) {
  const days = Math.floor(serial);
  const ms = Math.round((serial - days) * 864e5);
  return new Date(1899, 11, 30 + days, 0, 0, 0, ms);
}

// A date from text: "29.10.2026", "29/10/2026", "2026-10-29", "29.10.26"
function dateFromText(s) {
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], m[2] - 1, +m[3]);
  m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], m[2] - 1, +m[1]);
  return null;
}

// A time of day from text: "14:30", "14.30", "1430", "kl 14:30", "29.10.2026 14:30"
function timeFromText(s) {
  // Take out a date first, so "29.10" in "29.10.2026" isn't read as a time.
  s = s.replace(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./]\d{1,2}[./]\d{2,4}/, " ");
  const m = s.match(/(?:^|\D)(\d{1,2})[:.](\d{2})(?!\d)/) || s.trim().match(/^(\d{1,2})(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return [+m[1], +m[2]];
}

// The expected arrival from the time column (and date column, if any).
// Returns a time in ms, or null if it can't be read.
function parseWhen(timeValue, dateValue, today) {
  let day = null, hm = null;
  // The date column, if there is one
  if (typeof dateValue === "number") day = fromExcel(dateValue);
  else if (String(dateValue ?? "").trim()) day = dateFromText(String(dateValue));
  // The time column: a full date+time, or a time of day
  if (typeof timeValue === "number") {
    const d = fromExcel(timeValue);
    if (timeValue >= 1) return d.getTime(); // has a date part: a full date and time
    hm = [d.getHours(), d.getMinutes()];
  } else {
    const s = String(timeValue ?? "").trim();
    if (!s) return null;
    hm = timeFromText(s);
    const d = dateFromText(s);
    if (d) day = d;
    if (!hm) return null;
  }
  const base = day || today;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hm[0], hm[1]).getTime();
}

// ---- The whole file ----

// buffer: the uploaded file. saved: column names chosen last time { field: name|null }.
// carriers: [{ code, name }]. Returns {
//   header: column names, columns: { field: index or -1 },
//   rows: [{ line, plate, expectedAt, trailerId, carrier, note }],
//   errors: [...] (lines skipped), warnings: [...]
// }
function readArrivals(buffer, { saved, carriers, now = new Date() }) {
  const table = readTable(buffer);
  if (!table.length) return { header: [], columns: {}, rows: [], errors: ["The file is empty."], warnings: [] };
  const headerIndex = findHeader(table);
  const header = table[headerIndex].map((h) => String(h).trim());
  const columns = chooseColumns(header, saved);
  if (columns.plate < 0 || columns.time < 0) {
    const missing = [columns.plate < 0 && "reg. number", columns.time < 0 && "expected time"].filter(Boolean);
    return { header, columns, rows: [], warnings: [],
      errors: [`Choose the column for ${missing.join(" and ")} below.`] };
  }

  const carrierCode = {};
  for (const c of carriers) {
    carrierCode[c.code.toUpperCase()] = c.code;
    carrierCode[c.name.toUpperCase()] = c.code;
  }
  const cell = (r, field) => (columns[field] >= 0 ? r[columns[field]] : "");
  const rows = [], errors = [], warnings = [], seen = new Map();
  table.slice(headerIndex + 1).forEach((r, i) => {
    const line = headerIndex + i + 2;
    if (!r.some((x) => String(x).trim())) return; // empty row
    const plate = normalizePlate(cell(r, "plate"));
    if (!plate) return errors.push(`Line ${line}: no reg. number.`);
    const expectedAt = parseWhen(cell(r, "time"), cell(r, "date"), now);
    if (expectedAt === null) return errors.push(`Line ${line}: ${plate}: couldn't read the time "${cell(r, "time")}".`);
    const carrierText = String(cell(r, "carrier") ?? "").trim();
    const carrier = carrierText ? carrierCode[carrierText.toUpperCase()] ?? null : null;
    if (carrierText && !carrier) warnings.push(`Line ${line}: ${plate}: unknown carrier "${carrierText}" (imported without carrier).`);
    if (seen.has(plate)) {
      errors.push(`Line ${line}: ${plate} is also on line ${seen.get(plate)}; only the first is used.`);
      return;
    }
    seen.set(plate, line);
    rows.push({
      line, plate, expectedAt, carrier,
      trailerId: cleanTrailerId(cell(r, "trailerId")),
      note: String(cell(r, "note") ?? "").trim().slice(0, 200),
    });
  });
  return { header, columns, rows, errors, warnings };
}

module.exports = { readArrivals, FIELDS };
