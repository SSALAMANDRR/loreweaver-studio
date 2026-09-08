import { useState } from "react"
import { useTranslation } from "react-i18next"
import { stripControlChars } from "@loreweaver/protocol"
import { transportSend } from "../../../lib/transport"
import { useConnectionStore } from "../../../store/connection"
import { useSessionStore } from "../../../store/session"
import CharacterContextSetup from "../CharacterContextSetup"
import CharacterSheetWorkbench from "../CharacterSheetWorkbench"
import CreationWizard from "../CreationWizard"
import { creationSystems, currentCreation, startCreationAction } from "../creation"
import { ResourceRow } from "../StatePanel"
import ScreenShell from "./ScreenShell"
import { sheetWrite } from "./sheetWrite"

interface CharacterPresentation {
  system_label?: string
  attribute_labels?: Record<string, string>
  skills?: Record<string, unknown>
  skill_labels?: Record<string, string>
  talents?: string[]
  equipment?: string[]
}

function attrText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return stripControlChars(String(value))
}

function isEditable(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function send(text: string): void {
  void transportSend({ type: "input", text }).catch(() => {
    // Transport status owns visible delivery failures.
  })
}

type CreateMode = "roll" | "describe" | "import"

function CreateCharacter() {
  const { t } = useTranslation()
  const game = useSessionStore((s) => s.game)
  const systems = creationSystems(game)
  const online = useConnectionStore((s) => s.status === "online")
  const creatable = systems.filter((entry) => entry.make_char)
  const [mode, setMode] = useState<CreateMode>("roll")
  const [system, setSystem] = useState("")
  const [profile, setProfile] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [path, setPath] = useState("")

  const offered = mode === "roll" ? creatable : systems
  const chosen = offered.some((entry) => entry.id === system) ? system : (offered[0]?.id ?? "")
  const chosenEntry = offered.find((entry) => entry.id === chosen)
  const makeCharWord = chosenEntry?.make_char ?? ""
  const catalog = chosenEntry?.creation
  const profiles = catalog?.profiles ?? []
  const chosenProfile = catalog?.requires_profile
    ? profiles.some((entry) => entry.id === profile)
      ? profile
      : (profiles[0]?.id ?? "")
    : ""
  const selectedProfile = profiles.find((entry) => entry.id === chosenProfile)

  if (systems.length === 0) {
    return <p className="placeholder">{t("play.character.noSystems")}</p>
  }

  const buildCommand = (): string => {
    const trimmedName = name.trim()
    if (mode === "roll") {
      if (!makeCharWord || (catalog?.requires_profile && !chosenProfile)) return ""
      return startCreationAction(chosen, chosenProfile, trimmedName)
    }
    if (mode === "describe") {
      const trimmedDescription = description.trim()
      if (!trimmedDescription) return ""
      return trimmedName
        ? `.genchar ${chosen} ${trimmedName} | ${trimmedDescription}`
        : `.genchar ${chosen} | ${trimmedDescription}`
    }
    const trimmedPath = path.trim()
    return trimmedPath ? `.import ${trimmedPath} ${chosen} pc` : ""
  }

  const submit = () => {
    const command = buildCommand()
    if (command) send(command)
  }

  const ready =
    mode === "roll"
      ? Boolean(makeCharWord) && (!catalog?.requires_profile || Boolean(chosenProfile))
      : mode === "describe"
        ? Boolean(description.trim())
        : Boolean(path.trim())

  return (
    <div className="character-create-workbench">
      <div className="play-form character-create-main">
        <div className="chip-row" role="group" aria-label={t("play.character.createMode")}>
          {(["roll", "describe", "import"] as CreateMode[]).map((value) => (
            <button
              key={value}
              type="button"
              className={value === mode ? "primary-button" : "ghost-button"}
              onClick={() => {
                setMode(value)
                if (value !== "roll") setProfile("")
              }}
            >
              {t(`play.character.mode.${value}`)}
            </button>
          ))}
        </div>
        <p className="studio-hint">{t(`play.character.mode.${mode}.hint`)}</p>

        <label className="field">
          {t("play.character.system")}
          <select
            value={chosen}
            onChange={(event) => {
              setSystem(event.target.value)
              setProfile("")
            }}
          >
            {offered.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {stripControlChars(entry.id)}
              </option>
            ))}
          </select>
        </label>

        {mode === "roll" && catalog?.requires_profile ? (
          <label className="field">
            {t("play.character.profile")}
            <select value={chosenProfile} onChange={(event) => setProfile(event.target.value)}>
              {profiles.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {mode === "import" ? (
          <label className="field">
            {t("play.character.cardPath")}
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder={t("play.character.cardPathPlaceholder")}
              spellCheck={false}
            />
          </label>
        ) : (
          <label className="field">
            {t("play.character.name")}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("play.character.namePlaceholder")}
            />
          </label>
        )}

        {mode === "describe" ? (
          <label className="field">
            {t("play.character.description")}
            <textarea
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("play.character.descriptionPlaceholder")}
            />
          </label>
        ) : null}

        <button type="button" className="primary-button" disabled={!online || !ready} onClick={submit}>
          {t("play.character.create")}
        </button>
      </div>

      <aside className="character-create-preview">
        {mode === "roll" && catalog?.presentation ? (
          <div className="play-form">
            {catalog.presentation.title ? <h4>{catalog.presentation.title}</h4> : null}
            {catalog.presentation.description ? (
              <p className="studio-hint">{catalog.presentation.description}</p>
            ) : null}
            {catalog.presentation.choice ? <p className="studio-hint">{catalog.presentation.choice}</p> : null}
            {catalog.presentation.effect ? <p className="studio-hint">{catalog.presentation.effect}</p> : null}
          </div>
        ) : null}

        {mode === "roll" && selectedProfile ? (
          <div className="play-form">
            <h4>{selectedProfile.label}</h4>
            {selectedProfile.detail?.map((text) => (
              <p className="studio-hint" key={text}>
                {text}
              </p>
            ))}
            {selectedProfile.choices?.map((group) => (
              <p className="studio-hint" key={group.id}>
                <strong>{group.label}:</strong>{" "}
                {group.options.length > 0
                  ? group.options.map((entry) => entry.label).join(" / ")
                  : t("play.character.creation.specialization")}
              </p>
            ))}
            {selectedProfile.source ? <p className="studio-hint">{selectedProfile.source}</p> : null}
          </div>
        ) : null}
      </aside>
    </div>
  )
}

