import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { stripControlChars, type ResourceState } from "@loreweaver/protocol"
import { ResourceRow } from "./StatePanel"

export interface WorkbenchCharacter {
  attributes: Record<string, unknown>
  resources: ResourceState[]
  status_effects: string[]
}

export interface EquipmentDetail {
  kind?: string
  availability?: number
  source?: string
  help?: string
}

export interface WorkbenchPresentation {
  attribute_labels?: Record<string, string>
  attribute_help?: Record<string, string>
  skills?: Record<string, unknown>
  skill_labels?: Record<string, string>
  skill_help?: Record<string, string>
  talents?: string[]
  equipment?: string[]
  equipment_details?: Record<string, EquipmentDetail>
}

type Tab = "physical" | "skills" | "talents" | "equipment" | "status"

function text(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return stripControlChars(String(value))
}

function EmptyData() {
  const { t } = useTranslation()
  return <p className="character-empty-tab">{t("play.character.workbench.noData")}</p>
}

function HumanFigure() {
  return (
    <div className="character-figure" aria-hidden="true">
      <span className="head" />
      <span className="torso" />
      <span className="arm left" />
      <span className="arm right" />
      <span className="leg left" />
      <span className="leg right" />
    </div>
  )
}

export default function CharacterSheetWorkbench({
  character,
  presentation,
  attributeEditor,
  service,
}: {
  character: WorkbenchCharacter
  presentation?: WorkbenchPresentation
  attributeEditor?: ReactNode
  service: ReactNode
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>("physical")
  const tabs: Tab[] = ["physical", "skills", "talents", "equipment", "status"]
  const skills = presentation?.skills ?? {}
  const talents = presentation?.talents ?? []
  const equipment = presentation?.equipment ?? []

  const equipmentTitle = (item: string): string | undefined => {
    const detail = presentation?.equipment_details?.[item]
    if (!detail) return undefined
    const lines: string[] = []
    if (detail.help) lines.push(detail.help)
    if (detail.kind) {
      lines.push(
        t(`play.character.workbench.equipmentKind.${detail.kind}`, {
          defaultValue: detail.kind,
        }),
      )
    }
    if (typeof detail.availability === "number") {
      lines.push(t("play.character.workbench.equipmentAvailability", { value: detail.availability }))
    }
    if (detail.source) {
      lines.push(t("play.character.workbench.equipmentSource", { source: detail.source }))
    }
    return lines.length > 0 ? lines.join("\n") : undefined
  }

  return (
    <div className="character-sheet-workbench">
      <div>
        <nav className="character-tabs" aria-label={t("play.character.workbench.tabsLabel")}>
          {tabs.map((value) => (
            <button
              key={value}
              type="button"
              className={`character-tab-button${tab === value ? " active" : ""}`}
              onClick={() => setTab(value)}
            >
              {t(`play.character.workbench.tabs.${value}`)}
            </button>
          ))}
        </nav>

        {tab === "physical" ? (
          <div className="character-tab-panel character-physical-grid">
            <div className="character-figure-card">
              <h4>{t("play.character.workbench.figure")}</h4>
              <HumanFigure />
              <div className="character-resource-grid">
                {character.resources.map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} />
                ))}
              </div>
            </div>
            <div>
              <h4>{t("play.character.workbench.characteristics")}</h4>
              {attributeEditor ?? (
                <div className="character-attribute-grid">
                  {Object.entries(character.attributes).map(([key, value]) => (
                    <div
                      className="character-attribute-card"
                      key={key}
                      title={presentation?.attribute_help?.[key]}
                    >
                      <span>{presentation?.attribute_labels?.[key] ?? key}</span>
                      <strong>{text(value)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === "skills" ? (
          <div className="character-tab-panel">
            {Object.keys(skills).length === 0 ? (
              <EmptyData />
            ) : (
              <div className="character-attribute-grid">
                {Object.entries(skills).map(([key, value]) => (
                  <div
                    className="character-attribute-card"
                    key={key}
                    title={presentation?.skill_help?.[key]}
                  >
                    <span>{presentation?.skill_labels?.[key] ?? key}</span>
                    <strong>{text(value)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "talents" ? (
          <div className="character-tab-panel">
            {talents.length === 0 ? (
              <EmptyData />
            ) : (
              <div className="chip-row">
                {talents.map((talent, index) => (
                  <span className="chip" key={`${talent}-${index}`}>
                    {talent}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "equipment" ? (
          <div className="character-tab-panel">
            {equipment.length === 0 ? (
              <EmptyData />
            ) : (
              <div className="chip-row">
                {equipment.map((item, index) => (
                  <span className="chip" key={`${item}-${index}`} title={equipmentTitle(item)}>
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "status" ? (
          <div className="character-tab-panel">
            {character.status_effects.length === 0 ? (
              <p className="character-empty-tab">{t("play.character.workbench.noStatuses")}</p>
            ) : (
              <div className="chip-row">
                {character.status_effects.map((effect) => (
                  <span key={effect} className="chip chip-effect">
                    {stripControlChars(effect)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="character-workbench-service">{service}</div>
      </div>
    </div>
  )
}
