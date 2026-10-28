// Yard Manager web server: serves the map page and (later) the shared API.
const path = require("path");
const express = require("express");

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Yard Manager running on http://localhost:${PORT}`);
});
