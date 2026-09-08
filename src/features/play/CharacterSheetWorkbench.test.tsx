import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import "../../i18n"
import CharacterSheetWorkbench from "./CharacterSheetWorkbench"

describe("CharacterSheetWorkbench", () => {
  it("keeps physical data visible first and exposes the test tabs", async () => {
    render(
      <CharacterSheetWorkbench
        character={{
          attributes: { WS: 40 },
          resources: [{ id: "hp", label: "HP", value: 10, max: 10 }],
          status_effects: [],
        }}
        presentation={{ attribute_labels: { WS: "Weapon Skill" } }}
        attributeEditor={<button type="button">40</button>}
        service={<button type="button">Service action</button>}
      />,
    )

    expect(screen.getByRole("button", { name: "40" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Talents" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Talents" }))
    expect(screen.getByText(/server has not exposed/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Service action" })).toBeInTheDocument()
  })
})
