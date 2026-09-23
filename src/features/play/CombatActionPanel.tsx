import { useMemo, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { CombatAction } from "@loreweaver/protocol"
import type {
  ActionRequestFrame,
  CombatEncounterView,
  CombatReactionOffer,
  CombatSurface,
} from "@loreweaver/protocol"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"

function send(frame: ActionRequestFrame, done: () => void) {
  void transportSend(frame)
    .catch(() => {})
    .finally(done)
}

/** Initiative order, round and current turn exactly as the server projected them for this viewer. */
function EncounterOrder({ state }: { state: CombatEncounterView }) {
  const { t } = useTranslation()
  const pending = state.pending_reaction
  return (
    <div className="combat-encounter" aria-label={t("combat.order")}>
      <strong>{t("combat.round", { round: state.round_number })}</strong>
      <ol>
        {state.order.map((entry) => (
          <li
            key={entry.name}
            aria-current={entry.current ? "step" : undefined}
            className={entry.current ? "current" : undefined}
          >
            {entry.name}
            {entry.initiative !== null ? ` (${entry.initiative})` : ""}
            {entry.controlled ? ` · ${t("combat.you")}` : ""}
          </li>
        ))}
      </ol>
      {state.current_actor === null ? <p>{t("combat.hiddenTurn")}</p> : null}
      {pending ? <p role="status">{t("combat.awaitingReaction", { defender: pending.defender })}</p> : null}
    </div>
  )
}

/** Shown only when the server authorised THIS viewer to answer the pending attack. */
function ReactionPrompt({ offer, online }: { offer: CombatReactionOffer; online: boolean }) {
  const { t } = useTranslation()
  const [sending, setSending] = useState(false)
  const choose = (choice: string) => {
    setSending(true)
    send(
      {
        type: "action_request",
        id: crypto.randomUUID(),
        actor: offer.actor,
        action: CombatAction.Reaction,
        mode: choice,
        pending_id: offer.id,
      },
      () => setSending(false),
    )
  }
  return (
    <div className="combat-reaction" role="group" aria-label={t("combat.reaction")}>
      <p>
        {t("combat.reactionPrompt", {
          actor: offer.actor,
          attacker: offer.attacker || t("combat.unknownAttacker"),
          action: offer.action,
        })}
      </p>
      {offer.choices.map((choice) => (
        <button key={choice.id} type="button" disabled={!online || sending} onClick={() => choose(choice.id)}>
          {choice.label}
        </button>
      ))}
    </div>
  )
}

function ActionForm({ combat, online }: { combat: CombatSurface; online: boolean }) {
  const { t } = useTranslation()
  const [actionId, setActionId] = useState("")
  const [modeId, setModeId] = useState("")
  const [weaponId, setWeaponId] = useState("")
  const [target, setTarget] = useState("")
  const [distance, setDistance] = useState("")
  const [sending, setSending] = useState(false)
  const action = combat.actions.find((entry) => entry.id === actionId) ?? combat.actions[0]
  const mode = action?.modes.find((entry) => entry.id === modeId) ?? action?.modes[0]
  const weapon = mode?.weapons.find((entry) => entry.id === weaponId) ?? mode?.weapons[0]
  const selectedTarget = action?.targets.includes(target) ? target : action?.targets[0]
  const hasTarget = (action?.targets.length ?? 0) > 0
  const canSend = Boolean(online && action && mode && weapon && (!hasTarget || selectedTarget) && !sending)
  const numericDistance = useMemo(() => {
    if (!distance.trim()) return undefined
    const value = Number(distance)
    return Number.isInteger(value) && value >= 0 ? value : null
  }, [distance])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSend || numericDistance === null || !action || !mode || !weapon) return
    setSending(true)
    send(
      {
        type: "action_request",
        id: crypto.randomUUID(),
        actor: combat.actor,
        ...(hasTarget ? { target: selectedTarget } : {}),
        action: action.id,
        mode: mode.id,
        weapon_instance_id: weapon.id,
        ...(numericDistance === undefined ? {} : { distance: numericDistance }),
      },
      () => setSending(false),
    )
  }

  return (
    <form className="combat-action-form" onSubmit={submit}>
      <label>
        {t("combat.action")}
        <select
          value={action?.id ?? ""}
          onChange={(event) => {
            setActionId(event.target.value)
            setModeId("")
            setWeaponId("")
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

/** Every control comes from the server's per-viewer encounter projection. */
export default function CombatActionPanel() {
  const { t } = useTranslation()
  const combat = useSessionStore((s) => s.game?.combat)
  const online = useConnectionStore((s) => s.status === "online")
  const [ending, setEnding] = useState(false)
  if (!combat) return null
  const endTurn = combat.end_turn
  return (
    <section className="combat-action-panel" aria-label={t("combat.title")}>
      <strong>{t("combat.title")}</strong>
      {combat.actor ? <span>{combat.actor}</span> : null}
      {combat.state ? <EncounterOrder state={combat.state} /> : null}
      {combat.reaction ? <ReactionPrompt offer={combat.reaction} online={online} /> : null}
      {combat.actions.length > 0 ? <ActionForm key={combat.actor} combat={combat} online={online} /> : null}
      {endTurn ? (
        <button
          type="button"
          disabled={!online || ending}
          onClick={() => {
            setEnding(true)
            send(
              { type: "action_request", id: crypto.randomUUID(), actor: combat.actor, action: endTurn.id },
              () => setEnding(false),
            )
          }}
        >
          {endTurn.label}
        </button>
      ) : null}
    </section>
  )
}
