// Put a backup back as the live database.
//
//   npm run restore-backup                 lists the backups
//   npm run restore-backup -- <name>       restores one (a name from the list, or a path to a .db file)
//
// Stop the Yard Manager server first. The current database is kept as a backup
// ("...-before-restore.db") before it is replaced, so a restore can be undone.
// This script doesn't load db.js on purpose: the live file must not be open
// while it is replaced.
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const Database = require("better-sqlite3");

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, "..", "backups"));
const LIVE = path.join(DATA_DIR, "yard.db");
const PORT = Number(process.env.PORT) || 3000;

const list = () => (fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : [])
  .filter((n) => /^yard-.*\.db$/.test(n))
  .map((name) => ({ name, at: fs.statSync(path.join(BACKUP_DIR, name)).mtime }))
  .sort((a, b) => b.at - a.at);

function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log(`Backups in ${BACKUP_DIR} (newest first):`);
    for (const b of list()) console.log(`  ${b.name}   ${b.at.toLocaleString()}`);
    console.log("\nRestore one with:  npm run restore-backup -- <name>");
    return;
  }

  const source = fs.existsSync(path.join(BACKUP_DIR, arg)) ? path.join(BACKUP_DIR, arg) : path.resolve(arg);
  if (!fs.existsSync(source)) throw new Error(`No backup called ${arg}. Run without a name to see the list.`);
  const check = new Database(source, { readonly: true });
  const ok = check.pragma("quick_check", { simple: true });
  check.close();
  if (ok !== "ok") throw new Error(`That backup is damaged (${ok}). Choose another.`);

  // The server must be stopped: it keeps the live database open.
  const running = await fetch(`http://localhost:${PORT}/login.html`).then(() => true, () => false);
  if (running) throw new Error(`The server is still running on port ${PORT}. Stop it first, then run this again.`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Replace the live database\n  ${LIVE}\nwith\n  ${source}\n? Type "yes" to continue: `);
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") return console.log("Nothing changed.");

  if (fs.existsSync(LIVE)) {
    const keep = path.join(BACKUP_DIR, `yard-${stamp(new Date())}-before-restore.db`);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const live = new Database(LIVE, { readonly: true });
    await live.backup(keep);
    live.close();
    const copy = new Database(keep); // one self-contained file, like the other backups
    copy.pragma("journal_mode = DELETE");
    copy.close();
    console.log(`Current database kept as ${keep}`);
  }
  for (const extra of ["-wal", "-shm"]) fs.rmSync(LIVE + extra, { force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.copyFileSync(source, LIVE);
  console.log("Restored. Start the server again.");
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
