import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Keeps the browser-tab title, description and "robots" tag right as people
// move around the app (Google runs the app's JavaScript and reads these).
// Public pages get their own title/description; logged-in pages are marked
// noindex. Player pages (/verify/:id) set their own from the player's data
// (VerifyPage) — and are also filled in on the server (api/player.js).
const SITE = "Countryside Football ID Verify";
const DEFAULT_DESC =
  "ផ្ទៀងផ្ទាត់អត្តសញ្ញាណកីឡាករបាល់ទាត់ជនបទ ខេត្តសៀមរាប — ស្វែងរកកីឡាករតាមឈ្មោះ ឬ ID។ Verify football players in Siem Reap, Cambodia.";

const PAGES = {
  "/": [`${SITE} — ផ្ទៀងផ្ទាត់អត្តសញ្ញាណកីឡាករបាល់ទាត់ | Siem Reap`, DEFAULT_DESC],
  "/search": [
    `ស្វែងរកកីឡាករបាល់ទាត់ — Search football players | ${SITE}`,
    "ស្វែងរកកីឡាករតាមឈ្មោះ (ខ្មែរ ឬឡាតាំង) ឬលេខ ID ហើយពិនិត្យក្រុម និងស្ថានភាពផ្ទៀងផ្ទាត់។ Search players by name or ID and check their team and verified status.",
  ],
  "/shop": [
    `BRATHNA SPORT SHOP — ហាងសម្ភារៈកីឡា | ${SITE}`,
    "ហាងសម្ភារៈកីឡា BRATHNA SPORT SHOP ឃុំនគរភាស ស្រុកអង្គរជុំ ខេត្តសៀមរាប — បាល់ អាវ ពាន មេដាយ។ Football gear, jerseys, trophies and medals in Siem Reap. ☎ 085 925 752",
  ],
  "/pricing": [`តម្លៃសេវា — Pricing | ${SITE}`, "តម្លៃសេវាសម្រាប់ក្រុមបាល់ទាត់។ Plans for football teams using Countryside Football ID Verify."],
  "/about": [`អំពីយើង — About | ${SITE}`, "អំពី Countryside Football ID Verify — ប្រព័ន្ធផ្ទៀងផ្ទាត់កីឡាករបាល់ទាត់ជនបទ ខេត្តសៀមរាប។ About the project."],
  "/login": [`ចូលគណនី — Login | ${SITE}`, DEFAULT_DESC],
};
const PUBLIC = Object.keys(PAGES);

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}
function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// For pages that know more (e.g. a player's page once it has loaded).
export function setPageMeta(title, description) {
  if (title) {
    document.title = title;
    setMeta("property", "og:title", title);
  }
  if (description) {
    setMeta("name", "description", description);
    setMeta("property", "og:description", description);
  }
}

export default function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith("/verify/")) return; // VerifyPage + api/player.js handle it
    const page = PAGES[pathname];
    const isPublic = PUBLIC.includes(pathname) && pathname !== "/login";
    const [title, desc] = page || [SITE, DEFAULT_DESC];
    setPageMeta(title, desc);
    setMeta("name", "robots", isPublic ? "index, follow, max-image-preview:large" : "noindex");
    setCanonical(`https://id.brathna.com${isPublic ? pathname : "/"}`);
    setMeta("property", "og:url", `https://id.brathna.com${pathname}`);
  }, [pathname]);
  return null;
}
