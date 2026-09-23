import { useMemo, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"

/** The controls come entirely from the server's current action catalog. */
export default function CombatActionPanel() {
  const { t } = useTranslation()
  const combat = useSessionStore((s) => s.game?.combat)
  const online = useConnectionStore((s) => s.status === "online")
  const [actionId, setActionId] = useState("")
  const [modeId, setModeId] = useState("")
  const [weaponId, setWeaponId] = useState("")
  const [target, setTarget] = useState("")
  const [reaction, setReaction] = useState("")
  const [distance, setDistance] = useState("")
  const [sending, setSending] = useState(false)
  const action = combat?.actions.find((entry) => entry.id === actionId) ?? combat?.actions[0]
  const mode = action?.modes.find((entry) => entry.id === modeId) ?? action?.modes[0]
  const weapon = mode?.weapons.find((entry) => entry.id === weaponId) ?? mode?.weapons[0]
  const selectedTarget = action?.targets.includes(target) ? target : action?.targets[0]
  const selectedReaction = mode?.reactions.find((entry) => entry.id === reaction)?.id ?? ""
  const hasTarget = (action?.targets.length ?? 0) > 0
  const canSend = Boolean(
    online && combat && action && mode && weapon && (!hasTarget || selectedTarget) && !sending,
  )
  const numericDistance = useMemo(() => {
    if (!distance.trim()) return undefined
    const value = Number(distance)
    return Number.isInteger(value) && value >= 0 ? value : null
  }, [distance])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSend || numericDistance === null || !combat || !action || !mode || !weapon) return
    setSending(true)
    void transportSend({
      type: "action_request",
      id: crypto.randomUUID(),
      actor: combat.actor,
      ...(hasTarget ? { target: selectedTarget } : {}),
      action: action.id,
      mode: mode.id,
      weapon_instance_id: weapon.id,
      ...(selectedReaction ? { reaction_type: selectedReaction } : {}),
      ...(numericDistance === undefined ? {} : { distance: numericDistance }),
    })
      .catch(() => {})
      .finally(() => setSending(false))
  }

  if (!combat || combat.actions.length === 0) return null
  return (
    <form className="combat-action-panel" onSubmit={submit}>
      <strong>{t("combat.title")}</strong>
      <span>{combat.actor}</span>
      <label>
        {t("combat.action")}
        <select
          value={action?.id ?? ""}
          onChange={(event) => {
            setActionId(event.target.value)
            setModeId("")
            setWeaponId("")
            setReaction("")
          }}
        >
          {combat.actions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("combat.mode")}
        <select
          value={mode?.id ?? ""}
          onChange={(event) => {
            setModeId(event.target.value)
            setWeaponId("")
            setReaction("")
          }}
        >
          {action?.modes.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("combat.weapon")}
        <select value={weapon?.id ?? ""} onChange={(event) => setWeaponId(event.target.value)}>
          {mode?.weapons.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      {hasTarget ? (
        <label>
          {t("combat.target")}
          <select value={selectedTarget} onChange={(event) => setTarget(event.target.value)}>
            {action?.targets.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {(mode?.reactions.length ?? 0) > 0 && hasTarget ? (
        <label>
          {t("combat.reaction")}
          <select value={selectedReaction} onChange={(event) => setReaction(event.target.value)}>
            <option value="">{t("combat.none")}</option>
            {mode?.reactions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {hasTarget ? (
        <label>
          {t("combat.distance")}
          <input
            type="number"
            min="0"
            step="1"
            value={distance}
            onChange={(event) => setDistance(event.target.value)}
          />
        </label>
      ) : null}
      <button type="submit" disabled={!canSend || numericDistance === null}>
        {t("combat.submit")}
      </button>
    </form>
  )
}
