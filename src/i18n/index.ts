import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import ar from "./locales/ar.json";
import { applyRuntimeLocale } from "./runtime-translator";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, de: { translation: de }, fr: { translation: fr }, es: { translation: es }, ar: { translation: ar } },
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  })
  .then(() => {
    // Kick off runtime DOM translation once i18n is ready.
    applyRuntimeLocale(i18n.language);
  });

i18n.on("languageChanged", (lng) => {
  applyRuntimeLocale(lng);
  // When switching back to a non-German language, reload once so already-swapped
  // German text nodes revert to their original English source cleanly.
  const primary = (lng || "en").split("-")[0].toLowerCase();
  const prev = (i18n as unknown as { __lastLang?: string }).__lastLang;
  (i18n as unknown as { __lastLang?: string }).__lastLang = primary;
  if (prev === "de" && primary !== "de" && typeof window !== "undefined") {
    // Small delay so the localStorage cache write from LanguageDetector completes.
    setTimeout(() => window.location.reload(), 50);
  }
});

export default i18n;
