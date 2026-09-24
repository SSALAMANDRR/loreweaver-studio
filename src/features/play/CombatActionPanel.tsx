import { useMemo, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { CombatAction } from "@loreweaver/protocol"
import type {
  ActionRequestFrame,
  CombatEncounterView,
  CombatReactionOffer,
  CombatSurface,
  ManualRollSpec,
} from "@loreweaver/protocol"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import ManualDiceFields from "./ManualDiceFields"
import { manualFaces, type DiceValues } from "./manualDice"

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
            className={entry.defeated ? "defeated" : entry.current ? "current" : undefined}
          >
            {entry.name}
            {entry.initiative !== null ? ` (${entry.initiative})` : ""}
            {/* A keeper controls every NPC too: "you" marks only the viewer's own character. */}
            {entry.controlled && !entry.keeper_controlled ? ` · ${t("combat.you")}` : ""}
            {entry.keeper_controlled ? ` · ${t("combat.npc")}` : ""}
            {entry.defeated ? ` · ${t("combat.defeated")}` : ""}
          </li>
        ))}
      </ol>
      {state.current_actor === null ? <p>{t("combat.hiddenTurn")}</p> : null}
      {pending ? <p role="status">{t("combat.awaitingReaction", { defender: pending.defender })}</p> : null}
    </div>
  )
}

/** Shown only when the server authorised THIS viewer to answer the pending attack. */
function ReactionPrompt({
  offer,
  online,
  manual,
}: {
  offer: CombatReactionOffer
  online: boolean
  manual: boolean
}) {
  const { t } = useTranslation()
  const [sending, setSending] = useState(false)
  const [dice, setDice] = useState<DiceValues>({})
  // Every roll a choice may need, once per id; each choice sends only its own.
  const specs: ManualRollSpec[] = []
  for (const choice of offer.choices) {
    for (const spec of choice.manual_rolls ?? []) {
      if (!specs.some((known) => known.id === spec.id)) specs.push(spec)
    }
  }
  const facesFor = (choice: CombatReactionOffer["choices"][number]) =>
    manual ? manualFaces(choice.manual_rolls ?? [], dice) : null
  const choose = (choice: CombatReactionOffer["choices"][number]) => {
    const faces = facesFor(choice)
    if (manual && faces === null) return
    setSending(true)
    send(
      {
        type: "action_request",
        id: crypto.randomUUID(),
        actor: offer.actor,
        action: CombatAction.Reaction,
        mode: choice.id,
        pending_id: offer.id,
        ...(manual ? { roll_source: "manual" as const, manual_rolls: faces ?? {} } : {}),
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
      {manual && specs.length > 0 ? (
        <ManualDiceFields specs={specs} values={dice} onChange={setDice} disabled={!online || sending} />
      ) : null}
      {offer.choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          disabled={!online || sending || (manual && facesFor(choice) === null)}
          onClick={() => choose(choice)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}

function ActionForm({ combat, online, manual }: { combat: CombatSurface; online: boolean; manual: boolean }) {
  const { t } = useTranslation()
  const [actionId, setActionId] = useState("")
  const [modeId, setModeId] = useState("")
  const [weaponId, setWeaponId] = useState("")
  const [target, setTarget] = useState("")
  const [distance, setDistance] = useState("")
  const [sending, setSending] = useState(false)
  const [dice, setDice] = useState<DiceValues>({})
  const action = combat.actions.find((entry) => entry.id === actionId) ?? combat.actions[0]
  const mode = action?.modes.find((entry) => entry.id === modeId) ?? action?.modes[0]
  const diceSpecs = manual ? (mode?.manual_rolls ?? []) : []
  const faces = manual ? manualFaces(diceSpecs, dice) : null
  const weapon = mode?.weapons.find((entry) => entry.id === weaponId) ?? mode?.weapons[0]
  const selectedTarget = action?.targets.includes(target) ? target : action?.targets[0]
  const hasTarget = (action?.targets.length ?? 0) > 0
  // Only a mode the server declares distance-capable gets the field (and the value).
  const takesDistance = hasTarget && mode?.accepts_distance === true
  const canSend = Boolean(
    online &&
    action &&
    mode &&
    weapon &&
    (!hasTarget || selectedTarget) &&
    !sending &&
    (!manual || faces !== null),
  )
  const numericDistance = useMemo(() => {
    if (!takesDistance || !distance.trim()) return undefined
    const value = Number(distance)
    return Number.isInteger(value) && value >= 0 ? value : null
  }, [distance, takesDistance])

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
        ...(manual ? { roll_source: "manual" as const, manual_rolls: faces ?? {} } : {}),
      },
      () => {
        setSending(false)
        setDice({})
      },
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
      {takesDistance ? (
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
      {diceSpecs.length > 0 ? (
        <ManualDiceFields specs={diceSpecs} values={dice} onChange={setDice} disabled={!online || sending} />
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
  const manual = useSessionStore((s) => s.game?.roll_mode === "manual")
  const online = useConnectionStore((s) => s.status === "online")
  const [ending, setEnding] = useState(false)
  if (!combat) return null
  const endTurn = combat.end_turn
  return (
    <section className="combat-action-panel" aria-label={t("combat.title")}>
      <strong>{t("combat.title")}</strong>
      {combat.actor ? <span>{combat.actor}</span> : null}
      {combat.state ? <EncounterOrder state={combat.state} /> : null}
      {combat.reaction ? (
        <ReactionPrompt key={combat.reaction.id} offer={combat.reaction} online={online} manual={manual} />
      ) : null}
      {combat.actions.length > 0 ? (
        // A new surface (another actor, or different offered options) rebuilds the form, so
        // nothing chosen or typed against the previous surface can be sent.
        <ActionForm
          key={`${combat.actor}:${JSON.stringify(combat.actions)}`}
          combat={combat}
          online={online}
          manual={manual}
        />
      ) : null}
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
