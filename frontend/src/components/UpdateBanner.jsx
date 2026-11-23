import { useEffect, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

// "New version available" bar. An installed app (home-screen) usually isn't
// closed — the phone just brings the old screen back — so it would keep
// running an old version for days. Whenever the app comes back to the
// screen (and every 15 minutes while open) we fetch the site's index.html
// fresh and compare its main script file name (it changes with every
// deploy). Different → show a bar; tapping it reloads into the new version.
const currentBuild = () => {
  const s = document.querySelector('script[type="module"][src*="/assets/index-"]');
  return s ? s.getAttribute("src").match(/index-[\w-]+\.js/)?.[0] : null;
};

export default function UpdateBanner() {
  const { t } = useLanguage();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    const mine = currentBuild();
    if (!mine) return undefined;
    let last = 0;
    const check = async () => {
      if (Date.now() - last < 15 * 1000) return; // at most every 15 s
      last = Date.now();
      try {
        const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
        const html = await res.text();
        const live = html.match(/\/assets\/(index-[\w-]+\.js)/)?.[1];
        if (live && live !== mine) {
          setReady(true);
          navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
        }
      } catch {
        /* offline — try later */
      }
    };
    const onShow = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    window.addEventListener("online", check);
    const h = setInterval(check, 15 * 60 * 1000);
    check();
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("online", check);
      clearInterval(h);
    };
  }, []);

  if (!ready) return null;
  return (
    <button type="button" className="update-banner" onClick={() => window.location.reload()}>
      🔄 {t("update.available")} <b>{t("update.tap")}</b>
    </button>
  );
}
