// src/server.js
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Flavr Collector is running ✅ Use GET /health and POST /import");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Allow preflight and show clear errors for wrong methods
app.options("/import", cors());
app.all("/import", async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST /import with JSON { url }" });
  }
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "Missing url" });
  // demo response – replace with real scraping later
  return res.json({
    title: "Imported Recipe",
    image: "",
    timeMinutes: 30,
    sourcePlatform: "Source",
    sourceLink: url,
    author: "",
    ingredients: ["Example ingredient 1", "Example ingredient 2"],
    steps: ["Example step 1", "Example step 2"]
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Flavr Collector listening on ${PORT}`);
});
