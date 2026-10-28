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

Set `PORT` to use another port.

## Layout

| Path | What it is |
|---|---|
| `server.js` | Web server |
| `public/index.html` | The yard map page (started as the `yard-lot3.html` prototype) |
