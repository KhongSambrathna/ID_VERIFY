import { useEffect, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

// "Install app" button in the navbar.
//   • Android / Chrome / Edge: the browser fires `beforeinstallprompt`; we
//     keep it and show the real install dialog when the button is tapped.
//   • iPhone / iPad (Safari has no install prompt): tapping shows a short
//     "Share → Add to Home Screen" guide instead.
//   • Already opened as the installed app: the button hides itself.
function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;

export default function InstallAppButton({ onDone }) {
  const { t } = useLanguage();
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!deferred && !isIOS()) return null; // browser doesn't offer install (or already installed)

  const click = async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferred(null);
      onDone?.();
    } else {
      setShowIosHelp(true);
    }
  };

  return (
    <>
      <button type="button" className="install-app-btn" onClick={click}>
        ⬇ {t("installApp.button")}
      </button>
      {showIosHelp && (
        <div className="install-ios-backdrop" onClick={() => setShowIosHelp(false)}>
          <div className="install-ios-box" onClick={(e) => e.stopPropagation()}>
            <img src="/icon-192.png" alt="" width="56" height="56" />
            <h3>{t("installApp.iosTitle")}</h3>
            <ol>
              <li>{t("installApp.iosStep1")}</li>
              <li>{t("installApp.iosStep2")}</li>
              <li>{t("installApp.iosStep3")}</li>
            </ol>
            <button type="button" className="btn btn-primary" onClick={() => setShowIosHelp(false)}>
              {t("installApp.ok")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
