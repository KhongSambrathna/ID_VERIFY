import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/axios";

const VISITOR_KEY = "visitorId";
// document.referrer never changes inside a single-page app, so it is only
// sent with the first page of the visit (where it really applies).
let referrerSent = false;

// A random id kept in this browser so repeat visits count as one visitor.
// It identifies a browser, not a person — no name or account is in it.
function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id =
        (crypto.randomUUID && crypto.randomUUID()) ||
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

// Reports every page opened to /api/analytics/track for the admin
// Analytics page. The shared axios instance attaches the login token when
// there is one, so views from signed-in users are linked to their account.
// Failures are ignored — tracking must never get in a visitor's way.
export default function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => {
      const ref = document.referrer || "";
      const referrer = !referrerSent && ref && !ref.startsWith(window.location.origin) ? ref : "";
      referrerSent = true;
      api
        .post("/analytics/track", {
          path: location.pathname,
          visitorId: getVisitorId(),
          referrer,
          screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
          language: navigator.language || "",
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [location.pathname]);
}
