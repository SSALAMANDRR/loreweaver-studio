import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import {
  characterContextAction,
  skipCharacterContextAction,
  type CharacterContextState,
} from "./creation"

function send(text: string): void {
  void transportSend({ type: "input", text }).catch(() => {
    // Transport status owns visible delivery failures.
  })
}

export default function CharacterContextSetup({ context }: { context: CharacterContextState }) {
  const { t } = useTranslation()
  const online = useConnectionStore((s) => s.status === "online")
  const [values, setValues] = useState<Record<string, string>>(context.values)

  useEffect(() => {
    setValues(context.values)
  }, [context.values])

  const complete = useMemo(
    () =>
      context.fields.every(
        (field) => !field.required || Boolean((values[field.id] ?? "").trim()),
      ),
    [context.fields, values],
  )

  if (!context.available || context.complete) return null

  return (
    <section className="play-form character-context-form">
      <div>
        <h4>{t("play.character.creation.contextTitle")}</h4>
        <p className="studio-hint">{t("play.character.creation.contextHint")}</p>
      </div>

      {context.fields.map((field) => {
        const value = values[field.id] ?? ""
        const onChange = (next: string) =>
          setValues((current) => ({ ...current, [field.id]: next }))

        if (field.kind === "choice") {
          return (
            <label className="field" key={field.id}>
              {field.label}
              <select value={value} onChange={(event) => onChange(event.target.value)}>
                <option value="">{t("play.character.creation.choose")}</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )
        }

        if (field.kind === "textarea") {
          return (
            <label className="field" key={field.id}>
              {field.label}
              <textarea
                rows={3}
                value={value}
                placeholder={field.placeholder}
                onChange={(event) => onChange(event.target.value)}
              />
            </label>
          )
        }

        return (
          <label className="field" key={field.id}>
            {field.label}
            <input
              value={value}
              placeholder={field.placeholder}
              onChange={(event) => onChange(event.target.value)}
            />
          </label>
        )
      })}

      <div className="chip-row">
        <button
          type="button"
          className="primary-button"
          disabled={!online || !complete}
          onClick={() => send(characterContextAction(values))}
        >
          {t("play.character.creation.contextSave")}
        </button>
        {context.optional ? (
          <button
            type="button"
            className="ghost-button"
            disabled={!online}
            onClick={() => send(skipCharacterContextAction())}
          >
            {t("play.character.creation.contextSkip")}
          </button>
        ) : null}
      </div>
    </section>
  )
}
