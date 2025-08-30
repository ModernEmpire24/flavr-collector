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
// Trending feed (stub). Replace with API-backed results later.
app.get("/trending", (_req, res) => {
  res.json([
    {
      id: "yt_1",
      title: "Ultimate Weeknight Pasta",
      image: "https://images.unsplash.com/photo-1521389508051-d7ffb5dc8bbf?q=80&w=1600&auto=format&fit=crop",
      time: 25,
      source: { platform: "YouTube", url: "https://youtube.com" },
      ingredients: [{ item:"Pasta", amount:"12 oz" }, { item:"Garlic", amount:"3 cloves" }],
      steps: [{ text:"Boil pasta" }, { text:"Make sauce" }]
    },
    {
      id: "ig_1",
      title: "10-Minute Avocado Toast Upgrade",
      image: "https://images.unsplash.com/photo-1548940740-204726a19be3?q=80&w=1600&auto=format&fit=crop",
      time: 10,
      source: { platform: "Instagram", url: "https://instagram.com" },
      ingredients: [{ item:"Sourdough", amount:"2 slices" }, { item:"Avocado", amount:"1" }],
      steps: [{ text:"Toast bread" }, { text:"Smash avocado" }]
    }
  ]);
});
app.listen(PORT, "0.0.0.0", () => console.log("Flavr Collector listening on " + PORT));
