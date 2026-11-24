// /verify/:id (rewritten here by vercel.json) — the player page, with its
// own <title>, description, link preview and structured data filled in
// on the server, so Google, Facebook and Telegram see the player's name
// and team even without running the app's JavaScript. People still get the
// normal app: the same index.html, just with better <head> tags.
//
// Shown to search engines: name (Latin + Khmer), team(s), role, verified
// status and photo. NOT the birth date or address.
import { SITE, SITE_NAME, API, esc, getJson } from "./_seo.js";

const STATUS_KM = { VERIFIED: "បានផ្ទៀងផ្ទាត់", PENDING: "កំពុងពិនិត្យ", REJECTED: "មិនត្រូវបានអនុម័ត" };

let shellCache = { html: "", at: 0 };
async function shell(host) {
  // The built index.html of this same deployment (cached for 5 minutes).
  if (shellCache.html && Date.now() - shellCache.at < 5 * 60 * 1000) return shellCache.html;
  const res = await fetch(`https://${host}/index.html`, { signal: AbortSignal.timeout(5000) });
  const html = await res.text();
  shellCache = { html, at: Date.now() };
  return html;
}

// Replace the default <head> SEO block (between the SEO markers in
// index.html) with this page's own tags.
function inject(html, tags) {
  const start = html.indexOf("<!-- SEO:START -->");
  const end = html.indexOf("<!-- SEO:END -->");
  if (start === -1 || end === -1) return html.replace("</head>", `${tags}\n</head>`);
  return html.slice(0, start) + tags + html.slice(end + "<!-- SEO:END -->".length);
}

export default async function handler(req, res) {
  const id = String(req.query.id || "").trim();
  const url = `${SITE}/verify/${encodeURIComponent(id)}`;
  let html;
  try {
    html = await shell(req.headers.host || "id.brathna.com");
  } catch {
    res.statusCode = 302;
    res.setHeader("Location", `/?r=${encodeURIComponent(`/verify/${id}`)}`);
    return res.end();
  }

  let a = null;
  let notFound = false;
  try {
    a = await getJson(`${API}/api/athletes/verify/${encodeURIComponent(id)}`);
  } catch (err) {
    notFound = err.status === 404;
  }

  let tags;
  if (a && a.fullName) {
    const teams = (a.memberships || []).map((m) => m.team).filter(Boolean);
    const teamText = teams.join(", ") || a.team || "";
    const roles = [...new Set((a.memberships || []).map((m) => m.role).filter(Boolean))].join(", ");
    const name = a.khmerName ? `${a.fullName} (${a.khmerName})` : a.fullName;
    const title = `${name}${teamText ? ` — ${teamText}` : ""} | ${SITE_NAME}`;
    const statusKm = STATUS_KM[a.status] || "";
    const desc =
      `${name}${roles ? ` · ${roles}` : ""}${teamText ? ` · ${teamText}` : ""}. ` +
      `${statusKm ? `ស្ថានភាព៖ ${statusKm}។ ` : ""}` +
      `ផ្ទៀងផ្ទាត់អត្តសញ្ញាណកីឡាករបាល់ទាត់ ID ${a.verifyId} — Verified football player ID on ${SITE_NAME}, Siem Reap, Cambodia.`;
    const image = a.photoUrl && /^https?:\/\//.test(a.photoUrl) ? a.photoUrl : `${SITE}/icon-512.png`;
    const person = {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url,
      name: title,
      mainEntity: {
        "@type": "Person",
        name: a.fullName,
        ...(a.khmerName ? { alternateName: a.khmerName } : {}),
        identifier: a.verifyId,
        ...(a.photoUrl && /^https?:\/\//.test(a.photoUrl) ? { image: a.photoUrl } : {}),
        ...(roles ? { jobTitle: roles } : {}),
        ...(teams.length ? { memberOf: teams.map((t) => ({ "@type": "SportsTeam", name: t, sport: "Football" })) } : {}),
      },
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE },
          { "@type": "ListItem", position: 2, name: "ស្វែងរកកីឡាករ", item: `${SITE}/search` },
          { "@type": "ListItem", position: 3, name: a.fullName, item: url },
        ],
      },
    };
    tags = `
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="${esc(SITE_NAME)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:locale" content="km_KH" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${esc(image)}" />
    <script type="application/ld+json">${JSON.stringify(person).replace(/</g, "\\u003c")}</script>
    `;
  } else {
    // Unknown / not approved / server asleep: normal page, but don't let
    // search engines index an empty or missing profile.
    tags = `
    <title>${esc(`Player ${id} | ${SITE_NAME}`)}</title>
    <meta name="robots" content="noindex" />
    <link rel="canonical" href="${esc(url)}" />
    `;
  }

  res.statusCode = notFound ? 404 : 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Cache at Vercel's edge for 10 minutes; serve stale while refreshing.
  res.setHeader("Cache-Control", a ? "public, s-maxage=600, stale-while-revalidate=86400" : "public, s-maxage=60");
  res.end(inject(html, tags));
}
