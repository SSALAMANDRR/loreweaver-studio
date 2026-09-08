import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import {
  advancementAction,
  creationStepAction,
  duplicateAction,
  layerAction,
  type CreationCharacterSnapshot,
  type CreationChoiceGroup,
  type CreationEffect,
  type CreationPresentation,
  type CreationState,
} from "./creation"

function send(text: string): void {
  void transportSend({ type: "input", text }).catch(() => {
    // Transport status owns visible delivery failures.
  })
}

function StageGuide({ presentation }: { presentation?: CreationPresentation }) {
  if (!presentation) return null
  const { title, description, choice, effect } = presentation
  if (!title && !description && !choice && !effect) return null
  return (
    <div className="play-form">
      {title ? <h4>{title}</h4> : null}
      {description ? <p className="studio-hint">{description}</p> : null}
      {choice ? <p className="studio-hint">{choice}</p> : null}
      {effect ? <p className="studio-hint">{effect}</p> : null}
    </div>
  )
}

function effectValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function EffectSummary({ effect }: { effect?: CreationEffect }) {
  const { t } = useTranslation()
  if (!effect) return null

  const grants = effect.grants ?? []
  const equipment = effect.equipment ?? []
  const skills = effect.skills ?? []
  const attributes = effect.attributes ?? []
  if (grants.length + equipment.length + skills.length + attributes.length === 0) return null

  return (
    <div className="play-form">
      {grants.length > 0 ? (
        <p className="studio-hint">
          <strong>{t("play.character.creation.effectGrants")}:</strong> {grants.join(", ")}
        </p>
      ) : null}
      {skills.length > 0 ? (
        <p className="studio-hint">
          <strong>{t("play.character.creation.effectSkills")}:</strong>{" "}
          {skills.map((entry) => `${entry.label} (${effectValue(entry.value)})`).join(", ")}
        </p>
      ) : null}
      {equipment.length > 0 ? (
        <p className="studio-hint">
          <strong>{t("play.character.creation.effectEquipment")}:</strong> {equipment.join(", ")}
        </p>
      ) : null}
      {attributes.length > 0 ? (
        <p className="studio-hint">
          <strong>{t("play.character.creation.effectAttributes")}:</strong>{" "}
          {attributes.map((entry) => `${entry.label}: ${effectValue(entry.value)}`).join(", ")}
        </p>
      ) : null}
    </div>
  )
}

function CharacterSummary({ character }: { character?: CreationCharacterSnapshot }) {
  const { t } = useTranslation()
  if (!character) return null
  const entries = Object.entries(character.attributes ?? {})
  if (entries.length === 0) return null

  return (
    <div className="play-form">
      <h4>{t("play.character.creation.currentCharacteristics")}</h4>
      <table className="play-table">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key}>
              <td className="play-attr-name">{character.attribute_labels?.[key] ?? key}</td>
              <td>{effectValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
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
      <EffectSummary effect={option?.effect} />
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
            <EffectSummary effect={selectedOption?.effect} />
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
      {requirements.map((requirement) => (
        <div className="play-form" key={requirement.field}>
          {requirement.current && requirement.current.length > 0 ? (
            <p className="studio-hint">
              {t("play.character.creation.currentValues", { values: requirement.current.join(", ") })}
            </p>
          ) : null}
          {Array.from({ length: requirement.count }, (_, index) => (
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
          ))}
        </div>
      ))}
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

function StartingEquipmentStage({ creation }: { creation: CreationState }) {
  const { t } = useTranslation()
  const online = useConnectionStore((s) => s.status === "online")
  const stage = creation.stage
  const items = stage?.items ?? []
  const inventory = stage?.inventory ?? []
  const used = stage?.budget?.used ?? 0
  const [pending, setPending] = useState<{ id: string; used: number } | null>(null)

  useEffect(() => {
    if (pending && used !== pending.used) setPending(null)
  }, [pending, used])

  useEffect(() => {
    setPending(null)
  }, [stage?.id])

  const choose = (id: string) => {
    if (!online || pending) return
    setPending({ id, used })
    void transportSend({ type: "input", text: creationStepAction(id) }).catch(() => setPending(null))
  }

  return (
    <div className="play-form">
      <p className="studio-hint">
        {t("play.character.creation.equipmentRemaining", {
          remaining: stage?.budget?.remaining ?? 0,
        })}
      </p>

      {inventory.length > 0 ? (
        <div className="play-form">
          <h4>{t("play.character.creation.currentEquipment")}</h4>
          <div className="chip-row">
            {inventory.map((item, index) => (
              <span className="chip" key={`${item}-${index}`}>
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="play-form">
        {items.map((item) => {
          const waiting = pending?.id === item.id
          const kind = t(`play.character.creation.equipmentKind.${item.kind}`, { defaultValue: item.kind })
          return (
            <button
              key={item.id}
              type="button"
              className="ghost-button"
              disabled={!online || pending !== null}
              aria-busy={waiting}
              onClick={() => choose(item.id)}
            >
              {item.label} · {kind} · {t("play.character.creation.availability", { value: item.availability })}
              {waiting ? ` · ${t("play.character.creation.equipmentAdding")}` : ""}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function CreationWizard({
  creation,
  character,
}: {
  creation: CreationState
  character?: CreationCharacterSnapshot
}) {
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

      <CharacterSummary character={character} />
      <StageGuide presentation={stage.presentation} />

      {stage.kind === "profile_reroll" ? (
        <div className="play-form">
          {!stage.presentation?.description ? (
            <p className="studio-hint">{t("play.character.creation.rerollHint")}</p>
          ) : null}
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
          <button
            type="button"
            className="primary-button"
            disabled={!online}
            onClick={() => send(creationStepAction("done"))}
          >
            {t("play.character.creation.finishXp")}
          </button>
          <div className="play-form">
            {(stage.purchases ?? []).map((purchase) => (
              <button
                key={`${purchase.category}:${purchase.target}`}
                type="button"
                className="ghost-button"
                disabled={!online || purchase.cost > (stage.budget?.available ?? 0)}
                onClick={() => send(advancementAction(purchase.category, purchase.target))}
              >
                {purchase.category_label ? `${purchase.category_label} · ` : ""}
                {purchase.label} · {purchase.stage_label ?? purchase.stage} · {purchase.current} → {purchase.next} ·{" "}
                {purchase.cost} XP
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {stage.kind === "starting_equipment" ? <StartingEquipmentStage creation={creation} /> : null}

      {!["profile_reroll", "layer", "duplicates", "advancement", "starting_equipment"].includes(
        stage.kind,
      ) ? (
        <p className="placeholder">{t("play.character.creation.unsupportedStage")}</p>
      ) : null}
    </section>
  )
}
