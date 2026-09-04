// KP skills — the TUI KeeperSkills loop: list the server's keeper skills and
// toggle them per-room (enabled is per the calling keeper's room, not global).

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useAdminStore } from "../../../store/admin"
import ScreenShell from "./ScreenShell"

export default function SkillsScreen({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const skills = useAdminStore((s) => s.skills)
  const listSkills = useAdminStore((s) => s.listSkills)
  const enableSkill = useAdminStore((s) => s.enableSkill)

  useEffect(() => {
    listSkills(i18n.language)
  }, [listSkills, i18n.language])

  const localized = (id: string, field: "name" | "description", fallback: string): string => {
    const key = `play.skills.builtins.${id}.${field}`
    return i18n.exists(key) ? t(key) : fallback
  }

  const localizedRating = (rating: string): string => {
    const key = `play.skills.ratings.${rating}`
    return i18n.exists(key) ? t(key) : rating
  }

  return (
    <ScreenShell title={t("play.menu.skills")} onBack={onBack} showAdminError>
      <ul className="play-list">
        {skills.map((skill) => (
          <li key={skill.id}>
            <label className="play-skill-row">
              <input
                type="checkbox"
                checked={skill.enabled}
                onChange={(e) => enableSkill(skill.id, e.target.checked, i18n.language)}
              />
              <span className="play-skill-name">{localized(skill.id, "name", skill.name)}</span>
              {skill.content_rating ? (
                <span className="chip">{localizedRating(skill.content_rating)}</span>
              ) : null}
              <span className="play-skill-desc">
                {localized(skill.id, "description", skill.description)}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {skills.length === 0 ? <p className="placeholder">{t("play.skills.empty")}</p> : null}
    </ScreenShell>
  )
}
