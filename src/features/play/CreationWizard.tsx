import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import {
  advancementAction,
  creationStepAction,
  duplicateAction,
  layerAction,
  type CreationChoiceGroup,
  type CreationState,
} from "./creation"

function send(text: string): void {
  void transportSend({ type: "input", text }).catch(() => {
    // Transport status owns visible delivery failures.
  })
}

function groupValue(
  group: CreationChoiceGroup,
  choices: Record<string, string>,
  specializations: Record<string, string>,
): string {
  const selected = choices[group.id] ?? ""
  if (!selected || group.free) return selected
  const option = group.options.find((entry) => entry.id === selected)
  if (!option?.specialization) return selected
  const specialization = (specializations[group.id] ?? "").trim()
  return specialization ? `${selected}::${specialization}` : ""
}

function LayerStage({ creation }: { creation: CreationState }) {
  const { t } = useTranslation()
  const online = useConnectionStore((s) => s.status === "online")
  const stage = creation.stage
  const options = stage?.options ?? []
  const fixed = Boolean(stage?.fixed)
  const [optionId, setOptionId] = useState("")
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [specializations, setSpecializations] = useState<Record<string, string>>({})

  useEffect(() => {
    setOptionId(fixed ? (options[0]?.id ?? "") : "")
    setChoices({})
    setSpecializations({})
  }, [stage?.id, fixed]) // eslint-disable-line react-hooks/exhaustive-deps

  const option = options.find((entry) => entry.id === optionId) ?? (fixed ? options[0] : undefined)
  const values = useMemo(() => {
    if (!option) return {}
    return Object.fromEntries(
      option.choices.map((group) => [group.id, groupValue(group, choices, specializations)]),
    )
  }, [option, choices, specializations])
  const complete = option
    ? option.choices.every((group) => Boolean(values[group.id]?.trim()))
    : false

  const submit = () => {
    if (!option || !complete) return
    send(layerAction(option, values))
  }

  return (
    <div className="play-form">
      {!fixed ? (
        <label className="field">
          {t("play.character.creation.option")}
          <select value={optionId} onChange={(event) => setOptionId(event.target.value)}>
            <option value="">{t("play.character.creation.choose")}</option>
            {options.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      ) : option ? (
        <h4>{option.label}</h4>
      ) : null}

      {option?.detail?.map((text) => (
        <p className="studio-hint" key={text}>
          {text}
        </p>
      ))}
      {option?.source ? <p className="studio-hint">{option.source}</p> : null}

      {option?.choices.map((group) => {
        const selected = choices[group.id] ?? ""
        const selectedOption = group.options.find((entry) => entry.id === selected)
        return (
          <div key={group.id} className="play-form">
            {group.free ? (
              <label className="field">
                {group.label}
                <input
                  value={selected}
                  onChange={(event) =>
                    setChoices((current) => ({ ...current, [group.id]: event.target.value }))
                  }
                />
              </label>
            ) : (
              <label className="field">
                {group.label}
                <select
                  value={selected}
                  onChange={(event) =>
                    setChoices((current) => ({ ...current, [group.id]: event.target.value }))
                  }
                >
                  <option value="">{t("play.character.creation.choose")}</option>
                  {group.options.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selectedOption?.specialization ? (
              <label className="field">
                {t("play.character.creation.specialization")}
                <input
                  value={specializations[group.id] ?? ""}
                  onChange={(event) =>
                    setSpecializations((current) => ({ ...current, [group.id]: event.target.value }))
                  }
                />
              </label>
            ) : null}
          </div>
        )
      })}

      <button type="button" className="primary-button" disabled={!online || !complete} onClick={submit}>
        {t("play.character.creation.apply")}
      </button>
    </div>
  )
}

function DuplicateStage({ creation }: { creation: CreationState }) {
  const { t } = useTranslation()
  const online = useConnectionStore((s) => s.status === "online")
  const requirements = creation.stage?.requirements ?? []
  const [values, setValues] = useState<Record<string, string[]>>({})

  useEffect(() => {
    setValues(
      Object.fromEntries(requirements.map((requirement) => [requirement.field, Array(requirement.count).fill("")])),
    )
  }, [creation.stage?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const complete = requirements.every((requirement) => {
    const selected = values[requirement.field] ?? []
    return (
      selected.length === requirement.count &&
      selected.every(Boolean) &&
      new Set(selected).size === selected.length
    )
  })

  const setValue = (field: string, index: number, value: string) => {
    setValues((current) => ({
      ...current,
      [field]: (current[field] ?? []).map((entry, entryIndex) => (entryIndex === index ? value : entry)),
    }))
  }

  return (
    <div className="play-form">
      {requirements.map((requirement) =>
        Array.from({ length: requirement.count }, (_, index) => (
          <label className="field" key={`${requirement.field}-${index}`}>
            {t("play.character.creation.replacement", { index: index + 1 })}
            <select
              value={values[requirement.field]?.[index] ?? ""}
              onChange={(event) => setValue(requirement.field, index, event.target.value)}
            >
              <option value="">{t("play.character.creation.choose")}</option>
              {requirement.choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
        )),
      )}
      <button
        type="button"
        className="primary-button"
        disabled={!online || !complete}
        onClick={() => send(duplicateAction(requirements, values))}
      >
        {t("play.character.creation.apply")}
      </button>
    </div>
  )
}

export default function CreationWizard({ creation }: { creation: CreationState }) {
  const { t } = useTranslation()
  const online = useConnectionStore((s) => s.status === "online")
  const stage = creation.stage

  if (creation.complete || stage === null) {
    return <p className="studio-hint">{t("play.character.creation.complete")}</p>
  }

  return (
    <section className="play-character">
      <div className="chip-row">
        <span className="chip">
          {t("play.character.creation.progress", {
            current: Math.min(creation.stage_index + 1, creation.stage_count),
            total: creation.stage_count,
          })}
        </span>
      </div>

      {stage.kind === "profile_reroll" ? (
        <div className="play-form">
          <p className="studio-hint">{t("play.character.creation.rerollHint")}</p>
          <div className="chip-row">
            {(stage.targets ?? []).map((target) => (
              <button
                key={target.id}
                type="button"
                className="ghost-button"
                disabled={!online}
                onClick={() => send(creationStepAction(`reroll ${target.id}`))}
              >
                {target.label}: {target.value ?? "?"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={!online}
            onClick={() => send(creationStepAction("done"))}
          >
            {t("play.character.creation.keep")}
          </button>
        </div>
      ) : null}

      {stage.kind === "layer" ? <LayerStage creation={creation} /> : null}
      {stage.kind === "duplicates" ? <DuplicateStage creation={creation} /> : null}

      {stage.kind === "advancement" ? (
        <div className="play-form">
          <p className="studio-hint">
            {t("play.character.creation.xp", {
              available: stage.budget?.available ?? 0,
              spent: stage.budget?.spent ?? 0,
            })}
          </p>
          <div className="play-form">
            {(stage.purchases ?? []).map((purchase) => (
              <button
                key={`${purchase.category}:${purchase.target}`}
                type="button"
                className="ghost-button"
                disabled={!online || purchase.cost > (stage.budget?.available ?? 0)}
                onClick={() => send(advancementAction(purchase.category, purchase.target))}
              >
                {purchase.label} · {purchase.stage} · {purchase.cost} XP
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={!online}
            onClick={() => send(creationStepAction("done"))}
          >
            {t("play.character.creation.finishXp")}
          </button>
        </div>
      ) : null}

      {stage.kind === "starting_equipment" ? (
        <div className="play-form">
          <p className="studio-hint">
            {t("play.character.creation.equipmentRemaining", {
              remaining: stage.budget?.remaining ?? 0,
            })}
          </p>
          <div className="play-form">
            {(stage.items ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                className="ghost-button"
                disabled={!online}
                onClick={() => send(creationStepAction(item.id))}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!["profile_reroll", "layer", "duplicates", "advancement", "starting_equipment"].includes(
        stage.kind,
      ) ? (
        <p className="placeholder">{t("play.character.creation.unsupportedStage")}</p>
      ) : null}
    </section>
  )
}
