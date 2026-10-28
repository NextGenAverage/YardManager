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

## Code layout

| Path | What it is |
|---|---|
| `server.js` | Web server and the `/api/...` endpoints |
| `db.js` | SQLite schema, upgrades (`migrations`) and yard queries |
| `default-layout.js` | Starting yard layout, copied into the database on first run |
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

The page uses plain JavaScript modules (`import` / `export`), so there is no
build step: edit a file and reload the browser.

## Changing the database schema

Add a new SQL string at the end of `migrations` in `db.js`. On startup the app
runs any migrations the database hasn't had yet. Never edit a migration that
has already been run on the real server.
