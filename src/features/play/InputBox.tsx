import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useManualRollStore } from "../../store/manualRoll"
import { useSessionStore } from "../../store/session"

export default function InputBox() {
  const { t } = useTranslation()
  const status = useConnectionStore((s) => s.status)
  const seat = useConnectionStore((s) => s.welcome?.you.name ?? "")
  const pendingRoll = useManualRollStore((s) => s.pending)
  const echoLocalInput = useSessionStore((s) => s.echoLocalInput)
  const failEcho = useSessionStore((s) => s.failEcho)
  const [text, setText] = useState("")
  const online = status === "online"
  const canType = online && pendingRoll === null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!canType || trimmed.length === 0) return
    // Echo first: a turn already running holds the room's turn lock, so this
    // line can wait in the queue for a long while before anything comes back.
    const seq = echoLocalInput(trimmed, seat)
    void transportSend({ type: "input", text: trimmed }).catch(() => {
      // The transport surfaces failures through status events; the echo says
      // so where the player is actually looking.
      failEcho(seq)
    })
    setText("")
  }

  return (
    <form className="input-box" onSubmit={submit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={pendingRoll ? t("manualRoll.finishFirst") : t("session.inputPlaceholder")}
        aria-label={pendingRoll ? t("manualRoll.finishFirst") : t("session.inputPlaceholder")}
        disabled={!canType}
        spellCheck={false}
      />
      <button type="submit" disabled={!canType || text.trim().length === 0}>
        {t("session.send")}
      </button>
    </form>
  )
}
