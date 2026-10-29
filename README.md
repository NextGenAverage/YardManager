# 🚛 Yard Manager

**A live, shared map of the trailer yard at the distribution center.** Dock doors, trailer parking, street parking and unassigned trailers, the same for every shift and every device, updated the moment someone moves a trailer.

Built with **Node.js**, **Express** and **SQLite**, plus a plain HTML/JavaScript front end with no build step.

---

## ✨ Features

### 🗺️ The yard map
- 🚚 **Every trailer on the map** with its reg. number, a carrier badge (`DSV`, `INT`…) and how long it has been there
- 🎨 **Status colors:** Loading, Unloading, Loaded, Empty, Undefined
- ⚠️ **Damaged marker**, a red outline that keeps the status color
- ⏰ **Late marker** when a trailer is past its planned departure
- 🔍 **Search** by reg. number, trailer ID, carrier or note
- 👆 **One tap** opens a trailer's details; **Move** lifts it to another spot
- 📡 **Live updates:** every open map changes instantly, with a Live/Offline indicator
- 🎞️ **Smooth changes:** moved trailers glide to their new spot, new ones pop in, departed ones fade out, and status colors blend (off when the device is set to *reduce motion*)
- 📱 **Works on phones, tablets, PCs and wall screens**, with zoom that remembers your choice

### 📦 Trailers and arrivals
- 🔗 **Trailer register:** each reg. number is linked to its trailer ID and carrier, filled in automatically
- 📥 **CSV import** of the carrier's trailer list, with a preview and conflict handling
- 🛬 **Incoming list** of expected arrivals; tap *Arrived* and place the trailer on the map
- 🕓 **Arrival, departure and planned times** are recorded for every visit
- 📜 **Full history:** who did what and when, per trailer, per spot or for the whole yard

### 🔐 People and safety
- 👥 **Four roles:** Viewer, Worker, Operator, Admin
- 🔑 **Logins** with temporary passwords for new users, and lockout after wrong passwords
- 🛡️ **Every action is checked on the server**, not just hidden in the page

### 🛠️ Admin tools (Manage page)
- 🧭 **Map editor:** drag sections and buildings, add or remove spots, restore earlier layouts
- 🏷️ **Carriers:** names and badge colors
- 👤 **Users:** add, change role, deactivate, reset passwords
- 💾 **Backups:** nightly automatic copies, *Back up now*, downloads

---

## 🚀 Getting started

