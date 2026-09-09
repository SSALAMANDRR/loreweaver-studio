import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type {
  CharacterFinalizationAction,
  CharacterFinalizationState,
  CharacterReadinessState,
} from "@loreweaver/protocol"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"

export default function FinalizationPanel({
  character,
  readiness,
  finalization,
}: {
  character: string
  readiness?: CharacterReadinessState
  finalization?: CharacterFinalizationState
}) {
  const { t } = useTranslation()
  const online = useConnectionStore((s) => s.status === "online")
  const game = useSessionStore((s) => s.game)
  const lastEntry = useSessionStore((s) => s.entries.at(-1))
  const [values, setValues] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    setValues({})
    setError(false)
    setPending(false)
  }, [character, finalization?.result?.id, finalization?.complete])

  // A state snapshot is authoritative even when the command was rejected and
  // nothing changed. Errors/disconnects also release the pending UI for retry.
  useEffect(() => {
    setPending(false)
  }, [game, online])
  useEffect(() => {
    if (lastEntry?.kind === "error") {
      setPending(false)
      setError(true)
    }
  }, [lastEntry])

  const send = async (action: CharacterFinalizationAction) => {
    if (!online || pending) return
    setPending(true)
    setError(false)
    try {
      await transportSend({
        type: "input",
        text: `.__creation_action finalize ${encodeURIComponent(JSON.stringify(action))}`,
      })
    } catch {
      setPending(false)
      setError(true)
    }
  }

  if (!readiness) return null
  return (
    <section className="play-form" aria-label={t("play.character.finalization.title")}>
      <h4>{t("play.character.finalization.title")}</h4>
      <p role="status">
        {t(readiness.ready ? "play.character.finalization.ready" : "play.character.finalization.notReady")}
      </p>
      {readiness.message ? <p>{readiness.message}</p> : null}
      {finalization?.result ? (
        <div>
          <p>
            {t("play.character.finalization.result", {
              roll: finalization.result.roll,
              label: finalization.result.label,
            })}
          </p>
          {finalization.result.rules.map((rule, index) => (
            <p key={index}>{rule}</p>
          ))}
          {finalization.result.source ? <p className="studio-hint">{finalization.result.source}</p> : null}
        </div>
      ) : null}
      {finalization?.can_roll ? (
        <button
          type="button"
          disabled={!online || pending}
          onClick={() => void send({ character, action: "roll" })}
        >
          {t("play.character.finalization.roll", { expression: finalization.expression })}
        </button>
      ) : null}
      {finalization?.can_resolve ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!finalization.result) return
            void send({
              character,
              action: "resolve",
              roll: finalization.result.roll,
              row_id: finalization.result.id,
              selections: values,
            })
          }}
        >
          <p>{t("play.character.finalization.choices")}</p>
          {finalization.choices.map((choice) => (
            <label className="field" key={choice.id}>
              {choice.label}
              {choice.free ? (
                <input
                  required
                  disabled={!online || pending}
                  value={values[choice.id] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [choice.id]: event.target.value }))
                  }
                />
              ) : (
                <select
                  required
                  disabled={!online || pending}
                  value={values[choice.id] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [choice.id]: event.target.value }))
                  }
                >
                  <option value="">{t("play.character.creation.choose")}</option>
                  {choice.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}
          <button type="submit" disabled={!online || pending}>
            {t("play.character.finalization.resolve")}
          </button>
        </form>
      ) : null}
      {pending ? <p role="status">{t("play.character.finalization.pending")}</p> : null}
      {error ? <p role="alert">{t("play.character.finalization.failed")}</p> : null}
    </section>
  )
}
