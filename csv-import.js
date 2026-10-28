// Reads the integration team's trailer list (CSV) for the trailer register.
//
// Expected columns (in any order, other columns are ignored):
//   carrier    - "Car", "Supplier", "Carrier", "Leverandør": a carrier code (DSV, INT) or name (Bring)
//   trailer ID - "Ilu", "Trailer ID", "Trailer", "Trailer name"
//   reg.       - "Reg", "Reg.nr", "Registration", "Licence plate", "Plate", "Kjennemerke"
// Comma, semicolon (Norwegian Excel) and tab separated files all work.
// The browser decodes the file (UTF-8 or Excel's older Windows encoding) before sending it.

// Header names are compared lowercase with only a-z and 0-9 kept, so
// "Reg.nr" -> "regnr", "Trailer ID" -> "trailerid", "Leverandør" -> "leverandr".
const COLUMNS = {
  carrier: ["car", "supplier", "carrier", "leverandr", "transportr", "company", "firma"],
  trailerId: ["ilu", "iluno", "ilucode", "trailerid", "trailer", "trailername", "hengerid", "henger"],
  plate: ["reg", "regnr", "regno", "registration", "registrationnumber", "licenceplate", "licenseplate",
    "plate", "skilt", "kjennemerke"],
};
const simplify = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

// Reg. numbers are compared in capitals with only letters and digits:
// "ab 12345" -> "AB12345". This also drops stray characters such as the
// non-breaking spaces Excel sometimes leaves after a value.
const normalizePlate = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);

// Trailer IDs: trimmed (including non-breaking spaces), unreadable characters removed.
const cleanTrailerId = (s) => String(s ?? "").replace(/�/g, "").trim().slice(0, 60);

// Split CSV text into rows of fields. Handles quoted fields ("a;b", "say ""hi""")
// and line breaks inside quotes.
function parseCsv(text) {
  text = text.replace(/^﻿/, ""); // byte order mark that Excel adds
  const firstLine = text.split(/\r?\n/, 1)[0];
  const count = (ch) => firstLine.split(ch).length;
  const sep = [";", ",", "\t"].sort((a, b) => count(b) - count(a))[0];

  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

// Turn the CSV into register rows. carriers: [{ code, name }].
// Returns {
//   rows:      [{ line, plate, trailerId, carrier }]  rows that can be imported
//   conflicts: [{ plate, lines: [{ line, trailerId, carrier }] }]  reg. numbers listed
//              more than once with different trailer ID or carrier; the user decides
//              in the preview (skip, use one of the lines, or edit)
//   errors:    [...]  why lines were skipped
//   warnings:  [...]  imported, but worth checking
//   skipped:   number of lines skipped (not counting conflicts)
// }
function readTrailerCsv(text, carriers) {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { rows: [], conflicts: [], errors: ["The file is empty."], warnings: [], skipped: 0 };

  const index = {};
  const names = header.map(simplify);
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    index[key] = names.findIndex((n) => aliases.includes(n));
  }
  const missing = Object.keys(index).filter((k) => index[k] < 0);
  if (missing.length) {
    const label = { carrier: "supplier/carrier", trailerId: "trailer ID", plate: "reg. number" };
    return {
      rows: [], conflicts: [], warnings: [], skipped: lines.length,
      errors: [`Couldn't find the column(s) ${missing.map((k) => label[k]).join(", ")}. `
        + `Columns in the file: ${header.join(", ")}.`],
    };
  }

  // A carrier can be given by code or by name, in any case.
  const carrierCode = {};
  for (const c of carriers) {
    carrierCode[c.code.toUpperCase()] = c.code;
    carrierCode[c.name.toUpperCase()] = c.code;
  }

  const errors = [], warnings = [];
  let skipped = 0;
  const byPlate = new Map(); // plate -> [row, ...] in file order
  lines.forEach((fields, i) => {
    const line = i + 2; // line 1 is the header
    const plate = normalizePlate(fields[index.plate]);
    const trailerId = cleanTrailerId(fields[index.trailerId]);
    const carrierText = String(fields[index.carrier] ?? "").trim();
    const carrier = carrierText ? carrierCode[carrierText.toUpperCase()] : null;
    let problem = null;
    if (!plate) problem = `Line ${line}: no reg. number.`;
    else if (!trailerId) problem = `Line ${line}: ${plate} has no trailer ID.`;
    else if (carrierText && !carrier) problem = `Line ${line}: unknown carrier "${carrierText}" for ${plate}.`;
    if (problem) {
      errors.push(problem);
      skipped++;
      return;
    }
    if (!byPlate.has(plate)) byPlate.set(plate, []);
    byPlate.get(plate).push({ line, plate, trailerId, carrier });
  });

  const rows = [], conflicts = [];
  for (const [plate, list] of byPlate) {
    const differs = list.some((r) => r.trailerId !== list[0].trailerId || r.carrier !== list[0].carrier);
    if (differs) conflicts.push({ plate, lines: list.map(({ line, trailerId, carrier }) => ({ line, trailerId, carrier })) });
    else rows.push(list[0]); // exact duplicates count once
  }

  // The same trailer ID on several reg. numbers is often a typo in a reg. number.
  const plateOfId = new Map();
  for (const r of rows) {
    const key = r.trailerId.toUpperCase();
    if (plateOfId.has(key)) warnings.push(`Trailer ID ${r.trailerId} is used by both ${plateOfId.get(key)} and ${r.plate}.`);
    else plateOfId.set(key, r.plate);
  }
  return { rows, conflicts, errors, warnings, skipped };
}

module.exports = { parseCsv, readTrailerCsv, normalizePlate, cleanTrailerId };
