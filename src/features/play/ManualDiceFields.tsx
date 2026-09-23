import { useTranslation } from "react-i18next"
import type { ManualRollSpec } from "@loreweaver/protocol"
import type { DiceValues } from "./manualDice"

/** One input per physical die the server asked for. */
export default function ManualDiceFields({
  specs,
  values,
  onChange,
  disabled,
}: {
  specs: ManualRollSpec[]
  values: DiceValues
  onChange: (values: DiceValues) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const setFace = (spec: ManualRollSpec, index: number, value: string) => {
    const current = values[spec.id] ?? Array.from({ length: spec.count }, () => "")
    onChange({ ...values, [spec.id]: current.map((item, itemIndex) => (itemIndex === index ? value : item)) })
  }
  return (
    <fieldset className="combat-manual-dice">
      {specs.map((spec) => (
        <div key={spec.id}>
          <span>{t("combat.manualThrow", { label: spec.label, expression: spec.expression })}</span>
          {Array.from({ length: spec.count }, (_, index) => {
            const label = spec.count === 1 ? spec.label : t("manualRoll.die", { index: index + 1 })
            return (
              <input
                key={index}
                type="number"
                inputMode="numeric"
                min={1}
                max={spec.sides}
                step={1}
                aria-label={label}
                value={values[spec.id]?.[index] ?? ""}
                onChange={(event) => setFace(spec, index, event.target.value)}
                disabled={disabled}
              />
            )
          })}
        </div>
      ))}
    </fieldset>
  )
}
