import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import PlayView from "./features/play/PlayView"
import StudioView from "./features/studio/StudioView"
import UndoToast from "./features/studio/UndoToast"
import { usePersistenceDegraded } from "./lib/persistStorage"
import { isTauri, onTransportEvent, transportSend } from "./lib/transport"
import { useAppStore, type AppMode } from "./store/app"
import { useConnectionStore } from "./store/connection"

const MODES: AppMode[] = ["play", "studio"]
type ServerLocale = "en" | "ru" | "zh"

function serverLocale(language: string | undefined): ServerLocale {
  const base = (language ?? "en").toLowerCase().split("-")[0]
  if (base === "ru" || base === "zh") return base
  return "en"
}

function syncServerLocale(language: string | undefined): void {
  if (!isTauri() || useConnectionStore.getState().status !== "online") return
  void transportSend({ type: "locale", locale: serverLocale(language) }).catch(() => {
    // Transport status owns visible delivery failures.
  })
}

export default function App() {
  const { t, i18n } = useTranslation()
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const persistFailed = usePersistenceDegraded()

  useEffect(() => {
    if (!isTauri()) return
    const unlisten = onTransportEvent((event) => {
      useConnectionStore.getState().handleEvent(event)
      // Auto-reconnect creates a fresh server-side member with the server's default
      // locale, so re-assert the Studio locale every time the transport comes online.
      if (event.kind === "status" && event.status === "online") {
        syncServerLocale(i18n.resolvedLanguage)
      }
    })
    return () => {
      void unlisten.then((dispose) => dispose())
    }
  }, [i18n])

  useEffect(() => {
    const onLanguageChanged = (language: string) => syncServerLocale(language)
    i18n.on("languageChanged", onLanguageChanged)
    return () => i18n.off("languageChanged", onLanguageChanged)
  }, [i18n])

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">{t("app.title")}</h1>
        <nav className="mode-nav" aria-label={t("nav.label")}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? "mode-tab active" : "mode-tab"}
              onClick={() => setMode(m)}
            >
              {t(`nav.${m}`)}
            </button>
          ))}
        </nav>
        <div className="header-spacer" />
        <select
          className="lang-select"
          aria-label={t("lang.label")}
          value={i18n.resolvedLanguage}
          onChange={(e) => void i18n.changeLanguage(e.target.value)}
        >
          <option value="en">English</option>
          {/* i18n-exempt: a language is offered in its OWN name, never translated. */}
          <option value="ru">Русский</option>
          {/* i18n-exempt: a language is offered in its OWN name, never translated. */}
          <option value="zh">中文</option>
        </select>
      </header>
      {persistFailed ? (
        <p className="persist-banner" role="alert">
          {t("app.persistDegraded")}
        </p>
      ) : null}
      <main className="app-main">{mode === "play" ? <PlayView /> : <StudioView />}</main>
      {/* App-root: a deletion made in one view stays undoable after switching to another. */}
      <UndoToast />
    </div>
  )
}
