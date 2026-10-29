// A small reader for Excel .xlsx files: returns the cells of the first sheet as
// rows of values (text or numbers), one per Excel row (empty rows included).
// No formatting, formulas or other sheets.
//
// An .xlsx file is a zip archive of XML files:
//   xl/workbook.xml           the sheets, in order
//   xl/_rels/workbook.xml.rels where each sheet's XML file is
//   xl/sharedStrings.xml       texts, referred to by number from the cells
//   xl/worksheets/sheetN.xml   the cells: <c r="B2" t="s"><v>3</v></c>
// Dates and times are numbers in Excel (days since 1899-12-30); the importer
// converts them for the columns it knows are times (see incoming-import.js).
// The old binary .xls format (Excel 2003 and earlier) is not supported.
const zlib = require("zlib");

// ---- Zip: list the files, then unpack one ----

function unzip(buf) {
  // The "end of central directory" record is at the end of the file.
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("This is not an .xlsx file.");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16); // start of the central directory
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("The .xlsx file is damaged.");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLength);
    files.set(name, { method, size, local });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return (name) => {
    const f = files.get(name);
    if (!f) return null;
    const start = f.local + 30 + buf.readUInt16LE(f.local + 26) + buf.readUInt16LE(f.local + 28);
    const data = buf.subarray(start, start + f.size);
    if (f.method === 0) return data.toString("utf8");
    if (f.method === 8) return zlib.inflateRawSync(data).toString("utf8");
    throw new Error("The .xlsx file uses an unknown compression.");
  };
}

// ---- XML helpers (the files Excel writes are simple and regular) ----

const decode = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&");

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

// All text inside <t> elements of a piece of XML (rich text has several).
const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

// "B12" -> column index 1
function columnIndex(ref) {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

// ---- The first sheet as rows of values ----

function readXlsx(buf) {
  const file = unzip(buf);
  const workbook = file("xl/workbook.xml");
  if (!workbook) throw new Error("This is not an Excel workbook.");
  const firstSheet = workbook.match(/<sheet\s[^>]*>/);
  if (!firstSheet) throw new Error("The workbook has no sheets.");
  const relId = attr(firstSheet[0], "r:id");
  const rels = file("xl/_rels/workbook.xml.rels") || "";
  const rel = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((r) => attr(r, "Id") === relId);
  let target = rel ? attr(rel, "Target") : "worksheets/sheet1.xml";
  target = target.startsWith("/") ? target.slice(1) : "xl/" + target;
  const sheet = file(target);
  if (!sheet) throw new Error("Couldn't find the first sheet in the workbook.");

  const shared = [...(file("xl/sharedStrings.xml") || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));

  // rows[0] is Excel's row 1, so line numbers in messages match Excel; empty rows stay empty.
  const rows = [];
  for (const row of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const values = [];
    for (const cell of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, attrs, inner = ""] = cell;
      const ref = attr(attrs, "r");
      const type = attr(attrs, "t");
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = texts(inner);
      else if (type === "str" || type === "e") value = decode(v ?? "");
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) value = Number(v); // number (also dates and times)
      values[ref ? columnIndex(ref) : values.length] = value;
    }
    const number = Number(attr(row[1], "r")) || rows.length + 1;
    rows[number - 1] = Array.from(values, (x) => x ?? "");
  }
  return Array.from(rows, (r) => r ?? []);
}

module.exports = { readXlsx };