**Requires** [Node.js](https://nodejs.org) 22.9 or newer.

```sh
# 1. Install dependencies
npm install

# 2. Start the server

npm start            # 👉 http://localhost:3000
npm run dev          # same, but restarts when files change
```

🔑 **First start:** when there is no admin yet, the server creates one: username **`admin`**, password **`Test1234`** (or the `ADMIN_PASSWORD` setting below). Log in, and you must choose your own password straight away. Then add your coworkers under **Manage → Users**.

Prefer the command line? `npm run create-admin -- <username> "<Full name>"` creates an admin with a random temporary password.

### ⚙️ Settings

Settings go in a file called **`.env`** in the project folder: copy **`.env.example`** to `.env` and remove the `#` in front of what you want to change. `.env` is not in git, so passwords in it stay on the server. Restart the server after changing it. (Environment variables with the same names work too, e.g. on Render.)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Web server port |
| `DATA_DIR` | `./data` | Folder holding the database file `yard.db` |
| `ADMIN_PASSWORD` | `Test1234` | First admin's temporary password (only used when there is no admin yet) |
| `ADMIN_USERNAME` | `admin` | First admin's username |
| `HTTPS_PFX` + `HTTPS_PASSPHRASE` | | Certificate as a `.pfx` file and its password (see HTTPS below) |
| `HTTPS_CERT` + `HTTPS_KEY` | | Or: certificate and key as `.crt`/`.pem` + `.key` |
| `HTTP_REDIRECT_PORT` | | Also listen for plain http here (e.g. `80`) and send visitors on to https |
| `BACKUP_DIR` | `./backups` | Folder for database backups (best on another drive or a network share) |
| `BACKUP_TIME` | `02:00` | Time of the nightly backup |
| `BACKUP_KEEP` | `30` | How many backups to keep |

The database is created on first start with the starting layout from `default-layout.js` and the five statuses. 💾 `data/` is not in git, so the yard's data, users and passwords stay on the server.

### 🔒 HTTPS

Without HTTPS, passwords and data travel unencrypted over the network, so turn it on before real use.

1. 📜 **Get a certificate from IT** for the server's name (e.g. `yard.company.local`). Company IT usually issues one from the company's own certificate authority, which every company PC already trusts. A `.pfx` file with a password is the usual Windows format; `.crt` + `.key` works too.
2. 📁 **Put it in a folder outside the project** (e.g. `C:YardManagercerts`), readable only by the account that runs the app.
3. ⚙️ **In `.env`:** `HTTPS_PFX` + `HTTPS_PASSPHRASE` (or `HTTPS_CERT` + `HTTPS_KEY`), and `PORT=443`. With `HTTP_REDIRECT_PORT=80`, people who type `http://` are sent on to https.
4. 🔁 **Restart.** The log says `running on https://...`. A wrong password or missing file stops the start with a clear message.

Notes: certificates expire (often after 1–2 years): put the renewal date in a calendar, replace the file and restart. If IIS already uses port 443 on that server, use another port (e.g. `PORT=8443`) or let IIS forward to the app. The login cookie is automatically marked *Secure* over https.

### ☁️ Hosting on Render

1. **New → Web Service**, connect the GitHub repo.
2. **Build command:** `npm install`. **Start command:** `npm start`. Render sets `PORT` and provides HTTPS itself.
3. **Environment:** set `ADMIN_PASSWORD` to your own first password. ⚠️ A Render site is on the public internet, and `Test1234` is written in this README, so don't rely on the default there. Log in and change it as soon as it's up.
4. 💾 **Keep the data:** Render's normal file system is **wiped on every deploy and restart**, and with it `data/yard.db` (trailers, history, users). Add a **Persistent Disk** (e.g. mounted at `/var/data`, needs a paid instance) and set `DATA_DIR=/var/data`. Without a disk, use it for testing only.
5. 💤 On the free plan the service sleeps after a while without visitors; the first visit after that takes up to a minute.

## 💾 Backups

- 🌙 **Every night** at `BACKUP_TIME` (02:00) the server copies the database to `BACKUP_DIR`, and also at startup if the newest copy is more than a day old (e.g. the PC was off). The copy is made while the app runs, and each copy is checked before it counts.
- 🗂️ **Manage → Backups** (admins): list, **Back up now**, **Download**. The newest `BACKUP_KEEP` (30) are kept.
- 🛡️ **Keep one elsewhere:** put `BACKUP_DIR` on another drive or a network share, or download a copy now and then, so one broken disk can't take both the data and its backups.
- ⏪ **Restoring:**
  1. Stop the server.
  2. `npm run restore-backup` lists the backups; `npm run restore-backup -- <name>` restores one (it asks you to type *yes*).
  3. Start the server. The database that was replaced is kept as a *before-restore* backup, so a restore can be undone the same way.

  The restore refuses to run while the server is still running.

---

## 👥 Users and roles

| Role | What they can do |
|---|---|
| 👀 **Viewer** | See the map and history (e.g. a screen in the office) |
| 🦺 **Worker** | Also change status, damaged and note on trailers in the yard |
| 🎛️ **Operator** | Also add, move, depart and remove trailers, correct times, plan departures, manage Incoming and the trailer register |
| 👑 **Admin** | Also manage users, carriers and the map layout |

- ⏱️ **Logins last 12 hours** (one shift). Viewer logins last 30 days and renew while in use, so a wall screen stays logged in.
- 🚪 **Account changes log people out:** changing someone's role, deactivating them or resetting their password logs them out everywhere.
- 🔒 **Wrong passwords:** 5 in a row lock that username for 5 minutes.
- 🆘 **Locked out?** Run `npm run create-admin -- <username>` for an existing user. They become an active admin with a new temporary password.

---

## 🚚 Trailers: reg. number, trailer ID and carrier

The map shows each trailer's **reg. number** (licence plate) with a small **carrier** badge. In the **trailer register**, each reg. number is linked to one **trailer ID** (the carrier's longer trailer name) and carrier.

