# Yard Manager

Shared trailer yard map for the distribution center: dock doors, trailer
parking and unassigned trailers, live for every shift.

## Run it

Requires Node.js 22 or newer.

```sh
npm install
npm start          # http://localhost:3000
npm run dev        # same, restarts automatically when files change
```

Settings (environment variables):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Web server port |
| `DATA_DIR` | `./data` | Folder holding the database file `yard.db` |

The database is created on first start, with the original yard layout and
statuses (Loading, Unloading, Loaded, Empty, Undefined).

## Users and roles

Everyone logs in. Create the first admin from the project folder:

```sh
npm run create-admin -- <username> "<Full name>"
```

It prints a temporary password; the admin chooses their own at first login.
After that, admins add users on the **Manage** page, Users tab (link in the map header).
New users also get a temporary password to change at first login.

| Role | Can |
|---|---|
| Viewer | See the map and history (e.g. a screen in the office) |
| Worker | Also change status, damaged and note on trailers in the yard |
| Operator | Also add, move, depart and remove trailers, correct times, and manage the trailer register |
| Admin | Also manage users, carriers and the map layout |

- Logins last 12 hours (one shift); viewer logins last 30 days and renew
  while in use, so a wall screen stays logged in.
- Changing someone's role, deactivating them or resetting their password
  logs them out everywhere.
- 5 wrong passwords lock that username for 5 minutes.
- **Locked out?** Run `npm run create-admin -- <username>` for an existing
  user: they become an active admin with a new temporary password.

## Trailers: reg. number, trailer ID and carrier

The map shows each trailer's **reg. number** (licence plate) with a small
**carrier** badge (e.g. DSV, INT). Each reg. number is linked to one **trailer
ID** (the carrier's longer trailer name) and carrier in the trailer register:

- Typing a known reg. number in the edit sheet fills in its trailer ID and
  carrier, locked.
- For a new reg. number, operators must enter the trailer ID (and pick the
  carrier); saving adds it to the register.
- Links are changed or deleted on the **Manage** page, Trailers tab. Every
  change is in the history with who made it.
- Search finds trailers by reg. number, trailer ID, carrier or note.
- Reg. numbers are stored in capitals without spaces (`ab 12345` = `AB12345`).

### Importing the trailer list (CSV)

Manage > Trailers > *Import from CSV file*. The file needs the columns
**Car** / Supplier (carrier code or name), **Ilu** / Trailer ID and **Reg**, in any order;
other columns are ignored. Comma, semicolon (Norwegian Excel) and tab separated
files work; in Excel use *Save as → CSV*. Other accepted header names are listed
at the top of `csv-import.js`.

The import first shows a preview (new, changed, unchanged, skipped rows and
why); nothing is saved until you press *Import*. Reg. numbers that are not in
the file are kept. Rows with an unknown carrier are skipped: add the carrier on
Manage > Carriers (admins) and import again.

A reg. number listed more than once with different details (e.g. under both INT
and DSV, or with two trailer IDs) is a conflict: the preview asks what to do with
each one (skip, the default; use one of its lines; or edit the trailer ID and
carrier), with "set all to skip / first line / last line" for many at once. The same trailer ID on two reg. numbers is imported but
listed under *Check* (often a typo in one of the reg. numbers). Files saved by
Excel in UTF-8 or the older Windows encoding both work.

## Changing the yard layout (map editor)

Admins change the map on **Manage > Map**: select a section (a row of doors or
a block of spots) or a building, drag it or use the arrow keys, and edit its
details on the right (spots, direction, sizes, default status). **+ Section**
and **+ Building** add new ones. Nothing changes for others until **Save
layout**; then every open map updates.

The server checks the layout before saving (`layout.js`): spot names must be
unique, and a spot with a trailer on it can't disappear or be renamed (move the
trailer first). Each save keeps the layout it replaced; **Earlier layouts**
lists them with a *Restore* button.

Section types: *Doors*, *Parking*, *Unassigned* (shown in the side panel next
to the map) and *Street parking* (shown below the gate).

## Code layout

| Path | What it is |
|---|---|
| `server.js` | Web server and the yard `/api/...` endpoints, with the role each needs |
| `auth.js` | Passwords, sessions, roles and user accounts |
| `auth-routes.js` | Login, logout, password change and the admin's user endpoints |
| `layout.js` | Checks a layout from the map editor before it is saved |
| `csv-import.js` | Reads the CSV trailer list (columns, separators, checks) |
| `scripts/create-admin.js` | Creates the first admin / recovers admin access |
| `db.js` | SQLite schema, upgrades (`migrations`) and yard queries |
| `default-layout.js` | Starting yard layout (sections and buildings), copied into the database on first run |
| `public/index.html` | The yard map page: markup only (started as the `yard-lot3.html` prototype) |
| `public/css/yard.css` | All page styles, grouped by part of the page |
| `public/js/main.js` | Starts the page: taps on spots, moving trailers, keyboard, live updates |
| `public/js/map.js` | Draws the map, the Unassigned side panel, legend and search highlight |
| `public/js/sheet.js` | The edit sheet that opens when a spot is tapped |
| `public/js/history.js` | The history panel |
| `public/js/zoom.js` | Zoom and Fit |
| `public/js/api.js` | Requests to the server |
| `public/js/store.js` | The yard state shared by the modules above |
| `public/js/util.js` | Small helpers (escaping, time formatting) |
| `public/login.html`, `public/js/login.js` | Login and choosing a new password |
| `public/manage.html`, `public/js/manage.js` | Manage page (operators/admins): picks the tabs |
| `public/js/manage-trailers.js` | Manage > Trailers: the trailer register |
| `public/js/manage-map.js` | Manage > Map: the map editor (admins) |
| `public/js/geometry.js` | Layout sizes shared by the map and the editor |
| `public/js/manage-carriers.js` | Manage > Carriers (admins) |
| `public/js/manage-users.js` | Manage > Users (admins) |

The page uses plain JavaScript modules (`import` / `export`), so there is no
build step: edit a file and reload the browser.

## Changing the database schema

Add a new SQL string at the end of `migrations` in `db.js`. On startup the app
runs any migrations the database hasn't had yet. Never edit a migration that
has already been run on the real server.
