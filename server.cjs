// SellX dashboard — static server for cPanel "Setup Node.js App"
//
// The dashboard is a Vite SPA (static files in dist-web/). This tiny Express
// server serves those built files and falls back to index.html for client-side
// routes (React Router), so deep links / refresh work.
//
// Named .cjs because package.json has "type": "module" — this guarantees the
// file runs as CommonJS regardless of that setting.
//
// Prerequisite: run `npm run build:web` so dist-web/ exists.

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000; // cPanel/Passenger injects PORT
const DIST = path.join(__dirname, "dist-web");

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(
    "[server] dist-web/index.html not found. Run `npm run build:web` first."
  );
}

// Serve built static assets (hashed JS/CSS/images) with long cache.
app.use(
  express.static(DIST, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

// SPA fallback: any non-file route → index.html (client-side routing).
app.get("*", (req, res) => {
  res.sendFile(path.join(DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[server] SellX dashboard listening on port ${PORT}`);
});
