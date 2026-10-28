// Reads the integration team's trailer list (CSV) for the trailer register.
//
// Expected columns (in any order, other columns are ignored):
//   carrier    - "Supplier", "Carrier", "Leverandør": a carrier code (DSV, INT) or name (Bring)
//   trailer ID - "Trailer ID", "Trailer", "Trailer name"
//   reg.       - "Reg", "Reg.nr", "Registration", "Licence plate", "Plate", "Kjennemerke"
// Comma, semicolon (Norwegian Excel) and tab separated files all work.

// Header names are compared lowercase with only a-z and 0-9 kept, so
// "Reg.nr" -> "regnr", "Trailer ID" -> "trailerid", "Leverandør" -> "leverandr".
const COLUMNS = {
  carrier: ["supplier", "carrier", "leverandr", "transportr", "company", "firma"],
  trailerId: ["trailerid", "trailer", "trailername", "hengerid", "henger"],
  plate: ["reg", "regnr", "regno", "registration", "registrationnumber", "licenceplate", "licenseplate",
    "plate", "skilt", "kjennemerke"],
};
const simplify = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

// Reg. numbers are compared without spaces and in capitals: "ab 12345" -> "AB12345".
const normalizePlate = (s) => String(s ?? "").toUpperCase().replace(/\s+/g, "").slice(0, 20);

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
// Returns { rows: [{ line, plate, trailerId, carrier }], errors: [...], warnings: [...] }
// where errors are rows that can't be imported (they are skipped).
function readTrailerCsv(text, carriers) {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { rows: [], errors: ["The file is empty."], warnings: [] };

  const index = {};
  const names = header.map(simplify);
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    index[key] = names.findIndex((n) => aliases.includes(n));
  }
  const missing = Object.keys(index).filter((k) => index[k] < 0);
  if (missing.length) {
    const label = { carrier: "supplier/carrier", trailerId: "trailer ID", plate: "reg. number" };
    return {
      rows: [], warnings: [],
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

  const rows = [], errors = [], warnings = [];
  const seenPlate = new Map(), seenTrailerId = new Map();
  lines.forEach((fields, i) => {
    const line = i + 2; // line 1 is the header
    const plate = normalizePlate(fields[index.plate]);
    const trailerId = String(fields[index.trailerId] ?? "").trim().slice(0, 60);
    const carrierText = String(fields[index.carrier] ?? "").trim();
    const carrier = carrierText ? carrierCode[carrierText.toUpperCase()] : null;

    if (!plate) return errors.push(`Line ${line}: no reg. number.`);
    if (!trailerId) return errors.push(`Line ${line}: ${plate} has no trailer ID.`);
    if (carrierText && !carrier) return errors.push(`Line ${line}: unknown carrier "${carrierText}" for ${plate}.`);
    if (seenPlate.has(plate)) return errors.push(`Line ${line}: ${plate} is also on line ${seenPlate.get(plate)}; only the first is used.`);
    seenPlate.set(plate, line);
    const other = seenTrailerId.get(trailerId.toUpperCase());
    if (other) warnings.push(`Line ${line}: trailer ID ${trailerId} is also used by ${other}.`);
    else seenTrailerId.set(trailerId.toUpperCase(), plate);
    rows.push({ line, plate, trailerId, carrier });
  });
  return { rows, errors, warnings };
}

module.exports = { parseCsv, readTrailerCsv, normalizePlate };