- ✍️ **Known reg. number:** typing it in the edit sheet fills in its trailer ID and carrier, locked.
- 🆕 **New reg. number:** operators enter the trailer ID and pick the carrier, and saving adds it to the register.
- 🔁 **Changing links:** done on **Manage → Trailers**. Every change is in the history with who made it.
- 🔤 **Spaces don't matter:** reg. numbers are stored in capitals without spaces, so `ab 12345` = `AB12345`.

### 📥 Importing the trailer list (CSV)

**Manage → Trailers → Import from CSV file**

| Column | Also accepted as | Example |
|---|---|---|
| **Car** | Supplier, Carrier, Leverandør | `DSV`, `INT` or `Bring` |
| **Ilu** | Trailer ID, Trailer | `BEUA2324074` |
| **Reg** | Reg.nr, Plate, Kjennemerke | `ABJ05C` |

- 📄 **File format:** comma, semicolon (Norwegian Excel) or tab separated, in UTF-8 or the older Windows encoding. In Excel, use *Save as → CSV*. Other header names are listed at the top of `csv-import.js`.
- 👀 **Preview first:** you see what's new, changed, unchanged or skipped, and why. Nothing is saved until you press **Import**.
- 🤔 **Conflicts:** a reg. number listed twice with different details (e.g. under both INT and DSV). For each one you choose **Skip**, **Use line N** or **Edit**, or use *Set all to: Skip / First line / Last line*.
- 🧐 **Check:** the same trailer ID on two reg. numbers is imported but flagged, since it's often a typo.
- 🧷 **Nothing is deleted:** reg. numbers that aren't in the file are kept. Rows with an unknown carrier are skipped, so add the carrier under **Manage → Carriers** and import again.

---

## 🕓 Planned times and Incoming

- 🛫 **Planned departure:** operators set it in the trailer's sheet. Once it passes, the map shows a red **late** marker instead of the dwell time.
- 🛬 **Incoming** (header button): trailers expected to arrive, soonest first, visible to everyone. The button shows how many, e.g. *Incoming (3)*, and turns red when one is late.
- 📍 **Arrived: place on map:** tap an open spot and the sheet opens filled in. Saving takes the trailer off the list and keeps its planned arrival on the visit.
- 📊 **History** shows planned vs. actual times, e.g. *Planned arrival 10:27 · 40m late*.
- 📥 **Import arrivals from Excel:** in the Incoming panel (operators), drop in the day's arrivals export (.xlsx or CSV). See below.
- 🗓️ **Picking times:** clicking a date/time field opens a calendar and clock. Quick buttons (*+1 h*, *+2 h*, *Tomorrow 06:00*…) set common times in one click.

### 📥 Importing the day's arrivals (Excel)

**Incoming → Import arrivals from Excel** (operators)

- 📄 **Files:** Excel `.xlsx` or CSV. The old `.xls` format isn't read; save it as `.xlsx` in Excel first.
- 🔎 **Columns are guessed** from their names (e.g. *Reg.nr*, *ETA*/*Ankomst*/*Tid*, *Dato*, *Car*, *Ilu*, *Kommentar*), and a title above the header row is fine. Times can be Excel times or text like `14:30`, `kl 14.30` or `29.10.2026 14:30`; a time without a date means today.
- 🎛️ **Wrong guess?** Pick the right column in the preview. The choice is **saved for everyone** and used next time.
- ➕ **Only adds and updates:** a truck already on the list gets the new time and details (empty fields keep what it had). Nothing is removed. Trucks already in the yard are skipped, and the trailer register's trailer ID and carrier win over the file.
- 👀 **Preview first:** each truck is marked *New*, *Update*, *No change* or *In yard*, with skipped lines and why (line numbers match Excel). Nothing is saved until **Import**.
- 🛠️ **Adjusting it:** the column names it recognises are at the top of `incoming-import.js`.

---

## 🧭 Changing the yard layout (map editor)

**Manage → Map** (admins):

1. 🖱️ **Select** a section (a row of doors or a block of spots) or a building
2. ✋ **Drag** it, or nudge it with the arrow keys (Shift = 10 px)
3. 📝 **Edit** its details on the right: spots (with a *Fill* helper), direction, sizes, default status
4. ➕ **Add** with *+ Section* / *+ Building*, or **Duplicate** / **Delete**
5. 💾 **Save layout.** Nothing changes for others until you save, and then every open map updates.

