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

---

## 🚀 Getting started

**Requires** [Node.js](https://nodejs.org) 22 or newer.

```sh
# 1. Install dependencies
npm install

# 2. Create the first admin (prints a temporary password)
npm run create-admin -- <username> "<Full name>"

# 3. Start the server
npm start            # 👉 http://localhost:3000
npm run dev          # same, but restarts when files change
```

Open the map, log in with the temporary password and choose your own. Then add your coworkers under **Manage → Users**.

### ⚙️ Settings

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Web server port |
| `DATA_DIR` | `./data` | Folder holding the database file `yard.db` |

The database is created on first start with the starting layout from `default-layout.js` and the five statuses. 💾 `data/` is not in git, so the yard's data, users and passwords stay on the server.

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
- 🗓️ **Picking times:** clicking a date/time field opens a calendar and clock. Quick buttons (*+1 h*, *+2 h*, *Tomorrow 06:00*…) set common times in one click.

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
| 🛣️ Street parking | Below the gate, outside the fence |

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
| `default-layout.js` | Starting yard layout (sections and buildings), copied into the database on first run |
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

- [ ] 💾 **Backups:** nightly automatic copies, a download button and restore steps
- [ ] 🌍 **Deployment:** running as a service on a company server, plus a maintainer guide
- [ ] 🔐 **HTTPS:** needed before real use, so passwords aren't sent unencrypted

---

## 👤 Author

**Truls Lauritzen**: trailer yard management for the distribution center 🚛
