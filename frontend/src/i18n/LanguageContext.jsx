import { createContext, useContext, useEffect, useMemo, useState } from "react";

// Every file in ./dict/*.js exports { km: {...}, en: {...} } with keys
// already prefixed by that file's own namespace (e.g. "navbar.about",
// "login.title") so merging them all here can never collide — each page
// owns its own dictionary file and never has to touch anyone else's.
// import.meta.glob (Vite) auto-discovers every dict file, so adding a new
// page's translations is just adding a new file, no registration needed.
const modules = import.meta.glob("./dict/*.js", { eager: true });

function buildTranslations() {
  const km = {};
  const en = {};
  Object.values(modules).forEach((mod) => {
    if (mod?.km) Object.assign(km, mod.km);
    if (mod?.en) Object.assign(en, mod.en);
  });
  return { km, en };
}

const translations = buildTranslations();

const STORAGE_KEY = "appLanguage";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "km" || saved === "en") return saved;
    } catch {
      // localStorage unavailable (private mode, etc.) — fall through.
    }
    return "km"; // Khmer is this site's default language.
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Best-effort only — the app still works without persisting.
    }
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang) => setLanguageState(lang === "en" ? "en" : "km");
  const toggleLanguage = () => setLanguageState((prev) => (prev === "km" ? "en" : "km"));

  // t(key, fallback?) — current language, falling back to English, then to
  // the given fallback, then to the raw key — so a missing translation is
  // visibly obvious in the UI rather than silently blank.
  const t = (key, fallback) => {
    const dict = translations[language] || translations.km;
    if (dict[key] !== undefined) return dict[key];
    if (translations.en[key] !== undefined) return translations.en[key];
    return fallback !== undefined ? fallback : key;
  };

  const value = useMemo(() => ({ language, setLanguage, toggleLanguage, t }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
