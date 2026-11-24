// /sitemap.xml (rewritten here by vercel.json) — the list of pages search
// engines should know about: the public pages + every approved player.
import { SITE, API, getJson } from "./_seo.js";

const PUBLIC_PAGES = [
  { path: "/", priority: "1.0", freq: "daily" },
  { path: "/search", priority: "0.9", freq: "daily" },
  { path: "/shop", priority: "0.7", freq: "weekly" },
  { path: "/pricing", priority: "0.5", freq: "monthly" },
  { path: "/about", priority: "0.5", freq: "monthly" },
];

export default async function handler(req, res) {
  let players = [];
  try {
    players = await getJson(`${API}/api/athletes/seo-list`, 9000);
  } catch {
    /* server asleep — still return the public pages */
  }
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...PUBLIC_PAGES.map((p) => `<url><loc>${SITE}${p.path}</loc><lastmod>${today}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`),
    ...players.map(
      (p) =>
        `<url><loc>${SITE}/verify/${encodeURIComponent(p.id)}</loc>${p.updated ? `<lastmod>${String(p.updated).slice(0, 10)}</lastmod>` : ""}<changefreq>monthly</changefreq><priority>0.6</priority></url>`
    ),
  ];
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", players.length ? "public, s-maxage=3600, stale-while-revalidate=86400" : "public, s-maxage=120");
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
}
