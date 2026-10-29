// Backups of the database: a copy every night (and at startup if the last one is
// more than a day old), on demand from Manage > Backups, newest ones kept.
//
// Copies are made with SQLite's online backup, so the app keeps running, and
// each copy is checked before it counts. Restoring: see scripts/restore-backup.js.
//
// Settings (.env):
//   BACKUP_DIR   folder for the copies (default: ./backups). Best on another
//                drive or a network share, so one broken disk can't take both.
//   BACKUP_TIME  time of the nightly copy, HH:MM (default 02:00)
//   BACKUP_KEEP  how many copies to keep (default 30)
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { db } = require("./db");

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, "backups"));
const BACKUP_TIME = /^\d{1,2}:\d{2}$/.test(process.env.BACKUP_TIME || "") ? process.env.BACKUP_TIME : "02:00";
const BACKUP_KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 30);
const DAY = 24 * 3600e3;

// yard-2026-10-29_020000.db, or with a note: yard-2026-10-29_143012-manual.db
const NAME = /^yard-\d{4}-\d{2}-\d{2}_\d{6}(-[a-z-]+)?\.db$/;

function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Newest first: [{ name, size, at }]
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((n) => NAME.test(n)).map((name) => {
    const st = fs.statSync(path.join(BACKUP_DIR, name));
    return { name, size: st.size, at: st.mtimeMs };
  }).sort((a, b) => b.at - a.at);
}

// The full path of a backup, or null if there is no such backup.
function backupFile(name) {
  if (!NAME.test(name)) return null;
  const file = path.join(BACKUP_DIR, name);
  return fs.existsSync(file) ? file : null;
}

// Is this a healthy SQLite database? Returns "ok" or what is wrong.
function checkFile(file) {
  const copy = new Database(file, { readonly: true });
  try {
    return copy.pragma("quick_check", { simple: true });
  } finally {
    copy.close();
  }
}

// A fresh copy keeps the live database's WAL mode, which needs -wal/-shm helper
// files next to it. Switch it to the plain mode so each backup is one file.
function makeSelfContained(file) {
  const copy = new Database(file);
  try {
    copy.pragma("journal_mode = DELETE");
  } finally {
    copy.close();
  }
}

function removeBackup(name) {
  for (const extra of ["", "-wal", "-shm"]) fs.rmSync(path.join(BACKUP_DIR, name + extra), { force: true });
}

// note: "" for the nightly copy, "manual" etc. otherwise. Returns the new backup.
async function makeBackup(note = "") {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `yard-${stamp(new Date())}${note ? "-" + note : ""}.db`;
  const file = path.join(BACKUP_DIR, name);
  await db.backup(file);
  makeSelfContained(file);
  const check = checkFile(file);
  if (check !== "ok") {
    removeBackup(name);
    throw new Error(`The copy failed its check (${check}).`);
  }
  // Keep the newest BACKUP_KEEP copies.
  for (const old of listBackups().slice(BACKUP_KEEP)) removeBackup(old.name);
  return listBackups().find((b) => b.name === name);
}

// Nightly copy at BACKUP_TIME, plus one now if the newest is more than a day old
// (e.g. the PC was off at night). log: where to report what happened.
function scheduleBackups(log) {
  const run = () => makeBackup()
    .then((b) => log(`Backup saved: ${b.name}`))
    .catch((e) => log(`BACKUP FAILED: ${e.message}`));
  const newest = listBackups()[0];
  if (!newest || Date.now() - newest.at > DAY) run();

  const planNext = () => {
    const [h, m] = BACKUP_TIME.split(":").map(Number);
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next <= new Date()) next.setDate(next.getDate() + 1);
    setTimeout(() => { run(); planNext(); }, next - Date.now());
  };
  planNext();
}

module.exports = {
  BACKUP_DIR, BACKUP_TIME, BACKUP_KEEP,
  listBackups, backupFile, checkFile, makeBackup, scheduleBackups,
};
