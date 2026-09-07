import { describe, expect, it } from "vitest"
import {
  advancementAction,
  creationStepAction,
  duplicateAction,
  layerAction,
  startCreationAction,
  type CreationDuplicateRequirement,
  type CreationLayerOption,
} from "./creation"

describe("creation action builders", () => {
  it("keeps system/profile/name in the hidden start lane", () => {
    expect(startCreationAction("dh2", "hive_world", "Acolyte Prime")).toBe(
      ".__creation_action start dh2 | hive_world | Acolyte Prime",
    )
  })

  it("builds fixed and selectable layer actions without rule-system knowledge", () => {
    const fixed: CreationLayerOption = {
      id: "home",
      label: "Home",
      fixed: true,
      choices: [{ id: "talent", label: "Talent", free: false, options: [] }],
    }
    expect(layerAction(fixed, { talent: "one" })).toBe(
      ".__creation_action create talent=one",
    )

    const selectable: CreationLayerOption = {
      id: "background",
      label: "Background",
      fixed: false,
      choices: [
        { id: "skill", label: "Skill", free: false, options: [] },
        { id: "lore", label: "Lore", free: true, options: [] },
      ],
    }
    expect(layerAction(selectable, { skill: "inquiry", lore: "Bureaucracy" })).toBe(
      ".__creation_action create background | skill=inquiry | lore=Bureaucracy",
    )
  })

  it("builds duplicate, advancement and finish actions generically", () => {
    const requirements: CreationDuplicateRequirement[] = [
      {
        field: "Aptitudes",
        count: 2,
        choices: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
    ]
    expect(duplicateAction(requirements, { Aptitudes: ["a", "b"] })).toBe(
      ".__creation_action create Aptitudes=a; b",
    )
    expect(advancementAction("characteristic", "WS")).toBe(
      ".__creation_action advance characteristic WS",
    )
    expect(creationStepAction("done")).toBe(".__creation_action create done")
  })
})
