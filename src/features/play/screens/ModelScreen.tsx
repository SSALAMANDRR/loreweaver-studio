// Model / config — the TUI KeeperModel core loop: show the live provider
// config, switch provider/model/key/base-url, pull the provider's model
// catalog when it has one. Subscription providers use the engine's existing
// device-code command lane instead of pretending an API key field can log in.

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../../lib/transport"
import { useAdminStore } from "../../../store/admin"
import { useSessionStore } from "../../../store/session"
import ScreenShell from "./ScreenShell"

const CHATGPT_DEFAULT_MODEL = "gpt-5.4"
const CHATGPT_DEVICE_URL = "https://auth.openai.com/codex/device"

function isChatgptProvider(provider: string): boolean {
  const key = provider.trim().toLowerCase()
  return key === "chatgpt" || key === "gpt-subscription"
}

export default function ModelScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const config = useAdminStore((s) => s.config)
  const models = useAdminStore((s) => s.models)
  const modelsProvider = useAdminStore((s) => s.modelsProvider)
  const refreshConfig = useAdminStore((s) => s.refreshConfig)
  const listModels = useAdminStore((s) => s.listModels)
  const setModel = useAdminStore((s) => s.setModel)
  const entries = useSessionStore((s) => s.entries)

  const [provider, setProvider] = useState("")
  const [chatModel, setChatModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [oauthPending, setOauthPending] = useState(false)
  const [oauthError, setOauthError] = useState(false)
  const desiredChatgptModel = useRef(CHATGPT_DEFAULT_MODEL)
  const autoApplied = useRef(false)

  useEffect(() => {
    refreshConfig()
  }, [refreshConfig])

  const subscriptionReady = (config?.saved_providers ?? []).some(isChatgptProvider)
  const chatgptActive =
    config !== null &&
    isChatgptProvider(config.provider) &&
    !config.base_url &&
    config.using_demo !== true &&
    subscriptionReady

  // Every admin_config resets the form to the live values (incl. the reply to
  // our own apply); while device login is in flight, keep the form pinned to
  // ChatGPT instead of letting polling bounce it back to the demo provider.
  useEffect(() => {
    if (config === null || oauthPending) return
    setProvider(config.provider)
    setChatModel(config.chat_model)
    setBaseUrl(config.base_url)
    setApiKey("")
  }, [config, oauthPending])

  const oauthReply = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]
      const text =
        entry.kind === "narrative"
          ? entry.frame.text
          : entry.kind === "system"
            ? entry.frame.text
            : entry.kind === "error"
              ? entry.frame.message
              : ""
      if (text.includes(CHATGPT_DEVICE_URL)) return text
    }
    return ""
  }, [entries])

  // Device OAuth finishes in a background task in the engine. Poll the
  // display-safe admin snapshot until the credential book reports ChatGPT,
  // then until the automatic model switch is visible too.
  useEffect(() => {
    if (!oauthPending || chatgptActive) return
    refreshConfig()
    const timer = window.setInterval(refreshConfig, 2_000)
    return () => window.clearInterval(timer)
  }, [oauthPending, chatgptActive, refreshConfig])

  useEffect(() => {
    if (!oauthPending || !subscriptionReady || autoApplied.current) return
    autoApplied.current = true
    const model = desiredChatgptModel.current || CHATGPT_DEFAULT_MODEL
    setProvider("chatgpt")
    setChatModel(model)
    setBaseUrl("")
    setApiKey("")
    setModel("chatgpt", model, undefined, "")
  }, [oauthPending, subscriptionReady, setModel])

  useEffect(() => {
    if (oauthPending && chatgptActive) setOauthPending(false)
  }, [oauthPending, chatgptActive])

  const startChatgptLogin = async () => {
    const model = isChatgptProvider(provider) && chatModel.trim() ? chatModel.trim() : CHATGPT_DEFAULT_MODEL
    desiredChatgptModel.current = model
    autoApplied.current = false
    setProvider("chatgpt")
    setChatModel(model)
    setBaseUrl("")
    setApiKey("")
    setOauthError(false)
    setOauthPending(true)
    try {
      await transportSend({ type: "input", text: ".model login chatgpt" })
    } catch {
      setOauthPending(false)
      setOauthError(true)
    }
  }

  const activateChatgpt = () => {
    const model = isChatgptProvider(provider) && chatModel.trim() ? chatModel.trim() : CHATGPT_DEFAULT_MODEL
    setProvider("chatgpt")
    setChatModel(model)
    setBaseUrl("")
    setApiKey("")
    setModel("chatgpt", model, undefined, "")
  }

  const apply = () => {
    if (!provider.trim()) return
    if (isChatgptProvider(provider)) {
      if (!subscriptionReady) return
      setModel(provider.trim(), chatModel.trim() || CHATGPT_DEFAULT_MODEL, undefined, "")
      return
    }
    setModel(provider.trim(), chatModel.trim() || undefined, apiKey || undefined, baseUrl.trim())
  }

  const catalog = modelsProvider === provider ? models : []
  const subscriptionMode = isChatgptProvider(provider)

  return (
    <ScreenShell title={t("play.menu.model")} onBack={onBack} showAdminError>
      {config?.using_demo === true ? <p className="studio-notice">{t("play.model.demoActive")}</p> : null}

      <div className="studio-notice">
        <strong>{t("play.model.subscriptionTitle")}</strong>
        <p>
          {chatgptActive
            ? t("play.model.subscriptionActive")
            : subscriptionReady
              ? t("play.model.subscriptionReady")
              : t("play.model.subscriptionMissing")}
        </p>
        <p>{t("play.model.subscriptionHint")}</p>
        {oauthError ? <p>{t("play.model.loginFailed")}</p> : null}
        {oauthPending ? (
          <>
            <p>{t("play.model.loginPending")}</p>
            <p>{t("play.model.autoSwitchHint")}</p>
            <p>
              <a href={CHATGPT_DEVICE_URL} target="_blank" rel="noreferrer">
                {t("play.model.loginOpen")}
              </a>
            </p>
            {oauthReply ? <p>{t("play.model.loginReply", { message: oauthReply })}</p> : null}
          </>
        ) : !subscriptionReady ? (
          <button type="button" className="primary-button" onClick={() => void startChatgptLogin()}>
            {t("play.model.login")}
          </button>
        ) : !chatgptActive ? (
          <button type="button" className="primary-button" onClick={activateChatgpt}>
            {t("play.model.activate")}
          </button>
        ) : null}
      </div>

      <div className="play-form">
        <label className="field">
          {t("play.model.provider")}
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {(config?.providers ?? (provider ? [provider] : [])).map((name) => (
              <option key={name} value={name}>
                {name}
                {(config?.saved_providers ?? []).includes(name) ? ` ${t("play.model.ready")}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("play.model.chatModel")}
          <input
            value={chatModel}
            onChange={(e) => setChatModel(e.target.value)}
            list="play-model-catalog"
            spellCheck={false}
          />
          <datalist id="play-model-catalog">
            {catalog.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        {!subscriptionMode ? (
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={() => listModels(provider || undefined, apiKey || undefined, baseUrl || undefined)}
            >
              {t("play.model.listModels")}
            </button>
            <label className="field">
              {t("play.model.baseUrl")}
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
            </label>
            <label className="field">
              {t("play.model.apiKey")}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={config ? t("play.model.keyMasked", { masked: config.api_key_masked }) : ""}
              />
            </label>
          </>
        ) : null}
        <button
          type="button"
          className="primary-button"
          onClick={apply}
          disabled={!provider.trim() || (subscriptionMode && !subscriptionReady)}
        >
          {t("play.model.apply")}
        </button>
      </div>
    </ScreenShell>
  )
}
