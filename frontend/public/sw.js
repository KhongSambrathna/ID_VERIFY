// Service worker — makes the site installable as a home-screen app and
// keeps it opening quickly (and showing the last-loaded screen) on a weak
// or missing connection.
//
//   • Page navigations: network first, fall back to the cached app shell
//     when offline (this is a single-page app, so one index.html serves
//     every route).
//   • Built JS/CSS (/assets/*, hashed filenames), icons, fonts: cache first.
//   • API calls (/api/…) and anything on another origin except Google
//     Fonts: never cached — data must always be live.
//
// Bump CACHE_VERSION to force every installed copy to drop its old cache.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `cfid-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `cfid-assets-${CACHE_VERSION}`;
const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, ASSET_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== self.location.origin && !isFont) return; // API, Cloudinary, etc.
  if (url.pathname.startsWith("/api/")) return;

  // App pages: try the network, fall back to the cached shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static files: cache first, then fill the cache from the network.
  if (isFont || url.pathname.startsWith("/assets/") || /\.(png|jpe?g|svg|ico|webp|woff2?|ttf|css|js)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok || res.type === "opaque") {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});
