// My character — create it and maintain it without teaching the client any rule
// system. Creation catalogs and staged lifecycle state arrive through `state`; all
// mutations still go through the engine's deterministic command handlers via a hidden
// rich-client adapter. The Studio renders ids + labels + generic choice shapes only.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { stripControlChars } from "@loreweaver/protocol"
import { transportSend } from "../../../lib/transport"
import { useConnectionStore } from "../../../store/connection"
import { useSessionStore } from "../../../store/session"
import CharacterContextSetup from "../CharacterContextSetup"
import CreationWizard from "../CreationWizard"
import { creationSystems, currentCreation, startCreationAction } from "../creation"
import { ResourceRow } from "../StatePanel"
import ScreenShell from "./ScreenShell"
import { sheetWrite } from "./sheetWrite"

interface CharacterPresentation {
  /** Additive server presentation fields. Storage ids remain authoritative for writes. */
  system_label?: string
  attribute_labels?: Record<string, string>
}

function attrText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return stripControlChars(String(value))
}

/** Only whole numbers are `.st`-assignable; a derived object or a text field is shown
 * but not offered as an edit box, because the command would be nonsense. */
function isEditable(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function send(text: string): void {
  void transportSend({ type: "input", text }).catch(() => {
    // The transport surfaces failures through status events.
  })
}

type CreateMode = "roll" | "describe" | "import"

/** Make a character. Rolled/staged creation uses the server-advertised profile catalog;
 * describe/import remain the existing server-owned lanes. */
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
    <div className="play-form">
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
  )
}

/** One attribute row. Editing writes through `.st <name>=<value>`, which the server
 * validates against the pack's constraints and answers in the chat log — nothing is
 * assumed to have worked here; the next `state` frame is the truth. */
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
          <div className="play-character-meters">
            {character.resources.map((resource) => (
              <ResourceRow key={resource.id} resource={resource} />
            ))}
          </div>

          {creation && !creation.complete ? (
            <CreationWizard creation={creation} />
          ) : (
            <>
              {creation?.context && !creation.context.complete ? (
                <CharacterContextSetup context={creation.context} />
              ) : null}
              {character.status_effects.length > 0 ? (
                <div className="chip-row">
                  {character.status_effects.map((effect) => (
                    <span key={effect} className="chip">
                      {stripControlChars(effect)}
                    </span>
                  ))}
                </div>
              ) : null}
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
            </>
          )}
        </div>
      )}
    </ScreenShell>
  )
}