🛡️ The server checks the layout first (`layout.js`): spot names must be unique, and **a spot with a trailer on it can't disappear or be renamed** (move the trailer first).
⏪ Every save keeps the layout it replaced, so use **Earlier layouts → Restore** to undo.

| Section type | Shown |
|---|---|
| 🚪 Doors | On the map, with door signs |
| 🅿️ Parking | On the map, yellow lines |
| 📋 Unassigned | In the side panel next to the map |
| 🛣️ Street parking | Below the map, outside the fence |

---

## 🗂️ Project structure

<details>
<summary><b>🖥️ Server</b></summary>

| File | What it does |
|---|---|
| `server.js` | Web server and the yard `/api/...` endpoints, with the role each needs |
| `auth.js` | Passwords, sessions, roles and user accounts |
| `auth-routes.js` | Login, logout, password change and the admin's user endpoints |
| `db.js` | SQLite schema, upgrades (`migrations`) and yard queries |
| `layout.js` | Checks a layout from the map editor before it is saved |
| `csv-import.js` | Reads the CSV trailer list (columns, separators, checks) |
| `incoming-import.js` | Reads the day's arrivals (Excel/CSV): finds columns, reads times |
| `xlsx-reader.js` | Small reader for Excel `.xlsx` files (first sheet, values only) |
| `default-layout.js` | Starting yard layout (sections and buildings), copied into the database on first run |
| `backup.js` | Nightly and manual backups of the database |
| `scripts/restore-backup.js` | Puts a backup back as the live database |
| `scripts/create-admin.js` | Creates the first admin / recovers admin access |

</details>

<details>
<summary><b>🌐 Pages</b></summary>

| File | What it is |
|---|---|
| `public/index.html` | The yard map (markup only) |
| `public/login.html` | Login and choosing a new password |
| `public/manage.html` | Manage page: Trailers, Map, Carriers, Users |
| `public/css/yard.css` | All styles, grouped by part of the page |

</details>

<details>
<summary><b>⚡ JavaScript modules (<code>public/js/</code>)</b></summary>

| File | What it does |
|---|---|
| `main.js` | Starts the map page: taps on spots, moving trailers, keyboard, live updates |
| `map.js` | Draws the map, the side panel, street parking, legend and search highlight |
| `sheet.js` | The edit sheet that opens when a spot is tapped |
| `history.js` | The history panel |
| `incoming.js` | The Incoming panel (expected arrivals) |
| `arrivals-import.js` | Incoming → Import arrivals from Excel (preview, column choice) |
| `zoom.js` | Zoom and Fit |
| `geometry.js` | Layout sizes shared by the map and the editor |
| `api.js` | Requests to the server |
| `store.js` | The yard state shared by the modules above |
| `util.js` | Small helpers (escaping, time formatting) |
| `login.js` | Login page |
| `manage.js` | Manage page: picks the tabs this user may see |
| `manage-trailers.js` | Manage → Trailers: register and CSV import |
| `manage-map.js` | Manage → Map: the map editor |
| `manage-carriers.js` | Manage → Carriers |
| `manage-users.js` | Manage → Users |
| `manage-backups.js` | Manage → Backups |

</details>

💡 The pages use plain JavaScript modules (`import` / `export`), so there is **no build step**: edit a file and reload the browser.

---

## 🧰 Notes for maintainers

### 🗄️ Changing the database schema
Add a new entry at the **end** of `migrations` in `db.js`. It can be an SQL string, or a function for changes that need logic. On startup the app runs every migration the database hasn't had yet.
⚠️ **Never edit a migration** that has already run on the real server; add a new one instead.

### 🔒 Security in short
- 🔑 **Passwords:** hashed with scrypt; the browser holds only a random session token in an httpOnly cookie.
- ✅ **Every endpoint** checks the user's role on the server.
- 🧱 **Changes must be sent as JSON**, which stops other websites from acting as a logged-in user.

---

## 🗺️ Still to come

- [x] 💾 **Backups:** nightly automatic copies, a download button and restore steps
- [ ] 🌍 **Deployment:** running as a service on a company server, plus a maintainer guide
- [x] 🔐 **HTTPS:** built in; needs a certificate from IT

---

## 👤 Author

**Truls Lauritzen**: trailer yard management for the distribution center 🚛
