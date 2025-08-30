import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Version banner so you can verify deploys
app.get("/", (_req, res) => {
  res.send("Flavr Collector v1.1 is running ✅ Use GET /health and POST /import");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Handle preflight and give a clear message for wrong method
app.all("/import", async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.sendStatus(204);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST /import with JSON { url }" });
  }

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "Missing url" });

  // Demo response (we’ll add real Pinterest parsing later)
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
app.listen(PORT, "0.0.0.0", () => console.log("Flavr Collector listening on " + PORT));
