// Remembers the browser's "install this app" offer (Android Chrome / desktop
// Chrome & Edge fire `beforeinstallprompt` once) so the welcome guide can
// show a real "Install" button later. iPhone Safari never fires it — the
// guide shows the Share → Add to Home Screen steps instead.
let deferred = null;
const listeners = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((f) => f(true));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((f) => f(false));
  });
}

export const canPromptInstall = () => Boolean(deferred);
export const onInstallAvailable = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export async function promptInstall() {
  if (!deferred) return "unavailable";
  deferred.prompt();
  const choice = await deferred.userChoice.catch(() => null);
  deferred = null;
  return choice?.outcome || "dismissed";
}

// Already running as the installed app?
export const isInstalled = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

export function platform() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && "ontouchend" in document)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}
