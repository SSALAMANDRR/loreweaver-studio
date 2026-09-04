import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "./locales/en.json"
import modelAuthEn from "./locales/model-auth-en.json"
import modelAuthRu from "./locales/model-auth-ru.json"
import modelAuthZh from "./locales/model-auth-zh.json"
import playFixesEn from "./locales/play-fixes-en.json"
import playFixesRu from "./locales/play-fixes-ru.json"
import playFixesZh from "./locales/play-fixes-zh.json"
import ru from "./locales/ru.json"
import ruStudioAi from "./locales/ru-studio-ai.json"
import ruStudioCore from "./locales/ru-studio-core.json"
import ruStudioMisc from "./locales/ru-studio-misc.json"
import ruStudioPack from "./locales/ru-studio-pack.json"
import ruStudioSplit from "./locales/ru-studio-split.json"
import ruStudioWizard from "./locales/ru-studio-wizard.json"
import zh from "./locales/zh.json"

const STORAGE_KEY = "lw-lang"

const enMerged = {
  ...en,
  play: {
    ...en.play,
    menu: {
      ...en.play.menu,
      role: {
        ...en.play.menu.role,
        player: playFixesEn.rolePlayer,
      },
    },
    model: {
      ...en.play.model,
      ...modelAuthEn,
    },
    skills: {
      ...en.play.skills,
      ...playFixesEn.skills,
    },
  },
}

const ruMerged = {
  ...ru,
  play: {
    ...ru.play,
    menu: {
      ...ru.play.menu,
      role: {
        ...ru.play.menu.role,
        player: playFixesRu.rolePlayer,
      },
    },
    model: {
      ...ru.play.model,
      ...modelAuthRu,
    },
    skills: {
      ...ru.play.skills,
      ...playFixesRu.skills,
    },
  },
  studio: {
    ...ruStudioCore,
    wizard: ruStudioWizard,
    split: ruStudioSplit,
    ai: ruStudioAi,
    pack: ruStudioPack,
    ...ruStudioMisc,
  },
}

const zhMerged = {
  ...zh,
  play: {
    ...zh.play,
    menu: {
      ...zh.play.menu,
      role: {
        ...zh.play.menu.role,
        player: playFixesZh.rolePlayer,
      },
    },
    model: {
      ...zh.play.model,
      ...modelAuthZh,
    },
    skills: {
      ...zh.play.skills,
      ...playFixesZh.skills,
    },
  },
}

export const resources = {
  en: { translation: enMerged },
  ru: { translation: ruMerged },
  zh: { translation: zhMerged },
} as const

/** Resolve the startup locale. `navigator.language` is optional — bun's test
 * runner (and some embedded WebViews) expose `navigator` without it. */
export function detectLanguage(
  stored: string | null | undefined,
  navigatorLanguage: string | null | undefined,
): "en" | "ru" | "zh" {
  if (stored === "en" || stored === "ru" || stored === "zh") return stored
  const nav = typeof navigatorLanguage === "string" ? navigatorLanguage.toLowerCase() : ""
  if (nav.startsWith("ru")) return "ru"
  return nav.startsWith("zh") ? "zh" : "en"
}

function initialLanguage(): string {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
  const navLang =
    typeof navigator !== "undefined" && typeof navigator.language === "string"
      ? navigator.language
      : undefined
  return detectLanguage(stored, navLang)
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

i18n.on("languageChanged", (lng) => {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, lng)
})

export default i18n
