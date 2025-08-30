// src/server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// ——— Health & root ———
app.get("/", (_req, res) => {
  res.send("Flavr Collector v2 is running ✅ Use GET /health, GET /trending, POST /import");
});
app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), version: "v2" });
});

// ——— Import (demo) ———
app.post("/import", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "Missing url" });
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

// ——— Trending (YouTube + room to grow) ———
const YT_KEY = (process.env.YOUTUBE_API_KEY || "").trim();
const TRENDING_TTL_MS = (Number(process.env.TRENDING_TTL_MIN) || 15) * 60 * 1000;
const TRENDING_QUERIES = (process.env.TRENDING_QUERIES || "recipe,cooking,meal prep,air fryer").split(",").map(s => s.trim()).filter(Boolean);

const cache = { trending: { ts: 0, data: [] } };

async function fetchYouTubeBatch(query, max=12) {
  if (!YT_KEY) return [];
  const publishedAfter = new Date(Date.now() - 14*24*60*60*1000).toISOString(); // last 14 days
  const u = new URL("https://www.googleapis.com/youtube/v3/search");
  u.searchParams.set("key", YT_KEY);
  u.searchParams.set("part", "snippet");
  u.searchParams.set("type", "video");
  u.searchParams.set("maxResults", String(Math.min(max, 50)));
  u.searchParams.set("order", "viewCount");
  u.searchParams.set("q", query);
  u.searchParams.set("publishedAfter", publishedAfter);

  const r = await fetch(u.toString());
  if (!r.ok) throw new Error("YouTube API error: " + r.status);
  const json = await r.json();

  return (json.items || []).map(it => {
    const v = it?.id?.videoId;
    const s = it?.snippet || {};
    if (!v) return null;
    return {
      id: `yt_${v}`,
      title: s.title,
      image: s.thumbnails?.medium?.url || s.thumbnails?.high?.url || "",
      time: null,
      source: { platform: "YouTube", url: `https://www.youtube.com/watch?v=${v}` },
      ingredients: [],
      steps: [],
      stats: { channel: s.channelTitle, publishedAt: s.publishedAt }
    };
  }).filter(Boolean);
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(x => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

async function buildTrending() {
  let results = [];
  // YouTube queries fan-out
  for (const q of TRENDING_QUERIES) {
    try {
      const batch = await fetchYouTubeBatch(q, 8); // per query
      results = results.concat(batch);
    } catch (e) {
      console.warn("YT fetch fail for", q, e?.message);
    }
  }
  // TODO: Add Instagram/TikTok/Pinterest when you have app tokens:
  // results = results.concat(await fetchInstagram(), await fetchTiktok(), await fetchPinterest())

  // De-dupe and trim
  results = dedupe(results).slice(0, 36);

  return results;
}

async function getTrendingFresh(force=false) {
  const age = Date.now() - cache.trending.ts;
  if (!force && age < TRENDING_TTL_MS && cache.trending.data.length) {
    return cache.trending.data;
  }
  const data = await buildTrending();
  cache.trending = { ts: Date.now(), data };
  return data;
}

// public trending endpoint
app.get("/trending", async (_req, res) => {
  try {
    const data = await getTrendingFresh(false);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// optional: secure refresh endpoint for cron
app.post("/admin/refresh-trending", async (req, res) => {
  const key = req.headers["x-cron-key"] || req.query.key;
  if ((process.env.CRON_KEY || "") && key !== process.env.CRON_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const data = await getTrendingFresh(true);
  res.json({ ok: true, count: data.length, refreshedAt: new Date().toISOString() });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Flavr Collector listening on ${PORT}`);
});
