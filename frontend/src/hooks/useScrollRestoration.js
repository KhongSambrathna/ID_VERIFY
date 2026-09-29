import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Client-side scroll position restoration for a list page.
//
// Why this is needed: this app doesn't use React Router's data-router
// <ScrollRestoration>, and the browser's own native scroll restoration
// (history.scrollRestoration = "auto") fires the moment you navigate back
// — which is BEFORE this page has finished re-fetching its data, so the
// page is still short (just the header, no rows yet). The browser's
// restore attempt silently fails at that height, and once the data
// arrives and the page grows tall again, nothing re-attempts the scroll —
// you're stuck at the top. That's the bug this hook fixes.
//
// Usage: call useScrollRestoration(ready) in a list page, where `ready`
// becomes true once the page's real content height is actually in place
// (usually just `!loading`, once the fetched rows have rendered).
//
// How it works: the current scroll position is continuously saved to
// sessionStorage, keyed by the page's path, so it's always current by the
// time you navigate away (link click, back/forward button, closing the
// tab — no special "on navigate away" hook needed). Once `ready` flips to
// true after landing back on this page, the saved position is restored.
export default function useScrollRestoration(ready) {
  const { pathname } = useLocation();
  const key = `scrollPos:${pathname}`;
  const restoredForKeyRef = useRef(null);

  // Hand scroll restoration over to us entirely, once, so the browser's
  // own (unreliable, for a client-rendered SPA) auto-restore never fights
  // with ours.
  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return;
    const prev = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = prev;
    };
  }, []);

  // Continuously save the scroll position for this path — cheap (one
  // rAF-throttled write), and means it's current no matter how the user
  // eventually leaves this page.
  useEffect(() => {
    let raf = null;
    const save = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        try {
          sessionStorage.setItem(key, String(window.scrollY));
        } catch {
          // sessionStorage unavailable (private mode, blocked) — scroll
          // restoration just won't happen next time; never fatal.
        }
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [key]);

  // Restore once (per path) as soon as the page reports it's actually
  // ready — restoring any earlier is exactly what causes the bug.
  useEffect(() => {
    if (!ready || restoredForKeyRef.current === key) return;
    restoredForKeyRef.current = key;
    let saved = null;
    try {
      saved = sessionStorage.getItem(key);
    } catch {
      saved = null;
    }
    if (saved === null) return;
    // Wait one paint so the now-rendered content's full height exists
    // before we try to scroll into it.
    requestAnimationFrame(() => {
      window.scrollTo(0, Number(saved) || 0);
    });
  }, [ready, key]);
}
