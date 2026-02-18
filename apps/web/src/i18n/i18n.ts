import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import ptBR from "./locales/pt-BR.json";
import enUS from "./locales/en-US.json";
import es from "./locales/es.json";
import zhCN from "./locales/zh-CN.json";
import ja from "./locales/ja.json";

export const SUPPORTED_LANGUAGES = [
  { code: "pt-BR", label: "Português (BR)", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "en-US", label: "English", flag: "\u{1F1FA}\u{1F1F8}" },
  { code: "es", label: "Español", flag: "\u{1F1EA}\u{1F1F8}" },
  { code: "zh-CN", label: "\u4E2D\u6587 (\u7B80\u4F53)", flag: "\u{1F1E8}\u{1F1F3}" },
  { code: "ja", label: "\u65E5\u672C\u8A9E", flag: "\u{1F1EF}\u{1F1F5}" },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      "pt-BR": { translation: ptBR },
      "en-US": { translation: enUS },
      es: { translation: es },
      "zh-CN": { translation: zhCN },
      ja: { translation: ja },
    },
    fallbackLng: "en-US",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "agenthub:language",
      caches: ["localStorage"],
    },
  });

export default i18n;