function AttributeRow({ name, label, value }: { name: string; label?: string; value: unknown }) {
  const { t } = useTranslation()
  const online = useConnectionStore((s) => s.status === "online")
  const [draft, setDraft] = useState<string | null>(null)
  const visibleName = stripControlChars(label ?? name)

  if (!isEditable(value)) {
    return (
      <tr>
        <td className="play-attr-name">{visibleName}</td>
        <td>{attrText(value)}</td>
      </tr>
    )
  }

  const commit = () => {
    const next = (draft ?? "").trim()
    setDraft(null)
    if (!next || Number(next) === value || !Number.isFinite(Number(next))) return
    send(sheetWrite(name, Number(next)))
  }

  return (
    <tr>
      <td className="play-attr-name">{visibleName}</td>
      <td>
        {draft === null ? (
          <button
            type="button"
            className="ghost-button"
            disabled={!online}
            title={t("play.character.editHint")}
            onClick={() => setDraft(String(value))}
          >
            {value}
          </button>
        ) : (
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit()
              if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                setDraft(null)
              }
            }}
            aria-label={visibleName}
          />
        )}
      </td>
    </tr>
  )
}

export default function CharacterScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const game = useSessionStore((s) => s.game)
  const character = game?.character ?? null
  const creation = currentCreation(game)
  const online = useConnectionStore((s) => s.status === "online")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const presented = character as (NonNullable<typeof character> & CharacterPresentation) | null

  const attributeEditor = character ? (
    <table className="play-table">
      <tbody>
        {Object.entries(character.attributes).map(([key, value]) => (
          <AttributeRow
            key={key}
            name={key}
            label={presented?.attribute_labels?.[key]}
            value={value}
          />
        ))}
      </tbody>
    </table>
  ) : null

  const service = character ? (
    <div className="play-form">
      <p className="studio-hint">{t("play.character.editHint")}</p>
      <div className="chip-row">
        <button
          type="button"
          className="ghost-button"
          disabled={!online}
          title={t("play.character.finalizeHint")}
          onClick={() => send(".st finalize")}
        >
          {t("play.character.finalize")}
        </button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              className="primary-button"
              disabled={!online}
              onClick={() => {
                send(".st delete")
                setConfirmDelete(false)
              }}
            >
              {t("play.character.deleteConfirm")}
            </button>
            <button type="button" className="ghost-button" onClick={() => setConfirmDelete(false)}>
              {t("play.character.deleteCancel")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="ghost-button"
            disabled={!online}
            onClick={() => setConfirmDelete(true)}
          >
            {t("play.character.delete")}
          </button>
        )}
      </div>
    </div>
  ) : null

  return (
    <ScreenShell title={t("play.menu.character")} onBack={onBack}>
      {character === null ? (
        <>
          <p className="placeholder">{t("play.character.none")}</p>
          <CreateCharacter />
        </>
      ) : (
        <div className="play-character">
          <h3>
            {stripControlChars(character.name)}
            <span className="desk-tag">
              {stripControlChars(presented?.system_label ?? character.system)}
            </span>
          </h3>

          {creation && !creation.complete ? (
            <>
              <div className="play-character-meters character-resource-grid">
                {character.resources.map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} />
                ))}
              </div>
              <CreationWizard
                creation={creation}
                character={{
                  attributes: character.attributes,
                  attribute_labels: presented?.attribute_labels,
                }}
              />
              {service}
            </>
          ) : (
            <>
              {creation?.context && !creation.context.complete ? (
                <CharacterContextSetup context={creation.context} />
              ) : null}
              <CharacterSheetWorkbench
                character={{
                  attributes: character.attributes,
                  resources: character.resources,
                  status_effects: character.status_effects,
                }}
                presentation={{
                  attribute_labels: presented?.attribute_labels,
                  skills: presented?.skills,
                  skill_labels: presented?.skill_labels,
                  talents: presented?.talents,
                  equipment: presented?.equipment,
                }}
                attributeEditor={attributeEditor}
                service={service}
              />
            </>
          )}
        </div>
      )}
    </ScreenShell>
  )
}
