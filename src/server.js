// src/server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import Parser from "rss-parser";                   // <-- ADD


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
const parser = new Parser({ headers: { "User-Agent": "FlavrCollector/1.0" } });

/** Top recipe blogs (RSS). You can add/remove freely. */
const BLOG_FEEDS = [
  "https://www.seriouseats.com/rss",
  "https://www.bonappetit.com/feed/rss",
  "https://www.simplyrecipes.com/feed",
  "https://feeds.feedburner.com/food52-TheAandBofCooking",     // Food52
  "https://www.bbcgoodfood.com/recipes/feed",                  // BBC Good Food
  "https://smittenkitchen.com/feed/",                          // Smitten Kitchen
  "https://pinchofyum.com/feed",                               // Pinch of Yum
];

/** YouTube channel RSS feeds (replace with your favorites).
 *  Tip: open a channel, click "View page source", search for "channel_id"
 *  Then: https://www.youtube.com/feeds/videos.xml?channel_id=YOUR_ID
 */
const YOUTUBE_FEEDS = [
  // "https://www.youtube.com/feeds/videos.xml?channel_id=UChBEbMKI1eCcejTtmI32UEw", // Joshua Weissman (example)
  // "https://www.youtube.com/feeds/videos.xml?channel_id=UCbpMy0Fg74eXXkvxJrtEn3w", // Food Wishes (example)
  // "https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg", // Bon Appétit (example)
];

/** Curated social/video links (TikTok, Instagram, X, YT shorts, etc.) */
const VIDEO_LINKS = [
  // Add public recipe post URLs here, one per line
  // "https://www.tiktok.com/@user/video/123...",
  // "https://www.instagram.com/p/ABC123...",
];

// Small helper: try platform oEmbed to get title/thumbnail fast
async function oembedMeta(url) {
  try {
    let endpoint = null;
    const u = url.toLowerCase();
    if (u.includes("youtube.com") || u.includes("youtu.be")) {
      endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    } else if (u.includes("tiktok.com")) {
      endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    } else if (u.includes("twitter.com") || u.includes("x.com")) {
      endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
    }
    if (!endpoint) return null;
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Quick guess for total minutes if found in title; else default 30.
function estimateMinutes(title) {
  const m = String(title || "").match(/(\d+)\s*min/i);
  return m ? parseInt(m[1], 10) : 30;
}

// Normalize to Flavr recipe shape
function toFlavrItem({ title, image, link, platform = "Source" }) {
  return {
    id: "disc_" + Math.random().toString(36).slice(2),
    title: title || "Imported",
    image: image || "https://images.unsplash.com/photo-1490818387583-1baba5e638af?q=80&w=1600&auto=format&fit=crop",
    time: estimateMinutes(title),
    difficulty: "Easy",
    rating: 0,
    calories: null,
    cuisine: "Imported",
    dietTags: [],
    source: { platform, handle: "", url: link },
    videoUrl: link,       // if it’s a video, player will use this
    ingredients: [],
    steps: [],
    tags: ["imported"],
    saves: 0,
  };
}

// NEW: /discover – aggregates blog feeds + optional video links
app.get("/discover", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().toLowerCase();
    const max = Math.min(parseInt(req.query.limit || "30", 10), 60);

    const out = [];

    // 1) Blog RSS → items
    for (const feedUrl of BLOG_FEEDS) {
      try {
        const feed = await parser.parseURL(feedUrl);
        for (const item of (feed.items || []).slice(0, 8)) {
          const img =
            item.enclosure?.url ||
            item["media:content"]?.url ||
            item["media:thumbnail"]?.url ||
            null;

          const rec = toFlavrItem({
            title: item.title,
            image: img,
            link: item.link,
            platform: "Blog",
          });
          rec.videoUrl = null; // most blog posts are articles, not direct videos
          out.push(rec);
        }
      } catch (e) {
        console.error("RSS error", feedUrl, e.message);
      }
    }

    // 2) YouTube channel feeds → items (videoUrl = link)
    for (const feedUrl of YOUTUBE_FEEDS) {
      try {
        const feed = await parser.parseURL(feedUrl);
        for (const item of (feed.items || []).slice(0, 5)) {
          const link = item.link;
          const meta = await oembedMeta(link); // grab thumbnail/title reliably
          const rec = toFlavrItem({
            title: meta?.title || item.title || link,
            image: meta?.thumbnail_url || null,
            link,
            platform: "YouTube",
          });
          rec.videoUrl = link; // will play inline in the app
          out.push(rec);
        }
      } catch (e) {
        console.error("YT RSS error", feedUrl, e.message);
      }
    }

    // 3) Curated social/video URLs (TikTok/IG/X/etc.) → use oEmbed
    for (const link of VIDEO_LINKS) {
      try {
        const meta = await oembedMeta(link);
        const rec = toFlavrItem({
          title: meta?.title || link,
          image: meta?.thumbnail_url || null,
          link,
          platform: "Video",
        });
        rec.videoUrl = link;
        out.push(rec);
      } catch (e) {
        console.error("VIDEO_LINKS error", link, e.message);
      }
    }

    // optional extra filter (server-side)
    const filtered = q
      ? out.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            (r.tags || []).some((t) => t.toLowerCase().includes(q))
        )
      : out;

    // stable-ish sort: newest first if date present else keep insertion order
    const sorted = filtered; // keep simple for now

    res.json(sorted.slice(0, max));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "discover_failed" });
  }
});

