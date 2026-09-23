import { useState } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"

const MODES = ["auto", "manual"] as const

/**
 * This player's dice preference for checks and combat. The value shown is the
 * server's (`state.roll_mode`); choosing sends `.rollmode` and waits for the next state.
 */
export default function RollModeToggle() {
  const { t } = useTranslation()
  const mode = useSessionStore((s) => s.game?.roll_mode)
  const online = useConnectionStore((s) => s.status === "online")
  const [sending, setSending] = useState(false)
  if (mode === undefined) return null
  const choose = (next: (typeof MODES)[number]) => {
    if (next === mode) return
    setSending(true)
    void transportSend({ type: "input", text: `.rollmode ${next}` })
      .catch(() => {})
      .finally(() => setSending(false))
  }
  return (
    <div className="roll-mode-toggle" role="radiogroup" aria-label={t("combat.rollMode")}>
      <span>{t("combat.rollMode")}</span>
      {MODES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={mode === option}
          disabled={!online || sending}
          onClick={() => choose(option)}
        >
          {t(option === "auto" ? "combat.rollModeServer" : "combat.rollModeManual")}
        </button>
      ))}
    </div>
  )
}
